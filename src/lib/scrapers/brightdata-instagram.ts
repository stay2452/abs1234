import { INSTAGRAM_GRID_LIMIT, INSTAGRAM_REELS_LIMIT } from "@/lib/constants";
import { cleanInstagramCaption } from "@/lib/instagram-caption";
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

const DATASET_INSTAGRAM_PROFILE = "gd_l1vikfch901nx3by4";
const DATASET_INSTAGRAM_GRID = "gd_lk5ns7kz21pck8jpis";
const DATASET_INSTAGRAM_REELS = "gd_lyclm20il4r5helnj";

function instagramContentIdFromUrl(url: string | null) {
  if (!url) {
    return null;
  }

  return /\/(?:p|reel|tv)\/([^/?#]+)/i.exec(url)?.[1] ?? null;
}

function normalizeInstagramUrl(
  url: string | null,
  sourceType: "grid" | "reels",
  shortcode: string | null,
) {
  const contentId = shortcode ?? instagramContentIdFromUrl(url);
  const routeFromUrl = /\/(p|reel|tv)\//i.exec(url ?? "")?.[1]?.toLowerCase();

  if (contentId) {
    // Preserva /reel/ quando o dataset de Grade devolve um Reel no feed. Antes
    // sourceType="grid" forçava /p/, fazendo o link abrir o perfil em vez do Reel.
    const route = sourceType === "reels" ? "reel" : routeFromUrl ?? "p";
    return `https://www.instagram.com/${route}/${contentId}/`;
  }

  return null;
}

function recordId(record: BrightDataRecord) {
  const value = record.id ?? record.post_id;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function isBrightDataRecord(value: unknown): value is BrightDataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function flattenBrightDataInstagramContent(records: BrightDataRecord[]) {
  const nestedPosts = records.flatMap((record) => {
    const posts = record.posts;
    return Array.isArray(posts) ? posts.filter(isBrightDataRecord) : [];
  });

  return nestedPosts.length > 0 ? nestedPosts : records;
}

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
  // prefira message do Error bruto se o classificador ainda estiver genérico
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

function partialErrorFromDatasets(
  platform: string,
  datasets: ScrapeDatasetUsage[],
): ScrapePartialError | undefined {
  const failed = datasets.filter((dataset) => dataset.status === "failed");
  if (failed.length === 0) {
    return undefined;
  }

  // So o dataset de perfil e essencial. Grade/Reels sao opcionais (perfil so-reels
  // devolve Grade vazia; nao e falha estrutural do run).
  const essentialFailed = failed.some((dataset) => dataset.datasetId === DATASET_INSTAGRAM_PROFILE);
  const detail = failed.find((dataset) => dataset.errorMessage)?.errorMessage;
  return {
    message: `Bright Data ${platform} concluiu parcialmente. ${failed.length} dataset(s) falhou: ${detail ?? "erro do provedor."}`,
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

export function mapBrightDataInstagramProfile(records: BrightDataRecord[]) {
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
    postsCount: getBrightDataNumber(record, [
      "posts_count",
      "postsCount",
      "media_count",
      "mediaCount",
    ]),
  };
}

export function mapBrightDataInstagramPost(
  record: BrightDataRecord,
  sourceType: "grid" | "reels",
): ScrapedPost | null {
  const rawUrl = getBrightDataString(record, [
    "url",
    "post_url",
    "reel_url",
    "content_url",
    "permalink",
    "post_link",
    "link",
  ]);
  const shortcode =
    getBrightDataString(record, ["shortcode", "short_code", "code"]) ??
    instagramContentIdFromUrl(rawUrl) ??
    recordId(record);
  const url = normalizeInstagramUrl(
    rawUrl,
    sourceType,
    shortcode,
  );

  if (!url) {
    return null;
  }

  return {
    externalId: instagramContentIdFromUrl(url) ?? shortcode,
    url,
    sourceType,
    caption: cleanInstagramCaption(
      getBrightDataString(record, ["description", "caption", "text", "post_text"]),
    ),
    publishedAt: parseBrightDataDate(
      record.date_posted ?? record.datetime ?? record.timestamp ?? record.created_at ?? record.taken_at,
    ),
    metrics: {
      views: getBrightDataNumber(record, [
        "views",
        "view_count",
        "video_play_count",
        "video_view_count",
        "plays",
        "play_count",
      ]),
      likes: getBrightDataNumber(record, ["likes", "likes_count", "like_count"]),
      comments: getBrightDataNumber(record, [
        "num_comments",
        "comments",
        "comments_count",
        "comment_count",
      ]),
      shares: null,
      favorites: null,
    },
  };
}

function sortRecentPosts(posts: ScrapedPost[]) {
  return [...posts].sort((left, right) => {
    const leftTime = left.publishedAt?.getTime() ?? 0;
    const rightTime = right.publishedAt?.getTime() ?? 0;

    return rightTime - leftTime;
  });
}

/** Reparo seletivo: somente o dataset de Reels, sem perfil nem Grade. */
export async function scrapeInstagramRecentReelsWithBrightData(
  profile: ScrapeProfileInput,
  apiKey?: string | null,
) {
  const result = await scrapeBrightDataDataset(
    DATASET_INSTAGRAM_REELS,
    { url: profile.url, num_of_posts: INSTAGRAM_REELS_LIMIT },
    apiKey,
    { query: { type: "discover_new", discover_by: "url_all_reels" } },
  );

  return sortRecentPosts(
    flattenBrightDataInstagramContent(result.records)
      .map((record) => mapBrightDataInstagramPost(record, "reels"))
      .filter((post): post is ScrapedPost => post !== null),
  ).slice(0, INSTAGRAM_REELS_LIMIT);
}

/**
 * Economia de credito: exatamente 3 chamadas por perfil Instagram.
 * - Perfil: 1 registro de stats (sem lista de posts).
 * - Grade: pede ao provedor no maximo INSTAGRAM_GRID_LIMIT (5) via num_of_posts.
 * - Reels: pede ao provedor no maximo INSTAGRAM_REELS_LIMIT (5) via num_of_posts.
 * Nunca baixar o catalogo inteiro para depois filtrar. O .slice local e so trava de
 * seguranca se o provedor devolver mais do que o pedido.
 * `discover_by=url_all_reels` e o modo de descoberta da Bright Data (reels por URL
 * do perfil), nao significa "baixar todos os reels".
 */
export async function scrapeInstagramProfileWithBrightData(
  profile: ScrapeProfileInput,
  apiKey?: string | null,
  reportDataset?: DatasetProgressReporter,
): Promise<ScrapedProfileResult> {
  const datasetIds = [
    DATASET_INSTAGRAM_PROFILE,
    DATASET_INSTAGRAM_GRID,
    DATASET_INSTAGRAM_REELS,
  ];
  const settled = await Promise.allSettled([
    observeDataset(
      DATASET_INSTAGRAM_PROFILE,
      scrapeBrightDataDataset(DATASET_INSTAGRAM_PROFILE, { url: profile.url }, apiKey),
      reportDataset,
    ),
    observeDataset(
      DATASET_INSTAGRAM_GRID,
      scrapeBrightDataDataset(
        DATASET_INSTAGRAM_GRID,
        {
          url: profile.url,
          // Sem post_type: "post" — perfis so de Reels voltam dead_page e a Grade fica vazia.
          // Limite de credito no request ao provedor (nao so no persist).
          num_of_posts: INSTAGRAM_GRID_LIMIT,
        },
        apiKey,
        { query: { type: "discover_new", discover_by: "url" } },
      ),
      reportDataset,
    ),
    observeDataset(
      DATASET_INSTAGRAM_REELS,
      scrapeBrightDataDataset(
        DATASET_INSTAGRAM_REELS,
        {
          url: profile.url,
          // Limite de credito no request; url_all_reels = modo de descoberta, nao "todos".
          num_of_posts: INSTAGRAM_REELS_LIMIT,
        },
        apiKey,
        { query: { type: "discover_new", discover_by: "url_all_reels" } },
      ),
      reportDataset,
    ),
  ]);
  const [profileResult, gridResult, reelsResult] = settled;

  const datasets = settled.map((result, index) => usageFromResult(datasetIds[index], result));
  if (settled.every((result) => result.status === "rejected")) {
    const failedResult = settled.find((result) => result.status === "rejected");
    const detail = getBrightDataErrorInfo(
      failedResult?.status === "rejected" ? failedResult.reason : null,
    );
    const providerDetail =
      datasets.find((dataset) => dataset.errorMessage)?.errorMessage ?? detail.message;
    throw new ScrapeCollectionError(
      `Bright Data Instagram falhou: ${providerDetail}`,
      datasets,
      detail.code,
    );
  }

  const stats = mapBrightDataInstagramProfile(
    profileResult.status === "fulfilled" ? profileResult.value.records : [],
  );
  const profileDataFound =
    stats.followers !== null || stats.following !== null || stats.postsCount !== null;
  const gridPosts =
    gridResult.status === "fulfilled"
      ? sortRecentPosts(
          flattenBrightDataInstagramContent(gridResult.value.records)
            .map((record) => mapBrightDataInstagramPost(record, "grid"))
            .filter((post): post is ScrapedPost => post !== null),
        ).slice(0, INSTAGRAM_GRID_LIMIT)
      : [];
  const reelPosts =
    reelsResult.status === "fulfilled"
      ? sortRecentPosts(
          flattenBrightDataInstagramContent(reelsResult.value.records)
            .map((record) => mapBrightDataInstagramPost(record, "reels"))
            .filter((post): post is ScrapedPost => post !== null),
        ).slice(0, INSTAGRAM_REELS_LIMIT)
      : [];

  const usage = [
    usageWithKept(datasets[0], profileDataFound ? 1 : 0),
    usageWithKept(datasets[1], gridPosts.length),
    usageWithKept(datasets[2], reelPosts.length),
  ];

  return {
    followers: stats.followers,
    following: stats.following,
    postsCount: stats.postsCount,
    posts: [...gridPosts, ...reelPosts],
    profileDataFound,
    datasets: usage,
    partialError: partialErrorFromDatasets("Instagram", usage),
  };
}
