import type { ScrapedPost, ScrapedProfileResult, ScrapeProfileInput } from "@/lib/scrapers/types";
import { numberFromUnknown } from "@/lib/scrapers/parse";

const BRIGHTDATA_API_BASE = "https://api.brightdata.com/datasets/v3";
const DATASET_TIKTOK_PROFILE = "gd_l1villgoiiidt09ci";
const DATASET_TIKTOK_POSTS_BY_PROFILE = "gd_m7n5v2gq296pex2f5m";
const DEFAULT_TIMEOUT_MS = 120_000;
const SNAPSHOT_POLL_ATTEMPTS = 60;
const SNAPSHOT_POLL_DELAY_MS = 5_000;

type UnknownRecord = Record<string, unknown>;

function brightDataApiKey() {
  return process.env.BRIGHTDATA_API_KEY?.trim() ?? "";
}

export function isBrightDataTikTokEnabled() {
  return Boolean(brightDataApiKey()) && process.env.BRIGHTDATA_TIKTOK_ENABLED === "true";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function getNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = numberFromUnknown(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function parseDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 10_000_000_000 ? value : value * 1000);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Resposta da Bright Data nao veio em JSON valido.");
  }
}

async function brightDataFetch(path: string, init?: RequestInit) {
  const apiKey = brightDataApiKey();

  if (!apiKey) {
    throw new Error("BRIGHTDATA_API_KEY nao configurada.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${BRIGHTDATA_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Bright Data HTTP ${response.status}: ${text.slice(0, 240)}`);
    }

    return parseJson(text);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Bright Data demorou demais para responder.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadSnapshot(snapshotId: string) {
  return brightDataFetch(`/snapshot/${encodeURIComponent(snapshotId)}?format=json`);
}

async function waitForSnapshot(snapshotId: string) {
  for (let attempt = 0; attempt < SNAPSHOT_POLL_ATTEMPTS; attempt += 1) {
    const progress = await brightDataFetch(`/progress/${encodeURIComponent(snapshotId)}`);

    if (
      typeof progress === "object" &&
      progress !== null &&
      (progress as UnknownRecord).status === "ready"
    ) {
      return downloadSnapshot(snapshotId);
    }

    if (
      typeof progress === "object" &&
      progress !== null &&
      (progress as UnknownRecord).status === "failed"
    ) {
      throw new Error(`Bright Data snapshot falhou: ${JSON.stringify(progress).slice(0, 240)}`);
    }

    await sleep(SNAPSHOT_POLL_DELAY_MS);
  }

  throw new Error("Bright Data ainda nao concluiu o snapshot.");
}

async function scrapeDataset(datasetId: string, url: string) {
  const result = await brightDataFetch(`/scrape?dataset_id=${datasetId}&format=json`, {
    method: "POST",
    body: JSON.stringify([{ url }]),
  });

  if (Array.isArray(result)) {
    return result.filter((item): item is UnknownRecord => typeof item === "object" && item !== null);
  }

  if (typeof result === "object" && result !== null) {
    const snapshotId = (result as UnknownRecord).snapshot_id;
    if (typeof snapshotId === "string" && snapshotId) {
      const snapshot = await waitForSnapshot(snapshotId);
      return Array.isArray(snapshot)
        ? snapshot.filter((item): item is UnknownRecord => typeof item === "object" && item !== null)
        : [];
    }
  }

  return [];
}

export function mapBrightDataTikTokProfile(records: UnknownRecord[]) {
  const record = records[0] ?? {};

  return {
    followers: getNumber(record, [
      "followers",
      "followers_count",
      "follower_count",
      "followerCount",
    ]),
    following: getNumber(record, [
      "following",
      "following_count",
      "followingCount",
    ]),
    postsCount: getNumber(record, [
      "videos_count",
      "video_count",
      "videoCount",
      "posts_count",
    ]),
  };
}

export function mapBrightDataTikTokPost(record: UnknownRecord, handle: string): ScrapedPost | null {
  const url = getString(record, ["url", "post_url", "video_url", "share_url"]);
  const externalId = url ? /\/video\/(\d+)/.exec(url)?.[1] ?? null : getString(record, ["id", "video_id"]);

  if (!url && !externalId) {
    return null;
  }

  return {
    externalId,
    url: url ?? `https://www.tiktok.com/@${handle}/video/${externalId}`,
    sourceType: "video",
    caption: getString(record, ["description", "caption", "desc", "text"]),
    publishedAt: parseDate(
      record.date_posted ?? record.create_time ?? record.created_at ?? record.timestamp,
    ),
    metrics: {
      views: getNumber(record, ["views", "view_count", "play_count", "plays"]),
      likes: getNumber(record, ["likes", "like_count", "digg_count"]),
      comments: getNumber(record, ["comments", "comment_count"]),
      shares: getNumber(record, ["shares", "share_count"]),
      favorites: getNumber(record, ["favorites", "collect_count", "favorite_count"]),
    },
  };
}

export async function scrapeTikTokProfileWithBrightData(
  profile: ScrapeProfileInput,
  limit: number,
): Promise<ScrapedProfileResult> {
  try {
    const [profileRecords, postRecords] = await Promise.all([
      scrapeDataset(DATASET_TIKTOK_PROFILE, profile.url),
      scrapeDataset(DATASET_TIKTOK_POSTS_BY_PROFILE, profile.url),
    ]);
    const stats = mapBrightDataTikTokProfile(profileRecords);
    const posts = postRecords
      .map((record) => mapBrightDataTikTokPost(record, profile.handle))
      .filter((post): post is ScrapedPost => post !== null)
      .slice(0, limit);

    return {
      followers: stats.followers,
      following: stats.following,
      postsCount: stats.postsCount,
      posts,
    };
  } catch (error) {
    throw new Error(`Bright Data TikTok falhou: ${errorMessage(error)}`);
  }
}
