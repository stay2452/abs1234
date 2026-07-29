import { describe, expect, it } from "vitest";
import { formatChartDateTime, formatNumber } from "@/lib/format";

describe("format deterministico", () => {
  it("formatChartDateTime usa America/Sao_Paulo fixo", () => {
    // 2026-07-05T19:58:00.000Z = 16:58 em SP (UTC-3)
    expect(formatChartDateTime("2026-07-05T19:58:00.000Z")).toBe("05/07 16:58");
  });

  it("formatNumber agrupa milhares sem Intl", () => {
    expect(formatNumber(3871)).toBe("3.871");
    expect(formatNumber(6584)).toBe("6.584");
  });
});
