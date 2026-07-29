/**
 * Converte CSV de perfis em linhas de import (URL / @ / plataforma:@).
 * Formatos aceitos:
 * - uma coluna: @user, url, instagram:user
 * - colunas handle/url/perfil + platform/plataforma opcional
 * - separadores: vírgula, ponto-e-vírgula, tab
 */

export type CsvToImportResult = {
  text: string;
  rowCount: number;
  lineCount: number;
  skippedHeader: boolean;
  fileName?: string;
};

const HANDLE_HEADERS = new Set([
  "handle",
  "username",
  "user",
  "perfil",
  "profile",
  "conta",
  "account",
  "usuario",
  "usuário",
  "nick",
  "login",
  "@",
  "at",
]);

const URL_HEADERS = new Set([
  "url",
  "link",
  "profile_url",
  "profileurl",
  "href",
  "permalink",
  "endereco",
  "endereço",
]);

const PLATFORM_HEADERS = new Set([
  "platform",
  "plataforma",
  "rede",
  "network",
  "source",
  "tipo",
  "type",
]);

function stripBom(raw: string) {
  return raw.replace(/^\uFEFF/, "");
}

/** Detecta separador dominante na 1ª linha útil. */
export function detectCsvDelimiter(sampleLine: string) {
  const counts = {
    ",": (sampleLine.match(/,/g) || []).length,
    ";": (sampleLine.match(/;/g) || []).length,
    "\t": (sampleLine.match(/\t/g) || []).length,
  };
  const best = (Object.entries(counts) as Array<[string, number]>).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (!best || best[1] === 0) return ",";
  return best[0];
}

/** Parse CSV simples com aspas. */
export function parseCsvRows(raw: string): string[][] {
  const text = stripBom(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstNonEmpty =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) || "";
  const delimiter = detectCsvDelimiter(firstNonEmpty);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const pushRow = () => {
    // ignora linhas totalmente vazias
    if (row.some((c) => c.length > 0)) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      pushCell();
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    cell += ch;
  }

  // última célula/linha
  pushCell();
  pushRow();

  return rows;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_@]/g, "");
}

function looksLikeHeaderRow(cells: string[]) {
  const normalized = cells.map(normalizeHeader).filter(Boolean);
  if (normalized.length === 0) return false;
  const hits = normalized.filter(
    (h) => HANDLE_HEADERS.has(h) || URL_HEADERS.has(h) || PLATFORM_HEADERS.has(h),
  );
  return hits.length >= 1;
}

function normalizePlatformCell(value: string): "instagram" | "tiktok" | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (
    v === "instagram" ||
    v === "ig" ||
    v === "insta" ||
    v.startsWith("instagram")
  ) {
    return "instagram";
  }
  if (v === "tiktok" || v === "tt" || v.startsWith("tiktok")) {
    return "tiktok";
  }
  return null;
}

function cellToImportLine(cell: string, platform?: "instagram" | "tiktok" | null) {
  const value = cell.trim();
  if (!value) return null;

  // já é URL ou plataforma:handle
  if (/instagram\.com|tiktok\.com/i.test(value) || /^(instagram|tiktok)\s*[:/@]/i.test(value)) {
    return value;
  }

  // @handle ou handle puro
  const bare = value.replace(/^@/, "").trim();
  if (!bare || /\s/.test(bare)) {
    // espaços → provavelmente lixo; ainda tenta se for URL
    if (/^https?:\/\//i.test(value)) return value;
    return null;
  }

  if (platform === "tiktok") {
    return `tiktok:@${bare}`;
  }
  if (platform === "instagram") {
    return `instagram:@${bare}`;
  }
  // deixa o defaultPlatform do form resolver se for só @
  return `@${bare}`;
}

/**
 * Converte conteúdo CSV em texto multi-linha no formato do import.
 */
export function csvToImportText(raw: string, options?: { fileName?: string }): CsvToImportResult {
  const rows = parseCsvRows(raw);
  if (rows.length === 0) {
    return {
      text: "",
      rowCount: 0,
      lineCount: 0,
      skippedHeader: false,
      fileName: options?.fileName,
    };
  }

  let start = 0;
  let skippedHeader = false;
  let handleIdx = -1;
  let urlIdx = -1;
  let platformIdx = -1;

  if (looksLikeHeaderRow(rows[0])) {
    skippedHeader = true;
    start = 1;
    rows[0].forEach((cell, index) => {
      const h = normalizeHeader(cell);
      if (handleIdx < 0 && HANDLE_HEADERS.has(h)) handleIdx = index;
      if (urlIdx < 0 && URL_HEADERS.has(h)) urlIdx = index;
      if (platformIdx < 0 && PLATFORM_HEADERS.has(h)) platformIdx = index;
    });
  }

  const lines: string[] = [];

  for (let r = start; r < rows.length; r += 1) {
    const cells = rows[r];
    if (!cells || cells.length === 0) continue;

    // modo colunas nomeadas
    if (handleIdx >= 0 || urlIdx >= 0) {
      const platform =
        platformIdx >= 0 ? normalizePlatformCell(cells[platformIdx] ?? "") : null;
      const urlCell = urlIdx >= 0 ? (cells[urlIdx] ?? "").trim() : "";
      const handleCell = handleIdx >= 0 ? (cells[handleIdx] ?? "").trim() : "";

      if (urlCell) {
        const line = cellToImportLine(urlCell, platform);
        if (line) lines.push(line);
        continue;
      }
      if (handleCell) {
        const line = cellToImportLine(handleCell, platform);
        if (line) lines.push(line);
      }
      continue;
    }

    // sem header: se 2+ colunas, tenta platform,handle ou handle,url
    if (cells.length >= 2) {
      const a = cells[0]?.trim() ?? "";
      const b = cells[1]?.trim() ?? "";
      const platA = normalizePlatformCell(a);
      if (platA && b) {
        const line = cellToImportLine(b, platA);
        if (line) lines.push(line);
        continue;
      }
      // url na 2ª coluna
      if (/instagram\.com|tiktok\.com/i.test(b)) {
        const line = cellToImportLine(b, platA);
        if (line) lines.push(line);
        continue;
      }
      // platform na 2ª
      const platB = normalizePlatformCell(b);
      if (platB && a) {
        const line = cellToImportLine(a, platB);
        if (line) lines.push(line);
        continue;
      }
    }

    // uma coluna (ou pega a 1ª célula útil)
    for (const cell of cells) {
      const line = cellToImportLine(cell, null);
      if (line) {
        lines.push(line);
        break;
      }
    }
  }

  // dedupe preservando ordem
  const seen = new Set<string>();
  const unique = lines.filter((line) => {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    text: unique.join("\n"),
    rowCount: Math.max(0, rows.length - (skippedHeader ? 1 : 0)),
    lineCount: unique.length,
    skippedHeader,
    fileName: options?.fileName,
  };
}
