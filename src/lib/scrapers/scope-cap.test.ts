import { describe, expect, it } from "vitest";
import { MAX_SCRAPE_ALL_PROFILES, ESTIMATED_CREDITS_PER_PROFILE } from "@/lib/constants";
import { FREE_TIER_CREDITS } from "@/lib/scrapers/session";

describe("scope cap contrato", () => {
  it("MAX_SCRAPE_ALL_PROFILES é 200 (teto para scope all)", () => {
    expect(MAX_SCRAPE_ALL_PROFILES).toBe(200);
  });

  it("custo estimado por perfil é 11", () => {
    expect(ESTIMATED_CREDITS_PER_PROFILE).toBe(11);
  });

  it("free tier Apify é 1k por conta", () => {
    expect(FREE_TIER_CREDITS).toBe(1000);
  });

  it("200 perfis (cap all) exigem multi-conta: 200×11 supera 1 free Apify", () => {
    expect(200 * ESTIMATED_CREDITS_PER_PROFILE).toBeGreaterThan(FREE_TIER_CREDITS);
    expect(500 * ESTIMATED_CREDITS_PER_PROFILE).toBeGreaterThan(FREE_TIER_CREDITS);
  });
});
