import type { BrowserContext, Page } from "playwright";
import { cleanInstagramCaption } from "@/lib/instagram-caption";
import type { ScrapedPost, ScrapedProfileResult, ScrapeProfileInput } from "@/lib/scrapers/types";
import {
  absoluteUrl,
  firstNumber,
  parseCountNearLabel,
  readJsonScripts,
  walkJson,
} from "@/lib/scrapers/parse";

type UnknownRecord = Record<string, unknown>;
type InstagramSourceType = "grid" | "reels";
type InstagramPostLink = {
  href: string;
  label: string | null;
  viewText: string | null;
  sourceType: InstagramSourceType;
};

const INSTAGRAM_COLLECTION_LIMIT = 5;
const VIEW_LABELS = [
  "views",
  "view",
  "plays",
  "play",
  "visualizacoes",
  "visualizacao",
  "visualizações",
  "visualização",
  "reproducoes",
  "reproducao",
  "reproduções",
  "reprodução",
];
const LIKE_LABELS = ["likes", "curtidas", "curtida", "like"];
const INSTAGRAM_COUNT_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  mil: 1_000,
  m: 1_000_000,
  mi: 1_000_000,
  milhao: 1_000_000,
  milhoes: 1_000_000,
  million: 1_000_000,
  millions: 1_000_000,
  b: 1_000_000_000,
  bi: 1_000_000_000,
  bilhao: 1_000_000_000,
  bilhoes: 1_000_000_000,
  billion: 1_000_000_000,
  billions: 1_000_000_000,
};
const COMMENT_LABELS = ["comments", "comentarios", "comentario", "comentários", "comentário"];

function normalizeMetricText(value: string) {
  return value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function normalizeInstagramNumber(value: string, hasSuffix: boolean) {
  const clean = value.replace(/\s/g, "");
  const hasComma = clean.includes(",");
  const hasDot = clean.includes(".");

  if (hasComma && hasDot) {
    return clean.lastIndexOf(",") > clean.lastIndexOf(".")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean.replace(/,/g, "");
  }

  if (hasComma) {
    const [, decimal = ""] = clean.split(",");
    return hasSuffix || decimal.length <= 2 ? clean.replace(",", ".") : clean.replace(/,/g, "");
  }

  if (hasDot) {
    const [, decimal = ""] = clean.split(".");
    return !hasSuffix && decimal.length === 3 ? clean.replace(/\./g, "") : clean;
  }

  return clean;
}

function parseInstagramCountText(text: string | null | undefined) {
  if (!text) {
    return null;
  }

  const normalized = normalizeMetricText(text);
  const match = /([\d.,]+)\s*(milhoes|milhao|million|millions|bilhoes|bilhao|billion|billions|mil|mi|bi|k|m|b)?/i.exec(
    normalized,
  );

  if (!match) {
    return null;
  }

  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix ? INSTAGRAM_COUNT_MULTIPLIERS[suffix] ?? 1 : 1;
  const parsed = Number.parseFloat(normalizeInstagramNumber(match[1], Boolean(suffix)));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * multiplier);
}

function parseInstagramCountNearLabel(text: string | null | undefined, labels: string[]) {
  if (!text) {
    return null;
  }

  const normalized = normalizeMetricText(text);
  const countPattern =
    "([\\d.,]+\\s*(?:k|milhoes|milhao|million|millions|mil|mi|m|bilhoes|bilhao|billion|billions|bi|b)?)";

  for (const label of labels) {
    const normalizedLabel = normalizeMetricText(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const before = new RegExp(`${countPattern}\\s+${normalizedLabel}`, "i").exec(normalized);

    if (before) {
      return parseInstagramCountText(before[1]);
    }

    const after = new RegExp(`${normalizedLabel}\\s*[:\\-]?\\s*${countPattern}`, "i").exec(
      normalized,
    );

    if (after) {
      return parseInstagramCountText(after[1]);
    }
  }

  return null;
}

function countFromEdge(record: UnknownRecord, key: string) {
  const edge = record[key];
  if (typeof edge === "object" && edge !== null) {
    return firstNumber(edge as UnknownRecord, ["count"]);
  }

  return null;
}

function extractInstagramProfileStats(jsonRoots: unknown[]): {
  followers: number | null;
  following: number | null;
  postsCount: number | null;
} {
  let followers: number | null = null;
  let following: number | null = null;
  let postsCount: number | null = null;

  for (const root of jsonRoots) {
    walkJson(root, (record) => {
      followers ??=
        firstNumber(record, ["follower_count", "followers"]) ??
        countFromEdge(record, "edge_followed_by");
      following ??=
        firstNumber(record, ["following_count", "following"]) ??
        countFromEdge(record, "edge_follow");
      postsCount ??=
        firstNumber(record, ["media_count", "posts_count"]) ??
        countFromEdge(record, "edge_owner_to_timeline_media");
    });
  }

  return { followers, following, postsCount };
}

async function readMetaDescriptions(page: Page) {
  return page
    .locator('meta[name="description"], meta[property="og:description"], meta[property="og:title"]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("content") ?? "")
        .filter(Boolean)
        .join(" | "),
    )
    .catch(() => "");
}

function captionFromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    return cleanInstagramCaption(value);
  }

  if (typeof value === "object" && value !== null) {
    const record = value as UnknownRecord;
    return cleanInstagramCaption(firstString(record, ["text", "caption"]));
  }

  return null;
}

function captionFromEdge(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const edge = value as UnknownRecord;
  const edges = edge.edges;

  if (!Array.isArray(edges)) {
    return null;
  }

  for (const item of edges) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const node = (item as UnknownRecord).node;
    const caption = captionFromUnknown(node);

    if (caption) {
      return caption;
    }
  }

  return null;
}

function recordLooksLikeCaption(record: UnknownRecord) {
  const typename = firstString(record, ["__typename", "__is"])?.toLowerCase() ?? "";

  return (
    typename.includes("caption") ||
    "edge_media_to_caption" in record ||
    "caption_is_edited" in record
  );
}

function pickCaption(candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const cleaned = cleanInstagramCaption(candidate);

    if (cleaned) {
      return cleaned;
    }
  }

  return null;
}

function extractCaptionFromMeta(meta: string) {
  const chunks = meta.split("|").map((chunk) => chunk.trim()).filter(Boolean);
  const candidates: string[] = [];

  for (const chunk of chunks) {
    const quoted = /:\s*"([^"]+)"/.exec(chunk);
    if (quoted?.[1]) {
      candidates.push(quoted[1]);
    }

    const afterInstagram = /instagram:\s*(.+)$/i.exec(chunk);
    if (afterInstagram?.[1]) {
      candidates.push(afterInstagram[1].replace(/^"|"$/g, ""));
    }
  }

  return pickCaption(candidates);
}

async function readVisibleInstagramCaption(page: Page) {
  const candidates = await page
    .locator("article h1, main h1")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""))
    .catch(() => [] as string[]);

  return pickCaption(candidates);
}

async function readVisiblePostText(page: Page) {
  return page
    .locator("article, main")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.textContent ?? "")
        .filter(Boolean)
        .join("\n")
        .slice(0, 12_000),
    )
    .catch(() => "");
}

function parseViewsFromText(text: string | null | undefined) {
  return parseInstagramCountNearLabel(text, VIEW_LABELS);
}

function parseViewsFromReelLinkText(text: string | null | undefined) {
  return parseViewsFromText(text) ?? parseInstagramCountText(text);
}

function extractInstagramPostMetricsFromJson(jsonRoots: unknown[]): {
  likes: number | null;
  comments: number | null;
  views: number | null;
  caption: string | null;
  publishedAt: Date | null;
} {
  let likes: number | null = null;
  let comments: number | null = null;
  let views: number | null = null;
  const captionCandidates: string[] = [];
  let publishedAt: Date | null = null;

  for (const root of jsonRoots) {
    walkJson(root, (record) => {
      likes ??=
        firstNumber(record, ["like_count", "likes"]) ??
        countFromEdge(record, "edge_media_preview_like") ??
        countFromEdge(record, "edge_liked_by");
      comments ??=
        firstNumber(record, ["comment_count", "comments"]) ??
        countFromEdge(record, "edge_media_to_comment");
      views ??= firstNumber(record, [
        "video_view_count",
        "videoViewCount",
        "video_play_count",
        "videoPlayCount",
        "view_count",
        "viewCount",
        "play_count",
        "playCount",
        "ig_play_count",
        "clips_play_count",
        "fb_play_count",
        "plays",
      ]);

      const edgeCaption = captionFromEdge(record.edge_media_to_caption);
      if (edgeCaption) {
        captionCandidates.push(edgeCaption);
      }

      const directCaption = captionFromUnknown(record.caption);
      if (directCaption) {
        captionCandidates.push(directCaption);
      }

      if (recordLooksLikeCaption(record)) {
        const textCaption = captionFromUnknown(record.text);
        if (textCaption) {
          captionCandidates.push(textCaption);
        }
      }

      if (!publishedAt) {
        const timestamp = firstNumber(record, ["taken_at_timestamp", "taken_at", "created_time"]);
        publishedAt = timestamp ? new Date(timestamp * 1000) : null;
      }
    });
  }

  return { likes, comments, views, caption: pickCaption(captionCandidates), publishedAt };
}

async function scrapeInstagramPost(
  context: BrowserContext,
  url: string,
  fallbackCaption: string | null,
  sourceType: InstagramSourceType,
  fallbackViews: number | null,
) {
  const page = await context.newPage();
  page.setDefaultTimeout(16_000);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
  await page.waitForTimeout(1800);

  const meta = await readMetaDescriptions(page);
  const jsonRoots = await readJsonScripts(page);
  const fromJson = extractInstagramPostMetricsFromJson(jsonRoots);
  const visibleCaption = await readVisibleInstagramCaption(page);
  const visibleText = await readVisiblePostText(page);
  const timeValue = await page.locator("time[datetime]").first().getAttribute("datetime").catch(() => null);
  await page.close();

  return {
    externalId: /\/(?:p|reel|tv)\/([^/?#]+)/.exec(url)?.[1] ?? null,
    url,
    sourceType,
    caption: pickCaption([fromJson.caption, visibleCaption, extractCaptionFromMeta(meta), fallbackCaption]),
    publishedAt: fromJson.publishedAt ?? (timeValue ? new Date(timeValue) : null),
    metrics: {
      views: fromJson.views ?? parseViewsFromText(meta) ?? parseViewsFromText(visibleText) ?? fallbackViews,
      likes:
        fromJson.likes ??
        parseInstagramCountNearLabel(meta, LIKE_LABELS),
      comments: fromJson.comments ?? parseInstagramCountNearLabel(meta, COMMENT_LABELS),
      shares: null,
      favorites: null,
    },
  } satisfies ScrapedPost;
}

async function readInstagramPostLinks(
  page: Page,
  sourceType: InstagramSourceType,
  limit: number,
) {
  const selector =
    sourceType === "reels" ? 'a[href*="/reel/"]' : 'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]';

  const links = await page.$$eval(
    selector,
    (anchors, maxCount) => {
      const seen = new Set<string>();
      return anchors
        .map((anchor) => {
          const element = anchor as HTMLAnchorElement;
          const href = element.href;
          if (!href || seen.has(href)) {
            return null;
          }
          seen.add(href);
          const label =
            element.getAttribute("aria-label") ??
            element.querySelector("img")?.getAttribute("alt") ??
            null;
          return { href, label, viewText: element.textContent?.trim() || null };
        })
        .filter(Boolean)
        .slice(0, maxCount as number);
    },
    limit,
  );

  return links
    .filter(
      (item): item is { href: string; label: string | null; viewText: string | null } =>
        Boolean(item?.href),
    )
    .map((item) => ({
      ...item,
      sourceType,
    }));
}

async function scrapeInstagramReelsTab(
  context: BrowserContext,
  profile: ScrapeProfileInput,
  limit: number,
) {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  const reelsUrl = `${profile.url.replace(/\/$/, "")}/reels/`;
  await page.goto(reelsUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(3000);
  const links = await readInstagramPostLinks(page, "reels", limit);
  await page.close();
  return links;
}

export async function scrapeInstagramProfile(
  context: BrowserContext,
  profile: ScrapeProfileInput,
  limit: number,
): Promise<ScrapedProfileResult> {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(profile.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(3000);

  const meta = await readMetaDescriptions(page);
  const jsonRoots = await readJsonScripts(page);
  const stats = extractInstagramProfileStats(jsonRoots);

  stats.followers ??= parseCountNearLabel(meta, ["Followers", "followers", "seguidores"]);
  stats.following ??= parseCountNearLabel(meta, ["Following", "following", "seguindo"]);
  stats.postsCount ??= parseCountNearLabel(meta, ["Posts", "posts", "publicações", "publicacoes"]);

  const perCollectionLimit = Math.min(INSTAGRAM_COLLECTION_LIMIT, Math.max(1, limit));
  const gridLinks = await readInstagramPostLinks(page, "grid", perCollectionLimit);

  await page.close();

  const reelsLinks = await scrapeInstagramReelsTab(context, profile, perCollectionLimit).catch(
    () => [] as InstagramPostLink[],
  );
  const postLinks = [...gridLinks, ...reelsLinks];

  const posts: ScrapedPost[] = [];
  for (const item of postLinks) {
    const postUrl = absoluteUrl(item.href, "https://www.instagram.com");
    const fallbackViews = item.sourceType === "reels" ? parseViewsFromReelLinkText(item.viewText) : null;
    const post = await scrapeInstagramPost(
      context,
      postUrl,
      item.label ?? null,
      item.sourceType,
      fallbackViews,
    ).catch(
      () =>
        ({
          externalId: /\/(?:p|reel|tv)\/([^/?#]+)/.exec(postUrl)?.[1] ?? null,
          url: postUrl,
          sourceType: item.sourceType,
          caption: cleanInstagramCaption(item.label),
          publishedAt: null,
          metrics: { views: fallbackViews, likes: null, comments: null, shares: null, favorites: null },
        }) satisfies ScrapedPost,
    );
    posts.push(post);
  }

  return {
    followers: stats.followers,
    following: stats.following,
    postsCount: stats.postsCount,
    posts,
  };
}
