import type { BrowserContext } from "playwright";
import type { Platform } from "@/lib/constants";

export type ScrapeProfileInput = {
  id: string;
  platform: Platform;
  handle: string;
  url: string;
};

export type ScrapedMetric = number | null;

export type ScrapedPost = {
  externalId?: string | null;
  url: string;
  sourceType?: string;
  caption?: string | null;
  publishedAt?: Date | null;
  metrics: {
    views?: ScrapedMetric;
    likes?: ScrapedMetric;
    comments?: ScrapedMetric;
    shares?: ScrapedMetric;
    favorites?: ScrapedMetric;
  };
};

export type ScrapedProfileResult = {
  followers?: ScrapedMetric;
  following?: ScrapedMetric;
  postsCount?: number | null;
  posts: ScrapedPost[];
};

export type ProfileScraper = (
  context: BrowserContext,
  profile: ScrapeProfileInput,
  limit: number,
) => Promise<ScrapedProfileResult>;
