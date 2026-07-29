const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  mil: 1_000,
  m: 1_000_000,
  mi: 1_000_000,
  milhao: 1_000_000,
  milhoes: 1_000_000,
  million: 1_000_000,
  millions: 1_000_000,
  b: 1_000_000_000,
  bi: 1_000_000_000,
  bilhao: 1_000_000_000,
  bilhoes: 1_000_000_000,
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
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(
    /([\d.,]+)\s*(k|milhoes|milhao|million|millions|mil|mi|m|bilhoes|bilhao|billion|billions|bi|b)?/i,
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
