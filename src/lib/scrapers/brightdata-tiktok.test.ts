import { describe, expect, it } from "vitest";
import {
  mapBrightDataTikTokPost,
  mapBrightDataTikTokProfile,
} from "@/lib/scrapers/brightdata-tiktok";

describe("Bright Data TikTok mapper", () => {
  it("maps profile stats", () => {
    const result = mapBrightDataTikTokProfile([
      {
        followers: 85600000,
        following: 580,
        likes: 520000000,
        videos_count: 1250,
      },
    ]);

    expect(result).toEqual({
      followers: 85600000,
      following: 580,
      likes: 520000000,
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

  it("builds a public post URL from the Fast API post_id", () => {
    const result = mapBrightDataTikTokPost(
      {
        post_id: "7553300000000000000",
        profile_username: "examplecreator",
        description: "Video vindo do Fast API",
        play_count: 42000000,
        comment_count: 18000,
        share_count: 95000,
        collect_count: 28000,
        video_url: "https://v16-webapp-prime.tiktok.com/video/example.mp4",
        create_time: "2025-02-01T10:00:00.000Z",
      },
      "fallback",
    );

    expect(result).toMatchObject({
      externalId: "7553300000000000000",
      url: "https://www.tiktok.com/@examplecreator/video/7553300000000000000",
      sourceType: "video",
      metrics: {
        views: 42000000,
        comments: 18000,
        shares: 95000,
        favorites: 28000,
      },
    });
  });
});
