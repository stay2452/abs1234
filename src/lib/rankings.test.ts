import { describe, expect, it } from "vitest";
import { rankPosts, rankProfiles } from "@/lib/rankings";

describe("rankProfiles", () => {
  it("ranks by recent follower growth", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const result = rankProfiles(
      [
        {
          id: "a",
          platform: "instagram",
          handle: "a",
          url: "https://instagram.com/a/",
          tags: null,
          notes: null,
          snapshots: [
            { followers: 100n, capturedAt: new Date("2026-07-01T00:00:00Z") },
            { followers: 180n, capturedAt: now },
          ],
        },
        {
          id: "b",
          platform: "tiktok",
          handle: "b",
          url: "https://tiktok.com/@b",
          tags: null,
          notes: null,
          snapshots: [
            { followers: 1000n, capturedAt: new Date("2026-07-01T00:00:00Z") },
            { followers: 1010n, capturedAt: now },
          ],
        },
      ],
      "followers_absolute",
      "7d",
      "all",
      now,
    );

    expect(result[0]?.handle).toBe("a");
    expect(result[0]?.growthAbsolute).toBe(80);
  });
});

describe("rankPosts", () => {
  it("ranks by selected post metric", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const result = rankPosts(
      [
        {
          id: "post-a",
          platform: "instagram",
          url: "https://instagram.com/reel/a",
          caption: null,
          publishedAt: null,
          profile: { id: "a", handle: "a", platform: "instagram", tags: null },
          snapshots: [{ views: 100n, likes: 90n, comments: 2n, shares: 1n, capturedAt: now }],
        },
        {
          id: "post-b",
          platform: "tiktok",
          url: "https://tiktok.com/@b/video/1",
          caption: null,
          publishedAt: null,
          profile: { id: "b", handle: "b", platform: "tiktok", tags: null },
          snapshots: [{ views: 200n, likes: 10n, comments: 4n, shares: 3n, capturedAt: now }],
        },
      ],
      "likes",
      "7d",
      "all",
      now,
    );

    expect(result[0]?.id).toBe("post-a");
    expect(result[0]?.score).toBe(90);
  });
});
