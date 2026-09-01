import { describe, expect, it } from "vitest";
import {
  BrightDataRequestError,
  buildBrightDataScrapeRequest,
  getBrightDataErrorInfo,
  isEmptyContentProviderError,
  recordsFromBrightDataResponse,
} from "@/lib/scrapers/brightdata-client";

describe("getBrightDataErrorInfo", () => {
  it("classifies credentials, account state, and temporary failures without a live request", () => {
    expect(getBrightDataErrorInfo(new BrightDataRequestError("Unauthorized", 401)).code).toBe(
      "authentication",
    );
    expect(getBrightDataErrorInfo(new BrightDataRequestError("Payment required", 402)).code).toBe(
      "account",
    );
    expect(getBrightDataErrorInfo(new BrightDataRequestError("Too many requests", 429)).code).toBe(
      "transient",
    );
    expect(getBrightDataErrorInfo(new BrightDataRequestError("Server error", 503)).code).toBe(
      "transient",
    );
    expect(
      getBrightDataErrorInfo(
        new BrightDataRequestError("Bright Data ainda nao concluiu o snapshot."),
      ).code,
    ).toBe("snapshot_pending");
    // Timeout de POST (trigger pode já estar rodando/cobrando) também não é retry-imediato
    expect(
      getBrightDataErrorInfo(
        new BrightDataRequestError("Bright Data demorou demais para responder (>90s)."),
      ).code,
    ).toBe("snapshot_pending");
  });

  it("never swallows plain Error details as empty unknown", () => {
    const info = getBrightDataErrorInfo(new TypeError("fetch failed"));
    expect(info.message).toMatch(/fetch failed/i);
    expect(info.code).toBe("transient");
  });

  it("recognizes BrightDataRequestError by name (bundler-safe)", () => {
    const fake = Object.assign(new Error("Bright Data HTTP 401: bad token"), {
      name: "BrightDataRequestError",
      statusCode: 401,
    });
    const info = getBrightDataErrorInfo(fake);
    expect(info.code).toBe("authentication");
    expect(info.message).toMatch(/401|bad token/i);
  });

  it("does not classify an unrelated no-customer data error as an account failure", () => {
    expect(
      getBrightDataErrorInfo(new BrightDataRequestError("No customer found in dataset data")).code,
    ).toBe("provider");
  });
});

describe("recordsFromBrightDataResponse", () => {
  it("treats no-public-posts as empty content instead of a hard dataset failure", () => {
    expect(isEmptyContentProviderError("There are no public posts in the profile.")).toBe(true);
    expect(
      recordsFromBrightDataResponse([
        { error: "There are no public posts in the profile.", warning_code: "dead_page" },
      ]),
    ).toEqual([]);
  });

  it("still fails on real provider errors", () => {
    expect(() =>
      recordsFromBrightDataResponse([{ error: "Invalid API token for this dataset." }]),
    ).toThrow(/Invalid API token/);
  });

  it("classifies missing Instagram pages as not_found instead of provider", () => {
    expect(() =>
      recordsFromBrightDataResponse([{ error: "Sorry, this page isn't available." }]),
    ).toThrow(/indisponivel/);
    expect(
      getBrightDataErrorInfo(
        new BrightDataRequestError("Perfil ou conteudo indisponivel no provedor: Sorry, this page isn't available."),
      ).code,
    ).toBe("not_found");
  });
});

describe("buildBrightDataScrapeRequest", () => {
  it("uses the current structured input envelope and dataset query parameters", () => {
    expect(
      buildBrightDataScrapeRequest(
        "gd_lk5ns7kz21pck8jpis",
        { url: "https://www.instagram.com/perfil/", num_of_posts: 5 },
        { query: { type: "discover_new", discover_by: "url" } },
      ),
    ).toEqual({
      path: "/scrape?dataset_id=gd_lk5ns7kz21pck8jpis&format=json&include_errors=true&type=discover_new&discover_by=url",
      body: {
        input: [
          {
            url: "https://www.instagram.com/perfil/",
            num_of_posts: 5,
          },
        ],
      },
    });
  });
});
