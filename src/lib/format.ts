export function toNumber(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "bigint" ? Number(value) : value;
}

export function formatNumber(value: bigint | number | null | undefined) {
  const numberValue = toNumber(value);

  if (numberValue === null || Number.isNaN(numberValue)) {
    return "não disponível";
  }

  return new Intl.NumberFormat("pt-BR", {
    notation: Math.abs(numberValue) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(numberValue);
}

export function formatExactNumber(value: bigint | number | null | undefined) {
  const numberValue = toNumber(value);

  if (numberValue === null || Number.isNaN(numberValue)) {
    return "não disponível";
  }

  return new Intl.NumberFormat("pt-BR").format(numberValue);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "não disponível";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "não disponível";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatShortDate(value: Date | string | null | undefined) {
  if (!value) {
    return "sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatSigned(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "não disponível";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value)}`;
}

export function splitTags(tags: string | null | undefined) {
  if (!tags) {
    return [];
  }

  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
