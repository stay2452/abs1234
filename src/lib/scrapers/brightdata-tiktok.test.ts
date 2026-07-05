import { describe, expect, it } from "vitest";
import {
  isBrightDataTikTokEnabled,
  mapBrightDataTikTokPost,
  mapBrightDataTikTokProfile,
} from "@/lib/scrapers/brightdata-tiktok";

describe("Bright Data TikTok mapper", () => {
  it("only enables Bright Data when the flag is explicit", () => {
    const originalKey = process.env.BRIGHTDATA_API_KEY;
    const originalEnabled = process.env.BRIGHTDATA_TIKTOK_ENABLED;

    try {
      process.env.BRIGHTDATA_API_KEY = "test-key";
      delete process.env.BRIGHTDATA_TIKTOK_ENABLED;
      expect(isBrightDataTikTokEnabled()).toBe(false);

      process.env.BRIGHTDATA_TIKTOK_ENABLED = "false";
      expect(isBrightDataTikTokEnabled()).toBe(false);

      process.env.BRIGHTDATA_TIKTOK_ENABLED = "true";
      expect(isBrightDataTikTokEnabled()).toBe(true);
    } finally {
      if (originalKey === undefined) {
        delete process.env.BRIGHTDATA_API_KEY;
      } else {
        process.env.BRIGHTDATA_API_KEY = originalKey;
      }

      if (originalEnabled === undefined) {
        delete process.env.BRIGHTDATA_TIKTOK_ENABLED;
      } else {
        process.env.BRIGHTDATA_TIKTOK_ENABLED = originalEnabled;
      }
    }
  });

  it("maps profile stats", () => {
    const result = mapBrightDataTikTokProfile([
      {
        followers: 85600000,
        following: 580,
        videos_count: 1250,
      },
    ]);

    expect(result).toEqual({
      followers: 85600000,
      following: 580,
      postsCount: 1250,
    });
  });

  it("maps post metrics", () => {
    const result = mapBrightDataTikTokPost(
      {
        url: "https://www.tiktok.com/@tiktok/video/7345678901234567890",
        description: "Making every moment count",
        views: 5200000,
        likes: 245000,
        comments: 3200,
        shares: 18500,
        date_posted: "2024-04-10T15:30:00.000Z",
      },
      "tiktok",
    );

    expect(result).toMatchObject({
      externalId: "7345678901234567890",
      sourceType: "video",
      caption: "Making every moment count",
      metrics: {
        views: 5200000,
        likes: 245000,
        comments: 3200,
        shares: 18500,
      },
    });
    expect(result?.publishedAt?.toISOString()).toBe("2024-04-10T15:30:00.000Z");
  });
});
