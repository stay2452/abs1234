import { describe, expect, it } from "vitest";
import { postMatchesPeriod, rankPosts, rankProfiles } from "@/lib/rankings";

describe("rankProfiles", () => {
  it("ranks by recent follower growth using snapshot capture dates", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const result = rankProfiles(
      [
        {
          id: "a",
          platform: "instagram",
          handle: "a",
          url: "https://instagram.com/a/",
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

  it("uses baseline before the period window when available", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const result = rankProfiles(
      [
        {
          id: "a",
          platform: "instagram",
          handle: "a",
          url: "https://instagram.com/a/",
          notes: null,
          snapshots: [
            { followers: 100n, capturedAt: new Date("2026-07-01T00:00:00Z") },
            { followers: 150n, capturedAt: new Date("2026-07-09T00:00:00Z") },
          ],
        },
      ],
      "followers_absolute",
      "3d",
      "all",
      now,
    );

    expect(result[0]?.growthAbsolute).toBe(50);
  });

  it("excludes profiles without comparable growth history", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const result = rankProfiles(
      [
        {
          id: "solo",
          platform: "instagram",
          handle: "solo",
          url: "https://instagram.com/solo/",
          notes: null,
          snapshots: [{ followers: 500n, capturedAt: now }],
        },
      ],
      "followers_absolute",
      "7d",
      "all",
      now,
    );

    expect(result).toHaveLength(0);
  });
});

describe("postMatchesPeriod", () => {
  const now = new Date("2026-07-10T12:00:00Z");

  it("uses real publish date, not scrape date", () => {
    expect(postMatchesPeriod(new Date("2026-07-08T00:00:00Z"), "7d", now)).toBe(true);
    expect(postMatchesPeriod(new Date("2025-01-01T00:00:00Z"), "7d", now)).toBe(false);
    expect(postMatchesPeriod(new Date("2025-01-01T00:00:00Z"), "all", now)).toBe(true);
  });

  it("supports 3-day period", () => {
    expect(postMatchesPeriod(new Date("2026-07-09T00:00:00Z"), "3d", now)).toBe(true);
    expect(postMatchesPeriod(new Date("2026-07-06T00:00:00Z"), "3d", now)).toBe(false);
  });

  it("excludes posts without publishedAt from period filters", () => {
    expect(postMatchesPeriod(null, "7d", now)).toBe(false);
    expect(postMatchesPeriod(null, "all", now)).toBe(true);
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
          publishedAt: new Date("2026-07-04T00:00:00Z"),
          profile: { id: "a", handle: "a", platform: "instagram" },
          snapshots: [{ views: 100n, likes: 90n, comments: 2n, shares: 1n, capturedAt: now }],
        },
        {
          id: "post-b",
          platform: "tiktok",
          url: "https://tiktok.com/@b/video/1",
          caption: null,
          publishedAt: new Date("2026-07-03T00:00:00Z"),
          profile: { id: "b", handle: "b", platform: "tiktok" },
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

  it("does not rank old pinned videos just because they were scraped recently", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const scrapedToday = now;
    const result = rankPosts(
      [
        {
          id: "pinned-old",
          platform: "instagram",
          url: "https://instagram.com/reel/old",
          caption: "video fixado de 2025",
          publishedAt: new Date("2025-03-15T00:00:00Z"),
          profile: { id: "a", handle: "a", platform: "instagram" },
          snapshots: [
            {
              views: 9_000_000n,
              likes: 500_000n,
              comments: 1000n,
              shares: 100n,
              capturedAt: scrapedToday,
            },
          ],
        },
        {
          id: "fresh-reel",
          platform: "instagram",
          url: "https://instagram.com/reel/new",
          caption: "reel de ontem",
          publishedAt: new Date("2026-07-09T00:00:00Z"),
          profile: { id: "b", handle: "b", platform: "instagram" },
          snapshots: [
            {
              views: 50_000n,
              likes: 2_000n,
              comments: 100n,
              shares: 10n,
              capturedAt: scrapedToday,
            },
          ],
        },
      ],
      "views",
      "7d",
      "all",
      now,
    );

    expect(result.map((item) => item.id)).toEqual(["fresh-reel"]);
    expect(result.find((item) => item.id === "pinned-old")).toBeUndefined();
  });

  it("uses latest metrics even if the snapshot is after the publish window", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const result = rankPosts(
      [
        {
          id: "post",
          platform: "instagram",
          url: "https://instagram.com/reel/x",
          caption: null,
          publishedAt: new Date("2026-07-08T00:00:00Z"),
          profile: { id: "a", handle: "a", platform: "instagram" },
          snapshots: [
            {
              views: 100n,
              likes: 10n,
              comments: 1n,
              shares: 0n,
              capturedAt: new Date("2026-07-08T12:00:00Z"),
            },
            {
              views: 500n,
              likes: 40n,
              comments: 5n,
              shares: 1n,
              capturedAt: now,
            },
          ],
        },
      ],
      "views",
      "7d",
      "all",
      now,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.views).toBe(500);
    expect(result[0]?.score).toBe(500);
  });
});
