import { numberFromUnknown } from "@/lib/scrapers/parse";

const APIFY_BASE = "https://api.apify.com/v2";
const DEFAULT_TIMEOUT_MS = 90_000;
const POLL_TRIES = 40;
const POLL_MS = 3000;

export type ApifyRecord = Record<string, unknown>;

export class ApifyRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly rawBody?: string | null,
  ) {
    super(message);
    this.name = "ApifyRequestError";
  }
}

function apifyToken(token?: string | null) {
  return token?.trim() || "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function compactText(value: string, max = 320) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function safeProviderDetail(text: string) {
  const raw = text?.trim() ?? "";
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as unknown;
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      const rec = payload as ApifyRecord;
      for (const k of ["message", "error", "detail", "description", "error_message", "msg", "reason"]) {
        const v = rec[k];
        if (typeof v === "string" && v.trim()) return compactText(v, 280);
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          const nested = v as ApifyRecord;
          for (const nk of ["message", "error", "detail"]) {
            const nv = nested[nk];
            if (typeof nv === "string" && nv.trim()) return compactText(nv, 280);
          }
        }
      }
      return compactText(JSON.stringify(payload), 280);
    }
    if (typeof payload === "string" && payload.trim()) return compactText(payload, 280);
  } catch {
    // raw
  }
  return compactText(raw, 280);
}

export function isEmptyContentApifyError(detail: string) {
  return /no public posts|no posts found|profile has no|does not have any public|no reels|empty profile|0 posts/i.test(detail);
}

export function isUnavailableTargetError(detail: string) {
  return /page isn't available|user not found|profile not found|does not exist|invalid username|account has been|content isn't available|no user found|profile is private|private account|restricted profile/i.test(detail);
}

export function isApifyRequestError(error: unknown): error is ApifyRequestError {
  if (error instanceof ApifyRequestError) return true;
  if (typeof error !== "object" || error === null) return false;
  const e = error as { name?: unknown; message?: unknown };
  return e.name === "ApifyRequestError" && typeof e.message === "string";
}

function formatUnknownError(error: unknown): string {
  if (isApifyRequestError(error)) return error.message;
  if (error instanceof Error) {
    const bits = [error.name !== "Error" ? error.name : null, error.message].filter(Boolean);
    const cause = "cause" in error && error.cause != null ? formatUnknownError(error.cause) : null;
    const base = bits.join(": ") || "Error sem mensagem";
    return cause ? `${base} | cause: ${cause}` : base;
  }
  if (typeof error === "string" && error.trim()) return compactText(error, 400);
  try {
    return compactText(JSON.stringify(error), 400);
  } catch {
    return String(error);
  }
}

function classifyApifyMessage(message: string, statusCode?: number) {
  const lower = message.toLowerCase();
  if (statusCode === 401 || statusCode === 403) return "authentication";
  if (statusCode === 402 || /credit|balance|funds|suspended|inactive|permission|activate|payment required|over quota|limit exceeded/i.test(lower)) return "account";
  if (lower.includes("not_found") || isUnavailableTargetError(message) || /perfil ou conteudo indisponivel|restricted profile/i.test(lower)) return "not_found";
  if (/timed-out|aborted|ainda nao concluiu|demorou demais|coleta cancelada/i.test(lower)) return "snapshot_pending";
  if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500) || /timeout|temporar|fetch failed|econnreset|enotfound|network|socket/i.test(lower)) return "transient";
  return "provider";
}

export function getApifyErrorInfo(error: unknown) {
  if (isApifyRequestError(error)) {
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : undefined;
    const message = error.message || "ApifyRequestError sem mensagem";
    return { code: classifyApifyMessage(message, statusCode), message: compactText(message, 480), statusCode };
  }
  const message = formatUnknownError(error);
  return { code: classifyApifyMessage(message), message: compactText(message || "Falha Apify sem detalhe", 480), statusCode: undefined as number | undefined };
}

export function getApifyString(record: ApifyRecord, keys: string[]) {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function getApifyNumber(record: ApifyRecord, keys: string[]) {
  for (const k of keys) {
    const v = numberFromUnknown(record[k]);
    if (v !== null) return v;
  }
  return null;
}

export function parseApifyDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value > 10_000_000_000 ? value : value * 1000);
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export type ApifyDatasetResult = {
  actor: string;
  records: ApifyRecord[];
  requestsMade: number;
};

async function apifyFetch(
  path: string,
  init?: RequestInit,
  tokenOverride?: string | null,
  externalSignal?: AbortSignal,
) {
  const token = apifyToken(tokenOverride);
  if (!token) throw new ApifyRequestError("Token Apify da sessão não configurado.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const url = `${APIFY_BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const text = await res.text();
    if (!res.ok) {
      const detail = safeProviderDetail(text);
      const hint = detail ?? (text.trim() ? compactText(text, 200) : "corpo vazio");
      throw new ApifyRequestError(`Apify HTTP ${res.status}: ${hint}`, res.status, text.slice(0, 800));
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      const preview = safeProviderDetail(text);
      throw new ApifyRequestError(`Resposta Apify não é JSON válido: ${preview ?? text.slice(0, 400)}`, undefined, text.slice(0, 500));
    }
  } catch (error) {
    if (externalSignal?.aborted) throw new ApifyRequestError(`Coleta cancelada (Apify ${path.slice(0, 60)}).`);
    if (isApifyRequestError(error)) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ApifyRequestError(`Apify demorou demais (>${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s) em ${path.slice(0, 60)}.`);
    throw new ApifyRequestError(`Falha de rede/API Apify em ${path.slice(0, 60)}: ${formatUnknownError(error)}`);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}

export async function scrapeApifyActor(
  actor: string,
  input: Record<string, unknown>,
  token?: string | null,
  options?: { signal?: AbortSignal },
): Promise<ApifyDatasetResult> {
  const runJson = (await apifyFetch(`/acts/${encodeURIComponent(actor)}/runs`, { method: "POST", body: JSON.stringify(input) }, token, options?.signal)) as {
    data?: { id: string; defaultDatasetId: string; status: string };
  };
  const runId = runJson?.data?.id;
  let datasetId = runJson?.data?.defaultDatasetId;
  let status = String(runJson?.data?.status ?? "RUNNING");
  if (!runId || !datasetId) throw new ApifyRequestError(`Apify ${actor} não retornou runId/datasetId: ${JSON.stringify(runJson).slice(0, 600)}`);

  for (let i = 0; i < POLL_TRIES; i++) {
    if (status === "SUCCEEDED" || status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED") break;
    if (options?.signal?.aborted) throw new ApifyRequestError("Coleta cancelada durante espera do run.");
    await sleep(POLL_MS);
    const poll = (await apifyFetch(`/acts/${encodeURIComponent(actor)}/runs/${encodeURIComponent(runId)}`, undefined, token, options?.signal)) as {
      data?: { status: string; defaultDatasetId: string; statusMessage?: string };
    };
    if (poll?.data?.status) status = String(poll.data.status);
    if (poll?.data?.defaultDatasetId) datasetId = poll.data.defaultDatasetId;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      const msg = (poll as unknown as { data?: { statusMessage?: string } })?.data?.statusMessage ?? "";
      throw new ApifyRequestError(`Apify run ${runId} falhou: status=${status} ${compactText(msg, 200)}`);
    }
  }
  if (status !== "SUCCEEDED") throw new ApifyRequestError(`Apify ainda não concluiu o run ${runId} após ${POLL_TRIES} polls (~${Math.round((POLL_TRIES * POLL_MS) / 1000)}s).`);

  const items = (await apifyFetch(`/datasets/${encodeURIComponent(datasetId)}/items?format=json&clean=true`, undefined, token, options?.signal)) as unknown;
  const records = Array.isArray(items) ? (items.filter((x) => typeof x === "object" && x !== null) as ApifyRecord[]) : [];
  // Trata erro embarcado em lista (ex: restricted profile)
  const errors = records.map((r) => (r.error as string) ?? (r.errorMessage as string) ?? "").filter(Boolean);
  if (records.length > 0 && errors.length === records.length) {
    const first = errors[0];
    if (isUnavailableTargetError(first) || /restricted profile/i.test(first)) {
      // Se todos são erro de restrito/privado, considera vazio útil (não falha da chave)
      if (errors.every((e) => isUnavailableTargetError(e) || /restricted profile/i.test(e))) return { actor, records: [], requestsMade: 1 };
    }
    // Se for erro genérico do actor, propaga como falha
    if (errors.every((e) => e.trim().length > 0)) throw new ApifyRequestError(`Apify ${actor} retornou erro no dataset: ${compactText(first, 280)}`);
  }
  return { actor, records, requestsMade: 1 };
}
