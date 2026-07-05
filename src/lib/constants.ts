export const PLATFORMS = ["instagram", "tiktok"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

export const PROFILE_STATUS = ["active", "paused", "error"] as const;

export type ProfileStatus = (typeof PROFILE_STATUS)[number];

export const POST_METRICS = ["views", "likes", "comments", "shares", "engagement"] as const;
export const PROFILE_METRICS = ["followers_absolute", "followers_percent"] as const;
export const RANKING_PERIODS = ["7d", "30d", "90d", "all"] as const;

export type PostMetric = (typeof POST_METRICS)[number];
export type ProfileMetric = (typeof PROFILE_METRICS)[number];
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

export const POSTS_PER_PROFILE = 12;
