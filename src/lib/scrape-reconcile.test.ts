import { describe, expect, it } from "vitest";
import { isZombieStartedAt, ZOMBIE_RUN_TIMEOUT_MS } from "./scrape-reconcile";

describe("scrape-reconcile", () => {
  it("detecta zumbi após 3h", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    const old = new Date(now.getTime() - ZOMBIE_RUN_TIMEOUT_MS - 1000);
    const recent = new Date(now.getTime() - ZOMBIE_RUN_TIMEOUT_MS + 1000);
    expect(isZombieStartedAt(old, now)).toBe(true);
    expect(isZombieStartedAt(recent, now)).toBe(false);
  });

  it("timeout 3h cobre pior caso 240/20", () => {
    // 240 perfis /20 chaves = 12 ondas *3min =36min <3h
    expect(ZOMBIE_RUN_TIMEOUT_MS).toBe(3 * 60 * 60 * 1000);
  });
});
