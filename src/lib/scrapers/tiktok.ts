import type { BrowserContext } from "playwright";
import type { ScrapedPost, ScrapedProfileResult, ScrapeProfileInput } from "@/lib/scrapers/types";
import {
  absoluteUrl,
  firstNumber,
  numberFromUnknown,
  parseCountText,
  readJsonScripts,
  walkJson,
} from "@/lib/scrapers/parse";

type UnknownRecord = Record<string, unknown>;

function getStats(record: UnknownRecord) {
  const stats =
    typeof record.stats === "object" && record.stats !== null
      ? (record.stats as UnknownRecord)
      : typeof record.statistics === "object" && record.statistics !== null
        ? (record.statistics as UnknownRecord)
        : record;

  return {
    views: firstNumber(stats, ["playCount", "play_count", "viewCount", "view_count"]),
    likes: firstNumber(stats, ["diggCount", "digg_count", "likeCount", "like_count"]),
    comments: firstNumber(stats, ["commentCount", "comment_count"]),
    shares: firstNumber(stats, ["shareCount", "share_count"]),
    favorites: firstNumber(stats, ["collectCount", "collect_count", "favoriteCount"]),
  };
}

function extractTikTokStats(jsonRoots: unknown[]): {
  followers: number | null;
  following: number | null;
  postsCount: number | null;
} {
  let followers: number | null = null;
  let following: number | null = null;
  let postsCount: number | null = null;

  for (const root of jsonRoots) {
    walkJson(root, (record) => {
      const followerCount = firstNumber(record, ["followerCount", "follower_count", "followers"]);
      const followingCount = firstNumber(record, ["followingCount", "following_count", "following"]);
      const videoCount = firstNumber(record, ["videoCount", "video_count"]);

      followers ??= followerCount;
      following ??= followingCount;
      postsCount ??= videoCount;
    });
  }

  return { followers, following, postsCount };
}

function extractTikTokPosts(jsonRoots: unknown[], handle: string, limit: number) {
  const posts = new Map<string, ScrapedPost>();

  for (const root of jsonRoots) {
    walkJson(root, (record) => {
      const idValue = record.id ?? record.video_id ?? record.item_id;
      const id = typeof idValue === "string" || typeof idValue === "number" ? String(idValue) : null;
      const hasVideoSignal =
        firstNumber(record, ["createTime", "create_time"]) !== null ||
        typeof record.desc === "string" ||
        typeof record.description === "string" ||
        getStats(record).views !== null;

      if (!id || id.length < 8 || !hasVideoSignal || posts.has(id)) {
        return;
      }

      const createTime = firstNumber(record, ["createTime", "create_time"]);
      const metrics = getStats(record);
      const caption =
        typeof record.desc === "string"
          ? record.desc
          : typeof record.description === "string"
            ? record.description
            : typeof record.video_description === "string"
              ? record.video_description
              : null;
      const rawUrl =
        typeof record.url === "string"
          ? record.url
          : typeof record.shareUrl === "string"
            ? record.shareUrl
            : `https://www.tiktok.com/@${handle}/video/${id}`;

      posts.set(id, {
      externalId: id,
      url: rawUrl,
      sourceType: "video",
      caption,
        publishedAt: createTime ? new Date(createTime * 1000) : null,
        metrics,
      });
    });
  }

  return [...posts.values()].slice(0, limit);
}

async function extractTikTokPostsFromDom(pageUrl: string, context: BrowserContext, limit: number) {
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);

  const posts = await page.$$eval(
    'a[href*="/video/"]',
    (anchors, maxCount) => {
      const seen = new Set<string>();
      return anchors
        .map((anchor) => {
          const url = (anchor as HTMLAnchorElement).href;
          if (!url || seen.has(url)) {
            return null;
          }
          seen.add(url);
          const text = anchor.textContent ?? "";
          return { url, text };
        })
        .filter(Boolean)
        .slice(0, maxCount as number);
    },
    limit,
  );

  await page.close();

  return posts.map((post) => {
    const id = /\/video\/(\d+)/.exec(post?.url ?? "")?.[1] ?? null;
    return {
      externalId: id,
      url: absoluteUrl(post?.url ?? "", "https://www.tiktok.com"),
      sourceType: "video",
      caption: null,
      publishedAt: null,
      metrics: {
        views: parseCountText(post?.text ?? ""),
        likes: null,
        comments: null,
        shares: null,
        favorites: null,
      },
    } satisfies ScrapedPost;
  });
}

export async function scrapeTikTokProfile(
  context: BrowserContext,
  profile: ScrapeProfileInput,
  limit: number,
): Promise<ScrapedProfileResult> {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(profile.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(3000);

  const jsonRoots = await readJsonScripts(page);
  const stats = extractTikTokStats(jsonRoots);
  let posts = extractTikTokPosts(jsonRoots, profile.handle, limit);

  if (stats.followers === null) {
    const followerText = await page
      .locator('[data-e2e="followers-count"], strong:near(:text("Followers"))')
      .first()
      .textContent()
      .catch(() => null);
    stats.followers = numberFromUnknown(followerText);
  }

  await page.close();

  if (posts.length === 0) {
    posts = await extractTikTokPostsFromDom(profile.url, context, limit);
  }

  return {
    followers: stats.followers,
    following: stats.following,
    postsCount: stats.postsCount,
    posts,
  };
}
