import type { Page } from "playwright";

type UnknownRecord = Record<string, unknown>;

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  mil: 1_000,
  m: 1_000_000,
  mi: 1_000_000,
  milhão: 1_000_000,
  milhões: 1_000_000,
  million: 1_000_000,
  millions: 1_000_000,
  b: 1_000_000_000,
  bi: 1_000_000_000,
  bilhão: 1_000_000_000,
  bilhões: 1_000_000_000,
  billion: 1_000_000_000,
  billions: 1_000_000_000,
};

function normalizeNumber(value: string, hasSuffix: boolean) {
  const clean = value.replace(/\s/g, "");
  const hasComma = clean.includes(",");
  const hasDot = clean.includes(".");

  if (hasComma && hasDot) {
    return clean.lastIndexOf(",") > clean.lastIndexOf(".")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean.replace(/,/g, "");
  }

  if (hasComma) {
    const [, decimal = ""] = clean.split(",");
    return hasSuffix || decimal.length <= 2 ? clean.replace(",", ".") : clean.replace(/,/g, "");
  }

  if (hasDot) {
    const [, decimal = ""] = clean.split(".");
    return !hasSuffix && decimal.length === 3 ? clean.replace(/\./g, "") : clean;
  }

  return clean;
}

export function parseCountText(text: string | null | undefined) {
  if (!text) {
    return null;
  }

  const normalized = text
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(
    /([\d.,]+)\s*(k|milhões|milhão|million|millions|mil|mi|m|bilhões|bilhão|billion|billions|bi|b)?/i,
  );

  if (!match) {
    return null;
  }

  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix ? MULTIPLIERS[suffix] ?? 1 : 1;
  const parsed = Number.parseFloat(normalizeNumber(match[1], Boolean(suffix)));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * multiplier);
}

export function parseCountNearLabel(text: string, labels: string[]) {
  const normalized = text.replace(/\u00a0/g, " ");

  for (const label of labels) {
    const before = new RegExp(
      `([\\d.,]+\\s*(?:k|milhões|milhão|million|millions|mil|mi|m|bilhões|bilhão|billion|billions|bi|b)?)\\s+${label}`,
      "i",
    ).exec(normalized);

    if (before) {
      return parseCountText(before[1]);
    }
  }

  return null;
}

export function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function readJsonScripts(page: Page) {
  const contents = await page
    .locator("script")
    .evaluateAll((scripts) =>
      scripts
        .map((script) => script.textContent ?? "")
        .filter((text) => text.trim().startsWith("{") || text.trim().startsWith("["))
        .slice(0, 30),
    );

  return contents.map(safeJsonParse).filter((value): value is unknown => value !== null);
}

export function walkJson(value: unknown, visitor: (record: UnknownRecord) => void, depth = 0) {
  if (depth > 14 || value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkJson(item, visitor, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    const record = value as UnknownRecord;
    visitor(record);

    for (const child of Object.values(record)) {
      if (typeof child === "object" && child !== null) {
        walkJson(child, visitor, depth + 1);
      }
    }
  }
}

export function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    return parseCountText(value);
  }

  return null;
}

export function firstNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = numberFromUnknown(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function absoluteUrl(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}
