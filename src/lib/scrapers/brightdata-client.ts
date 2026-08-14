import { numberFromUnknown } from "@/lib/scrapers/parse";

const BRIGHTDATA_API_BASE = "https://api.brightdata.com/datasets/v3";
const DEFAULT_TIMEOUT_MS = 90_000;
/** Grade/Reels/Videos costumam ser async; precisa cobrir alem do sync ~1 min da doc BD. */
const SNAPSHOT_POLL_ATTEMPTS = 45;
/** 2s em vez de 3s: mesma janela util com menos espera morta entre polls. */
const SNAPSHOT_POLL_DELAY_MS = 2_000;

export type BrightDataRecord = Record<string, unknown>;
export type BrightDataScrapeInput = {
  url: string;
  num_of_posts?: number;
  post_type?: string;
  posts_to_not_include?: string[];
  start_date?: string;
  end_date?: string;
};
export type BrightDataDatasetResult = {
  datasetId: string;
  records: BrightDataRecord[];
  requestsMade: number;
};

export class BrightDataRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly rawBody?: string | null,
  ) {
    super(message);
    this.name = "BrightDataRequestError";
  }
}

type BrightDataScrapeOptions = {
  pollAttempts?: number;
  pollDelayMs?: number;
  query?: Record<string, string | number | boolean>;
};

function brightDataApiKey(apiKey?: string | null) {
  return apiKey?.trim() || "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactText(value: string, max = 320) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Extrai mensagem util de JSON/HTML/texto cru da BD. */
export function safeProviderDetail(text: string) {
  const raw = text?.trim() ?? "";
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as unknown;
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      const record = payload as BrightDataRecord;
      for (const key of [
        "message",
        "error",
        "detail",
        "description",
        "error_message",
        "errorMessage",
        "msg",
        "reason",
        "status_message",
      ]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
          return compactText(value, 280);
        }
        // nested { error: { message } }
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          const nested = value as BrightDataRecord;
          for (const nk of ["message", "error", "detail", "description"]) {
            const nv = nested[nk];
            if (typeof nv === "string" && nv.trim()) {
              return compactText(nv, 280);
            }
          }
        }
      }
      // fallback: serializa chaves uteis
      try {
        return compactText(JSON.stringify(payload), 280);
      } catch {
        /* ignore */
      }
    }
    if (typeof payload === "string" && payload.trim()) {
      return compactText(payload, 280);
    }
  } catch {
    // corpo nao-JSON
  }

  return compactText(raw, 280);
}

function parseJson(text: string, context?: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const preview = safeProviderDetail(text);
    throw new BrightDataRequestError(
      `Resposta Bright Data nao e JSON valido${context ? ` (${context})` : ""}${
        preview ? `: ${preview}` : "."
      }`,
      undefined,
      text.slice(0, 500),
    );
  }
}

function recordErrorDetail(record: BrightDataRecord) {
  const value = record.error ?? record.error_message ?? record.errorMessage ?? record.warning;
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const hasUsableData = [
    "followers",
    "following",
    "posts",
    "post_id",
    "video_id",
    "views",
    "likes",
    "description",
    "caption",
  ].some((key) => record[key] !== undefined && record[key] !== null);
  return hasUsableData ? null : compactText(value, 280);
}

/** Perfil sem grade/reels públicos: vazio util, nao e falha de chave ou contrato. */
export function isEmptyContentProviderError(detail: string) {
  return /no public posts|no posts found|profile has no|does not have any public|no reels|empty profile|0 posts/i.test(
    detail,
  );
}

/** Alvo inexistente/indisponivel no Instagram/TikTok: nao adianta trocar de chave. */
export function isUnavailableTargetError(detail: string) {
  return /page isn't available|user not found|profile not found|does not exist|invalid username|account has been|content isn't available|no user found|profile is private|private account/i.test(
    detail,
  );
}

export function recordsFromBrightDataResponse(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as BrightDataRecord[];
  }

  const records = value.filter(
    (item): item is BrightDataRecord => typeof item === "object" && item !== null,
  );
  const errors = records.map(recordErrorDetail).filter((detail): detail is string => Boolean(detail));
  if (records.length > 0 && errors.length === records.length) {
    if (errors.every(isEmptyContentProviderError)) {
      return [];
    }

    const first = errors[0];
    if (errors.some(isUnavailableTargetError)) {
      throw new BrightDataRequestError(
        `Perfil ou conteudo indisponivel no provedor: ${first}.`,
      );
    }

    throw new BrightDataRequestError(`Bright Data retornou erro no dataset: ${first}.`);
  }

  return records;
}

/** Duck-type: instanceof quebra entre chunks do bundler. */
export function isBrightDataRequestError(error: unknown): error is BrightDataRequestError {
  if (error instanceof BrightDataRequestError) return true;
  if (typeof error !== "object" || error === null) return false;
  const e = error as { name?: unknown; message?: unknown };
  return e.name === "BrightDataRequestError" && typeof e.message === "string";
}

function formatUnknownError(error: unknown): string {
  if (isBrightDataRequestError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    const bits = [error.name !== "Error" ? error.name : null, error.message].filter(Boolean);
    const cause =
      "cause" in error && error.cause != null
        ? formatUnknownError(error.cause)
        : null;
    const base = bits.join(": ") || "Error sem mensagem";
    return cause ? `${base} | cause: ${cause}` : base;
  }
  if (typeof error === "string" && error.trim()) {
    return compactText(error, 400);
  }
  try {
    return compactText(JSON.stringify(error), 400);
  } catch {
    return String(error);
  }
}

async function brightDataFetch(path: string, init?: RequestInit, apiKeyOverride?: string | null) {
  const apiKey = brightDataApiKey(apiKeyOverride);

  if (!apiKey) {
    throw new BrightDataRequestError("Chave Bright Data da sessao nao configurada.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${BRIGHTDATA_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();

    if (!response.ok) {
      const detail = safeProviderDetail(text);
      const bodyHint =
        detail ??
        (text.trim()
          ? compactText(text, 200)
          : "corpo vazio");
      throw new BrightDataRequestError(
        `Bright Data HTTP ${response.status}: ${bodyHint}`,
        response.status,
        text.slice(0, 800),
      );
    }

    return parseJson(text, path.slice(0, 80));
  } catch (error) {
    if (isBrightDataRequestError(error)) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new BrightDataRequestError(
        `Bright Data demorou demais para responder (>${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s) em ${path.slice(0, 60)}.`,
      );
    }
    // rede / DNS / etc.
    throw new BrightDataRequestError(
      `Falha de rede/API Bright Data em ${path.slice(0, 60)}: ${formatUnknownError(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadSnapshot(snapshotId: string, apiKey?: string | null) {
  return brightDataFetch(
    `/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
    undefined,
    apiKey,
  );
}

function snapshotFailureDetail(progress: BrightDataRecord, snapshotId: string) {
  for (const key of ["error", "message", "detail", "description", "failure_reason", "status_message"]) {
    const value = progress[key];
    if (typeof value === "string" && value.trim()) {
      return compactText(value, 280);
    }
  }
  try {
    return compactText(JSON.stringify(progress), 280);
  } catch {
    return `snapshot_id=${snapshotId}`;
  }
}

async function waitForSnapshot(
  snapshotId: string,
  apiKey?: string | null,
  options?: BrightDataScrapeOptions,
) {
  const pollAttempts = options?.pollAttempts ?? SNAPSHOT_POLL_ATTEMPTS;
  const pollDelayMs = options?.pollDelayMs ?? SNAPSHOT_POLL_DELAY_MS;

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const progress = await brightDataFetch(
      `/progress/${encodeURIComponent(snapshotId)}`,
      undefined,
      apiKey,
    );

    if (typeof progress === "object" && progress !== null) {
      const record = progress as BrightDataRecord;
      const status = String(record.status ?? "").toLowerCase();

      if (status === "ready") {
        return downloadSnapshot(snapshotId, apiKey);
      }

      if (status === "failed" || status === "error") {
        throw new BrightDataRequestError(
          `Bright Data snapshot falhou (${snapshotId}): ${snapshotFailureDetail(record, snapshotId)}`,
        );
      }
    }

    if (attempt < pollAttempts - 1) {
      await sleep(pollDelayMs);
    }
  }

  throw new BrightDataRequestError(
    `Bright Data ainda nao concluiu o snapshot ${snapshotId} apos ${pollAttempts} polls (~${Math.round((pollAttempts * pollDelayMs) / 1000)}s).`,
  );
}

export async function scrapeBrightDataDataset(
  datasetId: string,
  input: BrightDataScrapeInput | string,
  apiKey?: string | null,
  options?: BrightDataScrapeOptions,
): Promise<BrightDataDatasetResult> {
  const request = buildBrightDataScrapeRequest(datasetId, input, options);
  const urlHint =
    typeof input === "string" ? input : typeof input?.url === "string" ? input.url : "?";

  try {
    const result = await brightDataFetch(
      request.path,
      {
        method: "POST",
        body: JSON.stringify(request.body),
      },
      apiKey,
    );

    if (Array.isArray(result)) {
      return {
        datasetId,
        records: recordsFromBrightDataResponse(result),
        requestsMade: 1,
      };
    }

    if (typeof result === "object" && result !== null) {
      const record = result as BrightDataRecord;
      const snapshotId = record.snapshot_id;
      if (typeof snapshotId === "string" && snapshotId) {
        const snapshot = await waitForSnapshot(snapshotId, apiKey, options);
        return {
          datasetId,
          records: recordsFromBrightDataResponse(snapshot),
          requestsMade: 1,
        };
      }

      // resposta estranha (objeto sem snapshot e sem array)
      const preview = safeProviderDetail(JSON.stringify(result)) ?? "objeto sem snapshot_id";
      throw new BrightDataRequestError(
        `Bright Data dataset ${datasetId} respondeu sem snapshot_id nem lista (url=${urlHint}): ${preview}`,
      );
    }

    throw new BrightDataRequestError(
      `Bright Data dataset ${datasetId} respondeu tipo inesperado (url=${urlHint}).`,
    );
  } catch (error) {
    if (isBrightDataRequestError(error)) {
      // anexa dataset se ainda nao estiver na msg
      if (!error.message.includes(datasetId)) {
        throw new BrightDataRequestError(
          `[${datasetId}] ${error.message}`,
          error.statusCode,
          error.rawBody,
        );
      }
      throw error;
    }

    throw new BrightDataRequestError(
      `[${datasetId}] ${formatUnknownError(error)}`,
    );
  }
}

export function buildBrightDataScrapeRequest(
  datasetId: string,
  input: BrightDataScrapeInput | string,
  options?: BrightDataScrapeOptions,
) {
  const query = new URLSearchParams({
    dataset_id: datasetId,
    format: "json",
    include_errors: "true",
  });
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    query.set(key, String(value));
  }

  return {
    path: `/scrape?${query.toString()}`,
    body: {
      input: [typeof input === "string" ? { url: input } : input],
    },
  };
}

function classifyBrightDataMessage(message: string, statusCode?: number) {
  const lower = message.toLowerCase();
  if (statusCode === 401 || statusCode === 403) return "authentication";
  if (
    statusCode === 402 ||
    /credit|balance|funds|suspended|inactive|permission|activate/.test(lower)
  ) {
    return "account";
  }
  if (
    isUnavailableTargetError(message) ||
    /perfil ou conteudo indisponivel|page isn't available|user not found/.test(lower)
  ) {
    return "not_found";
  }
  if (
    statusCode === 429 ||
    (statusCode !== undefined && statusCode >= 500) ||
    /ainda nao concluiu o snapshot|demorou demais|timeout|temporar|fetch failed|econnreset|enotfound|network|socket/.test(
      lower,
    )
  ) {
    return "transient";
  }
  return "provider";
}

export function getBrightDataErrorInfo(error: unknown) {
  if (isBrightDataRequestError(error)) {
    const statusCode =
      typeof error.statusCode === "number" ? error.statusCode : undefined;
    const message = error.message || "Bright DataRequestError sem mensagem";
    return {
      code: classifyBrightDataMessage(message, statusCode),
      message: compactText(message, 480),
      statusCode,
    };
  }

  // qualquer Error / valor — nunca engolir como "Falha desconhecida" sem detalhe
  const message = formatUnknownError(error);
  return {
    code: classifyBrightDataMessage(message),
    message: compactText(message || "Falha Bright Data sem detalhe capturado", 480),
    statusCode: undefined as number | undefined,
  };
}

export function getBrightDataString(record: BrightDataRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

export function getBrightDataNumber(record: BrightDataRecord, keys: string[]) {
  for (const key of keys) {
    const value = numberFromUnknown(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function parseBrightDataDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 10_000_000_000 ? value : value * 1000);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}
