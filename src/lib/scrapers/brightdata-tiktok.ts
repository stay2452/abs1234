import { TIKTOK_VIDEO_LIMIT } from "@/lib/constants";
import {
  type BrightDataDatasetResult,
  type BrightDataRecord,
  getBrightDataErrorInfo,
  getBrightDataNumber,
  getBrightDataString,
  parseBrightDataDate,
  scrapeBrightDataDataset,
} from "@/lib/scrapers/brightdata-client";
import {
  ScrapeCollectionError,
  type ScrapeDatasetUsage,
  type DatasetProgressReporter,
  type ScrapePartialError,
  type ScrapedPost,
  type ScrapedProfileResult,
  type ScrapeProfileInput,
} from "@/lib/scrapers/types";

const DATASET_TIKTOK_PROFILE = "gd_l1villgoiiidt09ci";
const DATASET_TIKTOK_POSTS_BY_PROFILE = "gd_m7n5v2gq296pex2f5m";

function usageFromResult(
  datasetId: string,
  result: PromiseSettledResult<BrightDataDatasetResult>,
): ScrapeDatasetUsage {
  if (result.status === "fulfilled") {
    return {
      datasetId,
      status: "success",
      requestsMade: result.value.requestsMade,
      recordsReceived: result.value.records.length,
      recordsKept: 0,
    };
  }

  const detail = getBrightDataErrorInfo(result.reason);
  const raw =
    result.reason instanceof Error && result.reason.message.trim()
      ? result.reason.message.trim().slice(0, 480)
      : null;
  const errorMessage =
    detail.message && !/falha desconhecida/i.test(detail.message)
      ? detail.message
      : raw ?? detail.message;

  return {
    datasetId,
    status: "failed",
    requestsMade: 1,
    recordsReceived: 0,
    recordsKept: 0,
    errorCode: detail.code,
    errorMessage,
  };
}

function usageWithKept(usage: ScrapeDatasetUsage, recordsKept: number) {
  if (usage.status !== "success") {
    return usage;
  }

  return {
    ...usage,
    recordsKept: Math.min(usage.recordsReceived, recordsKept),
  };
}

function partialErrorFromDatasets(datasets: ScrapeDatasetUsage[]): ScrapePartialError | undefined {
  const failed = datasets.filter((dataset) => dataset.status === "failed");
  if (failed.length === 0) {
    return undefined;
  }

  // So o dataset de perfil e essencial. Videos sao opcionais (conta sem videos
  // publicados devolve vazio — nao e falha estrutural do run).
  const essentialFailed = failed.some((dataset) => dataset.datasetId === DATASET_TIKTOK_PROFILE);
  const detail = failed.find((dataset) => dataset.errorMessage)?.errorMessage;
  return {
    message: `Bright Data TikTok concluiu parcialmente. ${failed.length} dataset(s) falhou: ${detail ?? "erro do provedor."}`,
    errorCode: failed.find((dataset) => dataset.errorCode)?.errorCode ?? "provider",
    essential: essentialFailed,
  };
}

function observeDataset<T extends BrightDataDatasetResult>(
  datasetId: string,
  promise: Promise<T>,
  report?: DatasetProgressReporter,
) {
  if (!report) {
    return promise;
  }

  return promise.then(
    async (result) => {
      await report({ datasetId, status: "success", recordsReceived: result.records.length });
      return result;
    },
    async (error) => {
      await report({
        datasetId,
        status: "failed",
        recordsReceived: 0,
        errorCode: getBrightDataErrorInfo(error).code,
      });
      throw error;
    },
  );
}

export function mapBrightDataTikTokProfile(records: BrightDataRecord[]) {
  const record = records[0] ?? {};

  return {
    followers: getBrightDataNumber(record, [
      "followers",
      "followers_count",
      "follower_count",
      "followerCount",
    ]),
    following: getBrightDataNumber(record, [
      "following",
      "following_count",
      "followingCount",
    ]),
    likes: getBrightDataNumber(record, [
      "likes",
      "likes_count",
      "heart_count",
      "heartCount",
    ]),
    postsCount: getBrightDataNumber(record, [
      "videos_count",
      "video_count",
      "videoCount",
      "posts_count",
    ]),
  };
}

function getRecordId(record: BrightDataRecord) {
  for (const key of ["post_id", "video_id", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function publicTikTokPostUrl(value: string | null) {
  if (!value || !/tiktok\.com\/@[^/?#]+\/video\/\d+/i.test(value)) {
    return null;
  }

  return value;
}

function profileHandleFromUrl(value: string | null) {
  return value ? /tiktok\.com\/@([^/?#]+)/i.exec(value)?.[1] ?? null : null;
}

export function mapBrightDataTikTokPost(record: BrightDataRecord, handle: string): ScrapedPost | null {
  const url = publicTikTokPostUrl(
    getBrightDataString(record, ["url", "post_url", "share_url", "permalink"]),
  );
  const externalId = /\/video\/(\d+)/.exec(url ?? "")?.[1] ?? getRecordId(record);
  const profileHandle =
    getBrightDataString(record, ["profile_username", "author", "user_posted", "username"]) ??
    profileHandleFromUrl(getBrightDataString(record, ["profile_url"])) ??
    handle;

  if (!externalId || !profileHandle) {
    return null;
  }

  return {
    externalId,
    url: url ?? `https://www.tiktok.com/@${profileHandle}/video/${externalId}`,
    sourceType: "video",
    caption: getBrightDataString(record, ["description", "caption", "desc", "text"]),
    publishedAt: parseBrightDataDate(
      record.date_posted ?? record.create_time ?? record.created_at ?? record.timestamp,
    ),
    metrics: {
      views: getBrightDataNumber(record, ["views", "view_count", "play_count", "plays"]),
      likes: getBrightDataNumber(record, ["likes", "like_count", "digg_count"]),
      comments: getBrightDataNumber(record, ["comments", "comment_count"]),
      shares: getBrightDataNumber(record, ["shares", "share_count"]),
      favorites: getBrightDataNumber(record, ["favorites", "collect_count", "favorite_count"]),
    },
  };
}

/** Reparo seletivo: somente videos recentes, sem coleta de perfil. */
export async function scrapeTikTokRecentVideosWithBrightData(
  profile: ScrapeProfileInput,
  apiKey?: string | null,
  signal?: AbortSignal,
) {
  const result = await scrapeBrightDataDataset(
    DATASET_TIKTOK_POSTS_BY_PROFILE,
    { url: profile.url, num_of_posts: TIKTOK_VIDEO_LIMIT },
    apiKey,
    { signal },
  );

  return result.records
    .map((record) => mapBrightDataTikTokPost(record, profile.handle))
    .filter((post): post is ScrapedPost => post !== null)
    .slice(0, TIKTOK_VIDEO_LIMIT);
}

export async function scrapeTikTokProfileWithBrightData(
  profile: ScrapeProfileInput,
  apiKey?: string | null,
  reportDataset?: DatasetProgressReporter,
  signal?: AbortSignal,
): Promise<ScrapedProfileResult> {
  const datasetIds = [DATASET_TIKTOK_PROFILE, DATASET_TIKTOK_POSTS_BY_PROFILE];
  const settled = await Promise.allSettled([
    observeDataset(
      DATASET_TIKTOK_PROFILE,
      scrapeBrightDataDataset(DATASET_TIKTOK_PROFILE, { url: profile.url }, apiKey, { signal }),
      reportDataset,
    ),
    observeDataset(
      DATASET_TIKTOK_POSTS_BY_PROFILE,
      scrapeBrightDataDataset(
        DATASET_TIKTOK_POSTS_BY_PROFILE,
        { url: profile.url, num_of_posts: TIKTOK_VIDEO_LIMIT },
        apiKey,
        { signal },
      ),
      reportDataset,
    ),
  ]);
  const [profileResult, postsResult] = settled;

  const datasets = settled.map((result, index) => usageFromResult(datasetIds[index], result));
  if (settled.every((result) => result.status === "rejected")) {
    const failedResult = settled.find((result) => result.status === "rejected");
    const detail = getBrightDataErrorInfo(
      failedResult?.status === "rejected" ? failedResult.reason : null,
    );
    throw new ScrapeCollectionError(
      "Bright Data TikTok falhou.",
      datasets,
      detail.code,
    );
  }

  const stats = mapBrightDataTikTokProfile(
    profileResult.status === "fulfilled" ? profileResult.value.records : [],
  );
  const profileDataFound =
    stats.followers !== null ||
    stats.following !== null ||
    stats.likes !== null ||
    stats.postsCount !== null;
  const posts =
    postsResult.status === "fulfilled"
      ? postsResult.value.records
          .map((record) => mapBrightDataTikTokPost(record, profile.handle))
          .filter((post): post is ScrapedPost => post !== null)
          .sort((left, right) => {
            const leftTime = left.publishedAt?.getTime() ?? 0;
            const rightTime = right.publishedAt?.getTime() ?? 0;

            return rightTime - leftTime;
          })
          .slice(0, TIKTOK_VIDEO_LIMIT)
      : [];

  const usage = [
    usageWithKept(datasets[0], profileDataFound ? 1 : 0),
    usageWithKept(datasets[1], posts.length),
  ];

  return {
    followers: stats.followers,
    following: stats.following,
    likes: stats.likes,
    postsCount: stats.postsCount,
    posts,
    profileDataFound,
    datasets: usage,
    partialError: partialErrorFromDatasets(usage),
  };
}
