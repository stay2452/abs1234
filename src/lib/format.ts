/** Fuso fixo America/Sao_Paulo (UTC-3, sem horario de verao desde 2019). */
const SP_OFFSET_MS = -3 * 60 * 60 * 1000;

const MONTHS_SHORT = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
] as const;

export function toNumber(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "bigint" ? Number(value) : value;
}

function parseDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

/** Partes de calendario em America/Sao_Paulo — identico em Node e browser. */
function spParts(date: Date) {
  const shifted = new Date(date.getTime() + SP_OFFSET_MS);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Separador de milhar pt-BR sem Intl (evita mismatch de ICU). */
function formatGroupedInteger(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(value));
  const raw = String(abs);
  const withDots = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withDots}`;
}

export function formatNumber(value: bigint | number | null | undefined) {
  const numberValue = toNumber(value);

  if (numberValue === null || Number.isNaN(numberValue)) {
    return "não disponível";
  }

  const abs = Math.abs(numberValue);
  if (abs >= 10000) {
    // compacto simples e deterministico: 1.2 mil / 3.4 mi
    if (abs >= 1_000_000) {
      const n = numberValue / 1_000_000;
      const text = Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1).replace(".", ",");
      return `${text} mi`;
    }
    const n = numberValue / 1000;
    const text = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1).replace(".", ",");
    return `${text} mil`;
  }

  if (!Number.isInteger(numberValue)) {
    const fixed = numberValue.toFixed(1).replace(".", ",");
    const [intPart, dec] = fixed.split(",");
    const grouped = formatGroupedInteger(Number(intPart.replace("-", "")));
    const sign = numberValue < 0 ? "-" : "";
    return `${sign}${grouped},${dec}`;
  }

  return formatGroupedInteger(numberValue);
}

export function formatExactNumber(value: bigint | number | null | undefined) {
  const numberValue = toNumber(value);

  if (numberValue === null || Number.isNaN(numberValue)) {
    return "não disponível";
  }

  if (!Number.isInteger(numberValue)) {
    const fixed = numberValue.toFixed(0);
    return formatGroupedInteger(Number(fixed));
  }

  return formatGroupedInteger(numberValue);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "não disponível";
  }

  const text = value.toFixed(1).replace(".", ",");
  return `${text}%`;
}

export function formatDate(value: Date | string | null | undefined) {
  const date = parseDate(value);
  if (!date) {
    return "não disponível";
  }

  const p = spParts(date);
  return `${pad2(p.day)} de ${MONTHS_SHORT[p.month]} de ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatShortDate(value: Date | string | null | undefined) {
  const date = parseDate(value);
  if (!date) {
    return "sem data";
  }

  const p = spParts(date);
  return `${pad2(p.day)} de ${MONTHS_SHORT[p.month]}`;
}

/** dd/mm hh:mm em America/Sao_Paulo — sem Intl. */
export function formatChartDateTime(value: Date | string | null | undefined) {
  const date = parseDate(value);
  if (!date) {
    return "sem data";
  }

  const p = spParts(date);
  return `${pad2(p.day)}/${pad2(p.month + 1)} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatSigned(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "não disponível";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value)}`;
}
