import { describe, expect, it } from "vitest";
import { MAX_SCRAPE_PROFILE_IDS } from "@/lib/constants";
import { parseScrapeRunRequest } from "@/lib/scrapers/scope";

describe("parseScrapeRunRequest", () => {
  it("accepts an explicit global scope", () => {
    expect(parseScrapeRunRequest({ scope: "all", force: true })).toEqual({
      scope: { kind: "all" },
      force: true,
      stream: false,
    });
  });

  it("preserves the streaming progress request", () => {
    expect(parseScrapeRunRequest({ scope: "all", stream: true })).toEqual({
      scope: { kind: "all" },
      force: false,
      stream: true,
    });
  });

  it("accepts an explicit, de-duplicated profile list", () => {
    expect(parseScrapeRunRequest({ scope: "profiles", profileIds: ["a", "a", "b"] })).toEqual({
      scope: { kind: "profiles", profileIds: ["a", "b"] },
      force: false,
      stream: false,
    });
  });

  it("rejects an absent, malformed, or oversized scope", () => {
    expect(parseScrapeRunRequest({})).toBeNull();
    expect(parseScrapeRunRequest({ scope: "profiles", profileIds: [] })).toBeNull();
    expect(
      parseScrapeRunRequest({
        scope: "profiles",
        profileIds: Array.from({ length: MAX_SCRAPE_PROFILE_IDS + 1 }, (_, index) => `${index}`),
      }),
    ).toBeNull();
  });
});
