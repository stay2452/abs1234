import { describe, expect, it } from "vitest";
import { MAX_SCRAPE_ALL_PROFILES, ESTIMATED_CREDITS_PER_PROFILE } from "@/lib/constants";

describe("scope cap contrato", () => {
  it("MAX_SCRAPE_ALL_PROFILES é 200 (teto para scope all)", () => {
    expect(MAX_SCRAPE_ALL_PROFILES).toBe(200);
  });

  it("custo estimado por perfil é 11", () => {
    expect(ESTIMATED_CREDITS_PER_PROFILE).toBe(11);
  });

  it("200 perfis cabem no teto mas 500 estourariam 1 conta free (5k)", () => {
    expect(200 * ESTIMATED_CREDITS_PER_PROFILE).toBeLessThanOrEqual(5000);
    expect(500 * ESTIMATED_CREDITS_PER_PROFILE).toBeGreaterThan(5000);
  });
});
