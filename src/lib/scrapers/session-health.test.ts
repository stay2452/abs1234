import { describe, expect, it } from "vitest";
import {
  classifySessionHealth,
  classifySessionHealthLegacy,
} from "@/lib/scrapers/session";
import { usdToEstimatedCredits } from "@/lib/scrapers/brightdata-balance";

describe("classifySessionHealth (credito)", () => {
  it("marks paused sessions", () => {
    expect(classifySessionHealth({ status: "paused", creditStatus: "has_credit" })).toBe(
      "paused",
    );
  });

  it("marks credit availability", () => {
    expect(classifySessionHealth({ status: "active", creditStatus: "has_credit" })).toBe(
      "has_credit",
    );
    expect(classifySessionHealth({ status: "active", creditStatus: "no_credit" })).toBe(
      "no_credit",
    );
    expect(classifySessionHealth({ status: "active", creditStatus: "unknown" })).toBe(
      "unknown",
    );
  });
});

describe("legacy failure health", () => {
  it("still classifies consecutive failures for diagnostics", () => {
    expect(
      classifySessionHealthLegacy({ status: "active", consecutiveFailures: 0, lastError: null }),
    ).toBe("good");
    expect(
      classifySessionHealthLegacy({
        status: "active",
        consecutiveFailures: 1,
        lastError: "x",
      }),
    ).toBe("bad");
  });
});

describe("usdToEstimatedCredits", () => {
  it("maps free-tier dollars to credits", () => {
    expect(usdToEstimatedCredits(7.5)).toBe(5000);
    expect(usdToEstimatedCredits(0)).toBe(0);
  });
});
