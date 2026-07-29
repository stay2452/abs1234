import { describe, expect, it } from "vitest";
import {
  estimateScrapeMaxSeconds,
  formatDurationSeconds,
  formatMaxDurationLabel,
  SCRAPE_MAX_SECONDS_PER_PROFILE,
} from "@/lib/scrape-eta";

describe("scrape-eta", () => {
  it("estimates wall time with parallel keys (workers)", () => {
    expect(estimateScrapeMaxSeconds(0)).toBe(0);
    expect(estimateScrapeMaxSeconds(1)).toBe(SCRAPE_MAX_SECONDS_PER_PROFILE);
    expect(estimateScrapeMaxSeconds(3, 1)).toBe(SCRAPE_MAX_SECONDS_PER_PROFILE * 3);
    // 3 perfis com 3 chaves = 1 onda
    expect(estimateScrapeMaxSeconds(3, 3)).toBe(SCRAPE_MAX_SECONDS_PER_PROFILE);
    // 5 perfis com 2 chaves = 3 ondas
    expect(estimateScrapeMaxSeconds(5, 2)).toBe(SCRAPE_MAX_SECONDS_PER_PROFILE * 3);
  });

  it("formats durations for the import UI", () => {
    expect(formatDurationSeconds(45)).toBe("45s");
    expect(formatDurationSeconds(180)).toBe("3 min");
    expect(formatDurationSeconds(195)).toBe("3 min 15s");
    expect(formatMaxDurationLabel(1)).toContain("3 min");
    expect(formatMaxDurationLabel(4)).toContain("4 perfis");
  });
});
