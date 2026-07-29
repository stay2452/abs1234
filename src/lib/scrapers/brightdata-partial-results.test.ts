import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scrapeBrightDataDataset: vi.fn(),
}));

vi.mock("@/lib/scrapers/brightdata-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scrapers/brightdata-client")>(
    "@/lib/scrapers/brightdata-client",
  );

  return {
    ...actual,
    scrapeBrightDataDataset: mocks.scrapeBrightDataDataset,
  };
});

import { BrightDataRequestError } from "@/lib/scrapers/brightdata-client";
import { scrapeInstagramProfileWithBrightData } from "@/lib/scrapers/brightdata-instagram";
import { scrapeTikTokProfileWithBrightData } from "@/lib/scrapers/brightdata-tiktok";

describe("Bright Data partial collection", () => {
  beforeEach(() => {
    mocks.scrapeBrightDataDataset.mockReset();
  });

  it("requests only profile + last 5 grid + last 5 reels (credit cap at the provider)", async () => {
    mocks.scrapeBrightDataDataset.mockResolvedValue({
      datasetId: "unused",
      requestsMade: 1,
      records: [],
    });

    await scrapeInstagramProfileWithBrightData(
      {
        id: "profile-1",
        platform: "instagram",
        handle: "perfil",
        url: "https://www.instagram.com/perfil/",
      },
      "test-key",
    );

    expect(mocks.scrapeBrightDataDataset).toHaveBeenCalledTimes(3);

    const calls = mocks.scrapeBrightDataDataset.mock.calls;
    const byDataset = Object.fromEntries(calls.map((call) => [call[0], call]));

    // Perfil: so URL, sem lista de posts.
    expect(byDataset.gd_l1vikfch901nx3by4[1]).toEqual({
      url: "https://www.instagram.com/perfil/",
    });

    // Grade: limite no body enviado ao provedor.
    expect(byDataset.gd_lk5ns7kz21pck8jpis[1]).toEqual({
      url: "https://www.instagram.com/perfil/",
      num_of_posts: 5,
    });
    expect(byDataset.gd_lk5ns7kz21pck8jpis[3]).toMatchObject({
      query: { type: "discover_new", discover_by: "url" },
    });

    // Reels: limite no body; discover_by e modo, nao "baixar tudo".
    expect(byDataset.gd_lyclm20il4r5helnj[1]).toEqual({
      url: "https://www.instagram.com/perfil/",
      num_of_posts: 5,
    });
    expect(byDataset.gd_lyclm20il4r5helnj[3]).toMatchObject({
      query: { type: "discover_new", discover_by: "url_all_reels" },
    });

    // Nenhum request de conteudo sem teto de posts.
    for (const call of calls) {
      const input = call[1] as { num_of_posts?: number; url?: string };
      if (call[0] === "gd_l1vikfch901nx3by4") {
        expect(input.num_of_posts).toBeUndefined();
      } else {
        expect(input.num_of_posts).toBe(5);
      }
    }
  });

  it("keeps Instagram profile and Reels when the Grade dataset fails", async () => {
    mocks.scrapeBrightDataDataset.mockImplementation((datasetId: string) => {
      if (datasetId === "gd_l1vikfch901nx3by4") {
        return Promise.resolve({
          datasetId,
          requestsMade: 1,
          records: [{ followers: 100, following: 20, posts_count: 8 }],
        });
      }
      if (datasetId === "gd_lk5ns7kz21pck8jpis") {
        return Promise.reject(new BrightDataRequestError("Bright Data HTTP 400.", 400));
      }
      return Promise.resolve({
        datasetId,
        requestsMade: 1,
        records: [
          {
            url: "https://www.instagram.com/reel/ABC123/",
            description: "Legenda do Reel",
            views: 900,
            likes: 90,
            num_comments: 9,
            date_posted: "2026-07-10T10:00:00.000Z",
          },
        ],
      });
    });

    const result = await scrapeInstagramProfileWithBrightData({
      id: "profile-1",
      platform: "instagram",
      handle: "perfil",
      url: "https://www.instagram.com/perfil/",
    }, "test-key");

    expect(result.followers).toBe(100);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({ sourceType: "reels", externalId: "ABC123" });
    expect(result.datasets.map((dataset) => dataset.status)).toEqual([
      "success",
      "failed",
      "success",
    ]);
    expect(result.partialError).toMatchObject({ errorCode: "provider" });
  });

  it("keeps TikTok videos when the profile dataset fails", async () => {
    mocks.scrapeBrightDataDataset.mockImplementation((datasetId: string) => {
      if (datasetId === "gd_l1villgoiiidt09ci") {
        return Promise.reject(new BrightDataRequestError("Bright Data HTTP 429.", 429));
      }
      return Promise.resolve({
        datasetId,
        requestsMade: 1,
        records: [
          {
            post_id: "7553300000000000000",
            profile_username: "perfil",
            play_count: 1000,
            create_time: "2026-07-10T10:00:00.000Z",
          },
        ],
      });
    });

    const result = await scrapeTikTokProfileWithBrightData({
      id: "profile-2",
      platform: "tiktok",
      handle: "perfil",
      url: "https://www.tiktok.com/@perfil",
    }, "test-key");

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.url).toBe(
      "https://www.tiktok.com/@perfil/video/7553300000000000000",
    );
    expect(result.profileDataFound).toBe(false);
    expect(result.partialError).toMatchObject({ errorCode: "transient" });
  });
});
