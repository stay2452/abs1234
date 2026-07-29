import { describe, expect, it } from "vitest";
import { SCRAPE_FRESHNESS_WINDOW_MINUTES } from "@/lib/constants";
import { markDatasetsNoData, shouldScrapeProfile } from "@/lib/scrapers";

function profileWithSnapshot(capturedAt?: Date, lastPostsScrapeAt?: Date | null) {
  return {
    id: "profile-1",
    platform: "instagram",
    handle: "perfil",
    url: "https://www.instagram.com/perfil/",
    notes: null,
    status: "active",
    lastPostsScrapeAt: lastPostsScrapeAt ?? null,
    createdAt: new Date("2026-07-07T12:00:00.000Z"),
    updatedAt: new Date("2026-07-07T12:00:00.000Z"),
    snapshots: capturedAt ? [{ capturedAt }] : [],
  };
}

describe("shouldScrapeProfile", () => {
  const now = new Date("2026-07-07T13:00:00.000Z");

  it("scrapes profiles without snapshots", () => {
    expect(shouldScrapeProfile(profileWithSnapshot(), now)).toBe(true);
  });

  it("skips profiles updated inside the freshness window", () => {
    const capturedAt = new Date(now.getTime() - (SCRAPE_FRESHNESS_WINDOW_MINUTES - 1) * 60 * 1000);

    expect(shouldScrapeProfile(profileWithSnapshot(capturedAt), now)).toBe(false);
  });

  it("scrapes profiles outside the freshness window", () => {
    const capturedAt = new Date(now.getTime() - SCRAPE_FRESHNESS_WINDOW_MINUTES * 60 * 1000);

    expect(shouldScrapeProfile(profileWithSnapshot(capturedAt), now)).toBe(true);
  });

  it("allows forced scraping", () => {
    expect(shouldScrapeProfile(profileWithSnapshot(now), now, true)).toBe(true);
  });

  it("skips profiles with only lastPostsScrapeAt inside the freshness window", () => {
    // Perfil sem profileSnapshot porem coletou posts ha 5 min: nao deve re-coletar.
    const recentPostsScrapeAt = new Date(
      now.getTime() - (SCRAPE_FRESHNESS_WINDOW_MINUTES - 5) * 60 * 1000,
    );
    expect(shouldScrapeProfile(profileWithSnapshot(undefined, recentPostsScrapeAt), now)).toBe(false);
  });

  it("scrapes profiles with only lastPostsScrapeAt outside the freshness window", () => {
    // Perfil coletou posts ha mais de 30 min: pode re-coletar.
    const oldPostsScrapeAt = new Date(
      now.getTime() - (SCRAPE_FRESHNESS_WINDOW_MINUTES + 10) * 60 * 1000,
    );
    expect(shouldScrapeProfile(profileWithSnapshot(undefined, oldPostsScrapeAt), now)).toBe(true);
  });

  it("honors the most recent of profileSnapshot and lastPostsScrapeAt", () => {
    // Snapshot antigo (60 min) mas posts recentes (5 min): nao re-coleta.
    const oldSnapshot = new Date(now.getTime() - 60 * 60 * 1000);
    const recentPosts = new Date(now.getTime() - 5 * 60 * 1000);
    expect(shouldScrapeProfile(profileWithSnapshot(oldSnapshot, recentPosts), now)).toBe(false);
  });
});

describe("markDatasetsNoData", () => {
  it("marks usable responses as no_data and preserves provider failures", () => {
    expect(
      markDatasetsNoData([
        {
          datasetId: "profile",
          status: "success",
          requestsMade: 1,
          recordsReceived: 2,
          recordsKept: 1,
        },
        {
          datasetId: "posts",
          status: "failed",
          requestsMade: 1,
          recordsReceived: 0,
          recordsKept: 0,
          errorCode: "transient",
          errorMessage: "Bright Data HTTP 429.",
        },
      ]),
    ).toEqual([
      {
        datasetId: "profile",
        status: "no_data",
        requestsMade: 1,
        recordsReceived: 2,
        recordsKept: 0,
      },
      {
        datasetId: "posts",
        status: "failed",
        requestsMade: 1,
        recordsReceived: 0,
        recordsKept: 0,
        errorCode: "transient",
        errorMessage: "Bright Data HTTP 429.",
      },
    ]);
  });
});
