import type { Platform, PostMetric, ProfileMetric, RankingPeriod } from "@/lib/constants";
import { toNumber } from "@/lib/format";

type ProfileSnapshotLike = {
  followers: bigint | number | null;
  capturedAt: Date;
};

type ProfileLike = {
  id: string;
  platform: string;
  handle: string;
  url: string;
  tags: string | null;
  notes: string | null;
  snapshots: ProfileSnapshotLike[];
};

type PostSnapshotLike = {
  views: bigint | number | null;
  likes: bigint | number | null;
  comments: bigint | number | null;
  shares: bigint | number | null;
  favorites?: bigint | number | null;
  capturedAt: Date;
};

type PostLike = {
  id: string;
  platform: string;
  url: string;
  caption: string | null;
  publishedAt: Date | null;
  profile: {
    id: string;
    handle: string;
    platform: string;
    tags: string | null;
  };
  snapshots: PostSnapshotLike[];
};

export type ProfileRankingItem = {
  id: string;
  type: "profile";
  platform: string;
  handle: string;
  url: string;
  tags: string | null;
  followers: number | null;
  baselineFollowers: number | null;
  growthAbsolute: number | null;
  growthPercent: number | null;
  capturedAt: string | null;
  score: number | null;
};

export type PostRankingItem = {
  id: string;
  type: "post";
  platform: string;
  url: string;
  caption: string | null;
  publishedAt: string | null;
  profile: {
    id: string;
    handle: string;
    platform: string;
    tags: string | null;
  };
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number | null;
  capturedAt: string | null;
  score: number | null;
};

export function getPeriodCutoff(period: RankingPeriod, now = new Date()) {
  const daysByPeriod: Record<Exclude<RankingPeriod, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  };

  if (period === "all") {
    return null;
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - daysByPeriod[period]);
  return cutoff;
}

function sortByCapturedAt<T extends { capturedAt: Date }>(items: T[]) {
  return [...items].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
}

function latestInPeriod<T extends { capturedAt: Date }>(items: T[], cutoff: Date | null) {
  const filtered = cutoff ? items.filter((item) => item.capturedAt >= cutoff) : items;
  return sortByCapturedAt(filtered).at(-1) ?? null;
}

export function rankProfiles(
  profiles: ProfileLike[],
  metric: ProfileMetric,
  period: RankingPeriod,
  platform: Platform | "all" = "all",
  now = new Date(),
) {
  const cutoff = getPeriodCutoff(period, now);

  return profiles
    .filter((profile) => platform === "all" || profile.platform === platform)
    .map<ProfileRankingItem>((profile) => {
      const snapshots = sortByCapturedAt(profile.snapshots).filter(
        (snapshot) => snapshot.followers !== null,
      );
      const latest = latestInPeriod(snapshots, null);
      const periodSnapshots = cutoff
        ? snapshots.filter((snapshot) => snapshot.capturedAt >= cutoff)
        : snapshots;
      const baseline = periodSnapshots[0] ?? null;
      const hasComparablePoints =
        latest && baseline && latest.capturedAt.getTime() !== baseline.capturedAt.getTime();
      const followers = toNumber(latest?.followers);
      const baselineFollowers = hasComparablePoints ? toNumber(baseline.followers) : null;
      const growthAbsolute =
        followers !== null && baselineFollowers !== null ? followers - baselineFollowers : null;
      const growthPercent =
        growthAbsolute !== null && baselineFollowers && baselineFollowers > 0
          ? (growthAbsolute / baselineFollowers) * 100
          : null;
      const score = metric === "followers_percent" ? growthPercent : growthAbsolute;

      return {
        id: profile.id,
        type: "profile",
        platform: profile.platform,
        handle: profile.handle,
        url: profile.url,
        tags: profile.tags,
        followers,
        baselineFollowers,
        growthAbsolute,
        growthPercent,
        capturedAt: latest?.capturedAt.toISOString() ?? null,
        score,
      };
    })
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

export function rankPosts(
  posts: PostLike[],
  metric: PostMetric,
  period: RankingPeriod,
  platform: Platform | "all" = "all",
  now = new Date(),
) {
  const cutoff = getPeriodCutoff(period, now);

  return posts
    .filter((post) => platform === "all" || post.platform === platform)
    .map<PostRankingItem | null>((post) => {
      const snapshot = latestInPeriod(post.snapshots, cutoff);

      if (!snapshot) {
        return null;
      }

      const views = toNumber(snapshot.views);
      const likes = toNumber(snapshot.likes);
      const comments = toNumber(snapshot.comments);
      const shares = toNumber(snapshot.shares);
      const favorites = toNumber(snapshot.favorites);
      const engagementParts = [likes, comments, shares, favorites].filter(
        (value): value is number => value !== null,
      );
      const engagement =
        engagementParts.length > 0
          ? engagementParts.reduce((sum, value) => sum + value, 0)
          : null;
      const score =
        metric === "engagement"
          ? engagement
          : ({
              views,
              likes,
              comments,
              shares,
            } satisfies Record<Exclude<PostMetric, "engagement">, number | null>)[metric];

      return {
        id: post.id,
        type: "post",
        platform: post.platform,
        url: post.url,
        caption: post.caption,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        profile: post.profile,
        views,
        likes,
        comments,
        shares,
        engagement,
        capturedAt: snapshot.capturedAt.toISOString(),
        score,
      };
    })
    .filter((item): item is PostRankingItem => item !== null)
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}
