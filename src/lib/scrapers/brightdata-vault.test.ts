import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const analyzePath = path.resolve(__dirname, "../../app/api/vault/analyze-ai/route.ts");
const source = readFileSync(analyzePath, "utf8");

describe("Vault limit_per_input contrato", () => {
  it("mantém limit_per_input=20 no COMMENTS_DATASET (stream)", () => {
    expect(source).toMatch(/query:\s*\{\s*limit_per_input:\s*20\s*\}/);
  });

  it("dataset de comentários é gd_ltppn085pokosxh13", () => {
    expect(source).toContain('gd_ltppn085pokosxh13');
  });

  it("não remove o guarda de slice pós-coleta", () => {
    expect(source).toMatch(/\.slice\(0,\s*20\)/);
  });

  it("tem cooldown de 5min para não re-trigger", () => {
    expect(source).toContain("PROVIDER_RETRY_COOLDOWN_MS");
  });
});
