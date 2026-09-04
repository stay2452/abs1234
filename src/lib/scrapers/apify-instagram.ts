import { INSTAGRAM_GRID_LIMIT, INSTAGRAM_REELS_LIMIT } from "@/lib/constants";
import { cleanInstagramCaption } from "@/lib/instagram-caption";
import {
  getApifyErrorInfo,
  getApifyNumber,
  getApifyString,
  parseApifyDate,
  scrapeApifyActor,
} from "@/lib/scrapers/apify-client";
import {
  ScrapeCollectionError,
  type DatasetProgressReporter,
  type ScrapeDatasetUsage,
  type ScrapePartialError,
  type ScrapedPost,
  type ScrapedProfileResult,
  type ScrapeProfileInput,
} from "@/lib/scrapers/types";

const ACTOR_PROFILE = "apify/instagram-profile-scraper";
const ACTOR_POST = "apify/instagram-post-scraper";
const ACTOR_REEL = "apify/instagram-reel-scraper";

function usageFromResult(actor: string, result: PromiseSettledResult<{ records: unknown[]; requestsMade: number }>): ScrapeDatasetUsage {
  if (result.status === "fulfilled") {
    return { datasetId: actor, status: "success", requestsMade: result.value.requestsMade, recordsReceived: result.value.records.length, recordsKept: 0 };
  }
  const detail = getApifyErrorInfo(result.reason);
  const raw = result.reason instanceof Error && result.reason.message.trim() ? result.reason.message.trim().slice(0, 480) : null;
  const msg = detail.message && !/falha desconhecida/i.test(detail.message) ? detail.message : raw ?? detail.message;
  return { datasetId: actor, status: "failed", requestsMade: 1, recordsReceived: 0, recordsKept: 0, errorCode: detail.code, errorMessage: msg };
}

function usageWithKept(usage: ScrapeDatasetUsage, kept: number) {
  if (usage.status !== "success") return usage;
  return { ...usage, recordsKept: Math.min(usage.recordsReceived, kept) };
}

function partialErrorFromDatasets(datasets: ScrapeDatasetUsage[]): ScrapePartialError | undefined {
  const failed = datasets.filter((d) => d.status === "failed");
  if (failed.length === 0) return undefined;
  const essentialFailed = failed.some((d) => d.datasetId === ACTOR_PROFILE);
  const detail = failed.find((d) => d.errorMessage)?.errorMessage;
  return { message: `Apify Instagram concluiu parcialmente. ${failed.length} actor(s) falhou: ${detail ?? "erro do provedor."}`, errorCode: failed.find((d) => d.errorCode)?.errorCode ?? "provider", essential: essentialFailed };
}

function observe<T extends { records: unknown[]; requestsMade: number }>(
  actor: string,
  promise: Promise<T>,
  report?: DatasetProgressReporter,
) {
  if (!report) return promise;
  return promise.then(
    async (r) => {
      await report({ datasetId: actor, status: "success", recordsReceived: r.records.length });
      return r;
    },
    async (e) => {
      await report({ datasetId: actor, status: "failed", recordsReceived: 0, errorCode: getApifyErrorInfo(e).code });
      throw e;
    },
  );
}

export function mapApifyProfile(records: unknown[]) {
  const r = (records[0] ?? {}) as Record<string, unknown>;
  return {
    followers: getApifyNumber(r as never, ["followersCount", "followers", "followerCount", "edge_followed_by.count"]),
    following: getApifyNumber(r as never, ["followsCount", "following", "followingCount", "edge_follow.count"]),
    postsCount: getApifyNumber(r as never, ["postsCount", "mediaCount", "edge_owner_to_timeline_media.count"]),
  };
}

function instagramIdFromUrl(url: string | null) {
  if (!url) return null;
  return /\/(?:p|reel|tv)\/([^/?#]+)/i.exec(url)?.[1] ?? null;
}

export function mapApifyPost(record: Record<string, unknown>, sourceType: "grid" | "reels"): ScrapedPost | null {
  const rawUrl = getApifyString(record as never, ["url", "postUrl", "reelUrl", "permalink", "link", "displayUrl"]);
  const shortcode = getApifyString(record as never, ["shortCode", "shortcode", "code", "id"]) ?? instagramIdFromUrl(rawUrl);
  let url = rawUrl;
  if (!url && shortcode) url = `https://www.instagram.com/${sourceType === "reels" ? "reel" : "p"}/${shortcode}/`;
  if (!url) return null;

  // Views: Apify usa vários nomes
  const views = getApifyNumber(record as never, [
    "videoViewCount",
    "viewCount",
    "views",
    "playCount",
    "plays",
    "videoPlayCount",
    "view_count",
    "video_view_count",
  ]);

  return {
    externalId: instagramIdFromUrl(url) ?? shortcode ?? null,
    url,
    sourceType,
    caption: cleanInstagramCaption(getApifyString(record as never, ["caption", "text", "description"]) ?? null),
    publishedAt: parseApifyDate(record.timestamp ?? record.takenAt ?? record.publishedAt ?? (record as { takenAtTimestamp?: number }).takenAtTimestamp ?? record.datetime),
    metrics: {
      views,
      likes: getApifyNumber(record as never, ["likesCount", "likes", "likeCount", "likes_count"]),
      comments: getApifyNumber(record as never, ["commentsCount", "comments", "commentCount", "comments_count"]),
      shares: null,
      favorites: null,
    },
  };
}

function sortRecent(posts: ScrapedPost[]) {
  return [...posts].sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
}

export async function scrapeInstagramProfileWithApify(
  profile: ScrapeProfileInput,
  token?: string | null,
  reportDataset?: DatasetProgressReporter,
  signal?: AbortSignal,
): Promise<ScrapedProfileResult> {
  const handle = profile.handle.replace(/^@/, "").trim();
  const settled = await Promise.allSettled([
    observe(ACTOR_PROFILE, scrapeApifyActor(ACTOR_PROFILE, { usernames: [handle] }, token, { signal }), reportDataset),
    observe(ACTOR_POST, scrapeApifyActor(ACTOR_POST, { username: [handle], resultsLimit: INSTAGRAM_GRID_LIMIT }, token, { signal }), reportDataset),
    observe(ACTOR_REEL, scrapeApifyActor(ACTOR_REEL, { username: [handle], resultsLimit: INSTAGRAM_REELS_LIMIT }, token, { signal }), reportDataset),
  ]);
  const [profileRes, gridRes, reelsRes] = settled;
  const datasets = settled.map((r, i) => usageFromResult([ACTOR_PROFILE, ACTOR_POST, ACTOR_REEL][i], r as PromiseSettledResult<{ records: unknown[]; requestsMade: number }>));
  if (settled.every((r) => r.status === "rejected")) {
    const failed = settled.find((r) => r.status === "rejected") as PromiseRejectedResult;
    const detail = getApifyErrorInfo(failed.reason);
    throw new ScrapeCollectionError(`Apify Instagram falhou: ${detail.message}`, datasets, detail.code);
  }

  const stats = mapApifyProfile(profileRes.status === "fulfilled" ? profileRes.value.records : []);
  const profileDataFound = stats.followers !== null || stats.following !== null || stats.postsCount !== null;
  const gridPosts = gridRes.status === "fulfilled" ? sortRecent((gridRes.value.records as Record<string, unknown>[]).map((r) => mapApifyPost(r, "grid")).filter((p): p is ScrapedPost => p !== null)).slice(0, INSTAGRAM_GRID_LIMIT) : [];
  const reelPosts = reelsRes.status === "fulfilled" ? sortRecent((reelsRes.value.records as Record<string, unknown>[]).map((r) => mapApifyPost(r, "reels")).filter((p): p is ScrapedPost => p !== null)).slice(0, INSTAGRAM_REELS_LIMIT) : [];

  const usage = [usageWithKept(datasets[0], profileDataFound ? 1 : 0), usageWithKept(datasets[1], gridPosts.length), usageWithKept(datasets[2], reelPosts.length)];

  return {
    followers: stats.followers,
    following: stats.following,
    postsCount: stats.postsCount,
    posts: [...gridPosts, ...reelPosts],
    profileDataFound,
    datasets: usage,
    partialError: partialErrorFromDatasets(usage),
  };
}

/** Reparo seletivo: só reels */
export async function scrapeInstagramRecentReelsWithApify(profile: ScrapeProfileInput, token?: string | null, signal?: AbortSignal) {
  const handle = profile.handle.replace(/^@/, "").trim();
  const result = await scrapeApifyActor(ACTOR_REEL, { username: [handle], resultsLimit: INSTAGRAM_REELS_LIMIT }, token, { signal });
  return (result.records as Record<string, unknown>[])
    .map((r) => mapApifyPost(r, "reels"))
    .filter((p): p is ScrapedPost => p !== null)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, INSTAGRAM_REELS_LIMIT);
}
