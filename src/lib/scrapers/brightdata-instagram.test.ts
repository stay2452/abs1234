import { describe, expect, it } from "vitest";
import {
  flattenBrightDataInstagramContent,
  mapBrightDataInstagramPost,
  mapBrightDataInstagramProfile,
} from "@/lib/scrapers/brightdata-instagram";

describe("Bright Data Instagram mapper", () => {
  it("maps profile stats", () => {
    const result = mapBrightDataInstagramProfile([
      {
        followers: 676000000,
        following: 500,
        posts_count: 7800,
      },
    ]);

    expect(result).toEqual({
      followers: 676000000,
      following: 500,
      postsCount: 7800,
    });
  });

  it("maps grid post metrics without changing source type", () => {
    const result = mapBrightDataInstagramPost(
      {
        url: "https://www.instagram.com/p/Cuf4s0MNqNr/",
        description: "Sharing moments that matter",
        num_comments: 1250,
        date_posted: "2024-04-03T14:30:00.000Z",
        likes: 45230,
        shortcode: "Cuf4s0MNqNr",
      },
      "grid",
    );

    expect(result).toMatchObject({
      externalId: "Cuf4s0MNqNr",
      sourceType: "grid",
      caption: "Sharing moments that matter",
      metrics: {
        views: null,
        likes: 45230,
        comments: 1250,
      },
    });
    expect(result?.publishedAt?.toISOString()).toBe("2024-04-03T14:30:00.000Z");
  });

  it("maps reels metrics without collapsing them into grid", () => {
    const result = mapBrightDataInstagramPost(
      {
        url: "https://www.instagram.com/reel/C5Rdyj_q7YN/",
        description: "Watch this reel",
        num_comments: 320,
        date_posted: "2024-03-15T10:00:00.000Z",
        likes: 15000,
        views: 250000,
        video_play_count: 500000,
        shortcode: "C5Rdyj_q7YN",
      },
      "reels",
    );

    expect(result).toMatchObject({
      externalId: "C5Rdyj_q7YN",
      sourceType: "reels",
      caption: "Watch this reel",
      metrics: {
        views: 250000,
        likes: 15000,
        comments: 320,
      },
    });
  });

  it("preserves a Reel URL returned by the Grade dataset", () => {
    const result = mapBrightDataInstagramPost(
      {
        url: "https://www.instagram.com/reel/DbEOnJkpfcb/",
        shortcode: "DbEOnJkpfcb",
        likes: 106,
        views: 2013,
      },
      "grid",
    );

    expect(result).toMatchObject({
      externalId: "DbEOnJkpfcb",
      url: "https://www.instagram.com/reel/DbEOnJkpfcb/",
      // Continua na colecao Grade, mas o link abre o Reel especifico.
      sourceType: "grid",
      metrics: { views: 2013, likes: 106 },
    });
  });

  it("does not catalog a profile URL as a post", () => {
    expect(
      mapBrightDataInstagramPost(
        { url: "https://www.instagram.com/perfil/", description: "Nao e um post" },
        "grid",
      ),
    ).toBeNull();
  });
});

describe("Bright Data Instagram discovery mapper", () => {
  it("reads posts nested in a profile discovery response", () => {
    expect(
      flattenBrightDataInstagramContent([
        {
          account: "perfil",
          posts: [
            {
              id: "Cuf4s0MNqNr",
              caption: "Legenda da grade",
              datetime: "2026-07-10T10:00:00.000Z",
              likes: 123,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "Cuf4s0MNqNr",
        caption: "Legenda da grade",
        datetime: "2026-07-10T10:00:00.000Z",
        likes: 123,
      },
    ]);
  });

  it("maps an id-only discovery post into the Grade collection", () => {
    expect(
      mapBrightDataInstagramPost(
        { id: "Cuf4s0MNqNr", caption: "Legenda", datetime: "2026-07-10T10:00:00.000Z" },
        "grid",
      ),
    ).toMatchObject({
      externalId: "Cuf4s0MNqNr",
      url: "https://www.instagram.com/p/Cuf4s0MNqNr/",
      sourceType: "grid",
      caption: "Legenda",
    });
  });
});
