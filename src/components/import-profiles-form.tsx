"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Database, FileSpreadsheet, Info, Sparkles, Upload, X } from "lucide-react";
import {
  INSTAGRAM_GRID_LIMIT,
  INSTAGRAM_REELS_LIMIT,
  MASS_IMPORT_SCRAPE_CHUNK,
  MAX_IMPORT_PROFILES,
  MAX_SCRAPE_PROFILE_IDS,
  SCRAPE_MAX_PARALLEL_KEYS,
  TIKTOK_VIDEO_LIMIT,
  type Platform,
} from "@/lib/constants";
import { csvToImportText } from "@/lib/import-csv";
import {
  formatDurationSeconds,
  formatMaxDurationLabel,
  SCRAPE_MAX_MINUTES_PER_PROFILE,
} from "@/lib/scrape-eta";
import { parseProfileImport } from "@/lib/profile-url";
import type { ScrapeProgressEvent } from "@/lib/scrapers/types";

type ImportResponse = {
  created: number;
  updated: number;
  totalValid: number;
  profileIds: string[];
  createdIds?: string[];
  updatedIds?: string[];
  invalid: Array<{ input: string; reason: string }>;
  error?: string;
};

type ScrapeResult = {
  status: string;
  profilesTotal: number;
  profilesOk: number;
  profilesSkipped?: number;
  postsFound: number;
  requestsMade?: number;
  recordsReceived?: number;
  estimatedCredits?: number;
  errors?: Array<{ handle: string; error: string }>;
};

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "run"; runId: string }
  | { type: "progress"; event: ScrapeProgressEvent }
  | { type: "complete"; result: ScrapeResult }
  | { type: "error"; error: string };

function datasetLabel(datasetId: string, platform: string) {
  if (datasetId === "gd_lk5ns7kz21pck8jpis") {
    return "Instagram Grade";
  }
  if (datasetId === "gd_lyclm20il4r5helnj") {
    return "Instagram Reels";
  }
  if (datasetId === "gd_m7n5v2gq296pex2f5m") {
    return "TikTok videos";
  }
  return platform === "instagram" ? "Instagram perfil" : "TikTok perfil";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readProgressStream(
  response: Response,
  onMessage: (message: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("A coleta nao abriu o canal de progresso.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let result: ScrapeResult | null = null;

  const consume = (line: string) => {
    if (!line.trim()) {
      return;
    }

    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      return;
    }

    if (event.type === "status") {
      onMessage(event.message);
    } else if (event.type === "progress") {
      if (event.event.type === "started") {
        onMessage(
          `Coleta preparada: ${event.event.profilesAttempted} perfil(is), ${event.event.datasetsTotal} etapa(s). A Bright Data esta processando...`,
        );
      } else {
        const label = datasetLabel(event.event.datasetId, event.event.platform);
        const status = event.event.status === "success" ? "concluido" : "falhou";
        const records =
          event.event.recordsReceived > 0
            ? ` ${event.event.recordsReceived} registro(s).`
            : "";
        onMessage(
          `Etapa ${event.event.datasetsCompleted}/${event.event.datasetsTotal}: @${event.event.handle} — ${label} ${status}.${records}`,
        );
      }
    } else if (event.type === "complete") {
      result = event.result;
    } else if (event.type === "error") {
      throw new Error(event.error);
    }
  };

  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
    if (chunk.done) {
      break;
    }
  }

  if (buffer.trim()) {
    consume(buffer);
  }

  if (!result) {
    throw new Error("A coleta terminou sem retornar o resultado final.");
  }

  return result;
}

/**
 * Dispara um lote de scrape com stream. Em 409 (coleta em andamento), espera e tenta de novo.
 */
async function runScrapeChunk(
  profileIds: string[],
  onMessage: (message: string) => void,
  options?: { force?: boolean },
): Promise<ScrapeResult> {
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const scrapeResponse = await fetch("/api/scrape/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "profiles",
        profileIds,
        stream: true,
        force: Boolean(options?.force),
      }),
    });

    if (scrapeResponse.status === 409) {
      onMessage(
        `Aguardando liberar a coleta anterior (tentativa ${attempt}/${maxAttempts})...`,
      );
      await sleep(1500 * attempt);
      continue;
    }

    if (!scrapeResponse.ok) {
      const scrapePayload = (await scrapeResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(
        scrapePayload?.error
          ? `Coleta do lote falhou: ${scrapePayload.error}`
          : "Coleta do lote falhou.",
      );
    }

    return readProgressStream(scrapeResponse, onMessage);
  }

  throw new Error("Timeout aguardando liberar a coleta em andamento (409).");
}

function formatElapsed(ms: number) {
  return formatDurationSeconds(ms / 1000);
}

function chunkIds(ids: string[], size: number) {
  const chunkSize = Math.min(Math.max(1, size), MAX_SCRAPE_PROFILE_IDS);
  return Array.from({ length: Math.ceil(ids.length / chunkSize) }, (_, index) =>
    ids.slice(index * chunkSize, (index + 1) * chunkSize),
  );
}

export function ImportProfilesForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [text, setText] = useState("");
  const [defaultPlatform, setDefaultPlatform] = useState<Platform>("instagram");
  const [message, setMessage] = useState<string | null>(null);
  const [progressDetail, setProgressDetail] = useState<string | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<ImportResponse["invalid"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [importCountSnapshot, setImportCountSnapshot] = useState(0);
  const [activeMode, setActiveMode] = useState<"register" | "api" | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvInfo, setCsvInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(
    () => parseProfileImport(text, defaultPlatform),
    [text, defaultPlatform],
  );
  const validCount = preview.valid.length;
  const invalidCount = preview.invalid.length;
  const isMass = validCount > 1;
  const overLimit = validCount > MAX_IMPORT_PROFILES;
  const maxTimeLabel = formatMaxDurationLabel(Math.max(validCount, 1));
  const batchCount =
    validCount > 0 ? Math.ceil(validCount / MASS_IMPORT_SCRAPE_CHUNK) : 0;
  const estCredits = validCount * 11;

  useEffect(() => {
    if (startedAt === null) {
      return;
    }

    const tick = () => setElapsedLabel(formatElapsed(Date.now() - startedAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  async function onCsvSelected(file: File | null) {
    setError(null);
    setCsvInfo(null);
    if (!file) {
      setCsvFileName(null);
      return;
    }

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".txt") && file.type && !file.type.includes("csv") && !file.type.includes("text")) {
      setError("Envie um arquivo .csv (ou .txt com a lista).");
      setCsvFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const raw = await file.text();
      const parsed = csvToImportText(raw, { fileName: file.name });
      if (!parsed.text.trim()) {
        setError(
          `Nenhum perfil encontrado em “${file.name}”. Use colunas handle/url/platform ou uma @/URL por linha.`,
        );
        setCsvFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setText(parsed.text);
      setCsvFileName(file.name);
      setCsvInfo(
        `CSV “${file.name}”: ${parsed.lineCount} perfil(is) carregado(s)` +
          (parsed.skippedHeader ? " (cabecalho detectado)" : "") +
          `. Escolha “So cadastrar @” ou “Importar com API”.`,
      );
      setMessage(null);
      setInvalid([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler o CSV.");
      setCsvFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clearCsv() {
    setCsvFileName(null);
    setCsvInfo(null);
    setText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function runImport(mode: "register" | "api") {
    setMessage(null);
    setProgressDetail(null);
    setElapsedLabel(null);
    setInvalid([]);
    setError(null);

    if (overLimit) {
      setError(
        `Limite de ${MAX_IMPORT_PROFILES} perfis por importacao. Divida a lista (agora: ${validCount}).`,
      );
      return;
    }

    if (validCount === 0) {
      setError("Nenhum perfil valido na lista. Confira URLs, @handles e a plataforma.");
      setInvalid(preview.invalid);
      return;
    }

    if (mode === "api" && validCount >= 30) {
      const confirmed = window.confirm(
        `Importar COM API — ${validCount} perfil(is).\n\n` +
          `• Cadastro local dos @ (sem credito)\n` +
          `• Depois coleta Bright Data em ${batchCount} lote(s) de ate ${MASS_IMPORT_SCRAPE_CHUNK}\n` +
          `• Tempo maximo ~${formatMaxDurationLabel(validCount)}\n` +
          `• Ate ~${estCredits} registros se todos os datasets responderem\n` +
          `• Free tier: 5k creditos/conta/mes\n\n` +
          `Nao feche a pagina ate terminar. Continuar?`,
      );
      if (!confirmed) {
        return;
      }
    }

    if (mode === "register" && validCount >= 100) {
      const confirmed = window.confirm(
        `So cadastrar ${validCount} @ no tracker (SEM API / SEM credito Bright Data).\n\n` +
          `Os perfis entram so com handle/URL. Voce pode coletar dados depois na biblioteca.\n\n` +
          `Continuar?`,
      );
      if (!confirmed) {
        return;
      }
    }

    setIsSubmitting(true);
    setActiveMode(mode);
    setImportCountSnapshot(validCount);
    const runStartedAt = Date.now();
    setStartedAt(runStartedAt);

    try {
      setProgressDetail(
        mode === "register"
          ? `Cadastrando ${validCount} @ no banco local (sem API)...`
          : `Cadastrando ${validCount} perfil(is) no banco local...`,
      );
      const response = await fetch("/api/profiles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, defaultPlatform }),
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok) {
        setInvalid(payload.invalid ?? []);
        throw new Error(payload.error ?? "Falha ao importar perfis.");
      }

      setInvalid(payload.invalid ?? []);

      if (payload.profileIds.length === 0) {
        setMessage(
          `Nenhum perfil valido para cadastrar${payload.invalid?.length ? ` (${payload.invalid.length} linha(s) invalida(s))` : ""}.`,
        );
        setProgressDetail(null);
        startTransition(() => router.refresh());
        return;
      }

      const elapsedRegister = formatElapsed(Date.now() - runStartedAt);

      // Só @ — sem Bright Data
      if (mode === "register") {
        setMessage(
          `${payload.created} criados, ${payload.updated} reativados/atualizados ` +
            `(${payload.profileIds.length} no tracker). Sem coleta API. Tempo: ${elapsedRegister}.` +
            (csvFileName ? ` Origem: ${csvFileName}.` : ""),
        );
        setProgressDetail(null);
        setText("");
        setCsvFileName(null);
        setCsvInfo(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        startTransition(() => router.refresh());
        return;
      }

      // Com API: cadastro + scrape
      const profileCount = payload.profileIds.length;
      setMessage(
        `${payload.created} criados, ${payload.updated} reativados/atualizados. Iniciando coleta API de ${profileCount} perfil(is)...`,
      );

      const chunks = chunkIds(payload.profileIds, MASS_IMPORT_SCRAPE_CHUNK);
      const scrapeResults: ScrapeResult[] = [];
      const chunkErrors: string[] = [];

      for (const [index, profileIds] of chunks.entries()) {
        const label = `Lote ${index + 1}/${chunks.length} (${profileIds.length} perfis)`;
        setProgressDetail(
          `${label}. Tempo maximo deste lote: ${formatMaxDurationLabel(profileIds.length)}.`,
        );

        try {
          const scrapePayload: ScrapeResult = await runScrapeChunk(
            profileIds,
            (detail) => setProgressDetail(`${label}: ${detail}`),
            { force: false },
          );
          scrapeResults.push(scrapePayload);

          const scrapeErrors = scrapePayload.errors ?? [];
          if (scrapeErrors.length > 0) {
            const sample = scrapeErrors
              .slice(0, 3)
              .map((item: { handle: string; error: string }) => `@${item.handle}: ${item.error}`)
              .join(" | ");
            chunkErrors.push(
              `${label}: ${scrapeErrors.length} erro(s)${sample ? ` — ${sample}` : ""}`,
            );
          }
        } catch (chunkError) {
          const detail =
            chunkError instanceof Error ? chunkError.message : "Falha no lote.";
          chunkErrors.push(`${label}: ${detail}`);
          setProgressDetail(`${label} falhou: ${detail}. Seguindo para o proximo lote...`);
          await sleep(800);
        }
      }

      const totals = scrapeResults.reduce(
        (total, scrapeResult) => ({
          profilesTotal: total.profilesTotal + scrapeResult.profilesTotal,
          profilesOk: total.profilesOk + scrapeResult.profilesOk,
          postsFound: total.postsFound + scrapeResult.postsFound,
          profilesSkipped: total.profilesSkipped + (scrapeResult.profilesSkipped ?? 0),
          errors: total.errors + (scrapeResult.errors?.length ?? 0),
          recordsReceived: total.recordsReceived + (scrapeResult.recordsReceived ?? 0),
        }),
        {
          profilesTotal: 0,
          profilesOk: 0,
          postsFound: 0,
          profilesSkipped: 0,
          errors: 0,
          recordsReceived: 0,
        },
      );

      const elapsed = formatElapsed(Date.now() - runStartedAt);
      const baseSummary =
        `${payload.created} criados, ${payload.updated} reativados/atualizados. ` +
        (scrapeResults.length > 0
          ? `Coleta API: ${totals.profilesOk}/${totals.profilesTotal} perfis ok, ${totals.postsFound} posts` +
            `${totals.profilesSkipped ? `, ${totals.profilesSkipped} recente(s) pulado(s)` : ""}` +
            `${totals.errors ? `, ${totals.errors} erro(s) de perfil` : ""}` +
            `${totals.recordsReceived ? `, ${totals.recordsReceived} registros recebidos` : ""}. `
          : "Nenhum lote de coleta concluiu. ") +
        `Tempo total: ${elapsed}.`;

      if (chunkErrors.length > 0) {
        setMessage(baseSummary);
        setError(
          `Importacao parcial: ${chunkErrors.length} lote(s) com problema.\n${chunkErrors.slice(0, 8).join("\n")}` +
            (chunkErrors.length > 8 ? `\n… +${chunkErrors.length - 8} lote(s)` : ""),
        );
      } else {
        setMessage(baseSummary);
      }

      setProgressDetail(null);
      setText("");
      setCsvFileName(null);
      setCsvInfo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(null);
      setProgressDetail(null);
      setError(err instanceof Error ? err.message : "Falha ao importar perfis.");
    } finally {
      setIsSubmitting(false);
      setActiveMode(null);
      setStartedAt(null);
      setImportCountSnapshot(0);
    }
  }

  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className="import-callout" role="note">
        <div className="import-callout-title">
          <Info size={16} aria-hidden />
          <strong>Importacao em massa — 2 modos</strong>
        </div>
        <ol className="import-steps">
          <li>
            <strong>So cadastrar @</strong> — grava ate{" "}
            <strong>{MAX_IMPORT_PROFILES}</strong> handles no tracker.{" "}
            <em>Sem Bright Data, sem credito.</em> Ideal para montar a lista rapido.
          </li>
          <li>
            <strong>Importar com API</strong> — cadastra os @ e ja roda a coleta Bright Data
            (posts, followers, etc.) em lotes de ate{" "}
            <strong>{MASS_IMPORT_SCRAPE_CHUNK}</strong>.
          </li>
          <li>
            <strong>CSV</strong> — envie <code>.csv</code> (Excel: “Salvar como CSV”). Colunas
            aceitas: <code>handle</code>, <code>url</code>, <code>platform</code> — ou uma
            coluna com @/URL por linha. Os dois modos acima valem para o arquivo.
          </li>
          <li>
            Com API: Instagram perfil + {INSTAGRAM_GRID_LIMIT} Grade + {INSTAGRAM_REELS_LIMIT}{" "}
            Reels · TikTok perfil + {TIKTOK_VIDEO_LIMIT} videos.
          </li>
          <li>
            Coleta recente (&lt; 30 min) e pulada para economizar o free tier (5k/conta).
          </li>
        </ol>
        <div className="import-eta">
          <Clock3 size={15} aria-hidden />
          <div>
            <p>
              <strong>Tempo (so no modo com API)</strong>
            </p>
            <p>
              ~{SCRAPE_MAX_MINUTES_PER_PROFILE} min por perfil por chave. Varias chaves boas
              em /settings aceleram (ate {SCRAPE_MAX_PARALLEL_KEYS} em paralelo).
            </p>
            <p className="import-eta-live">
              Nesta lista:{" "}
              <strong>
                {validCount === 0
                  ? "cole URLs ou @handles"
                  : overLimit
                    ? `acima do limite (${validCount}/${MAX_IMPORT_PROFILES})`
                    : `${validCount} valido(s)`}
              </strong>
              {isMass && validCount > 0 && !overLimit
                ? ` · so @ = instantaneo · com API ~${maxTimeLabel} · ${batchCount} lote(s) · ~${estCredits} records`
                : null}
            </p>
          </div>
        </div>
      </div>

      <label className="form-stack">
        <span className="meta">Plataforma para @ sem URL</span>
        <select
          className="control"
          value={defaultPlatform}
          onChange={(event) => setDefaultPlatform(event.target.value as Platform)}
          disabled={isSubmitting}
        >
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
        </select>
      </label>

      <div className="form-stack">
        <span className="meta">Arquivo CSV (opcional)</span>
        <div className="import-csv-row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain,.txt"
            className="import-csv-input"
            disabled={isSubmitting}
            onChange={(event) => {
              void onCsvSelected(event.target.files?.[0] ?? null);
            }}
          />
          <button
            type="button"
            className="button ghost"
            disabled={isSubmitting}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet size={16} />
            Escolher .csv
          </button>
          {csvFileName ? (
            <button
              type="button"
              className="button ghost import-csv-clear"
              disabled={isSubmitting}
              onClick={clearCsv}
              title="Limpar arquivo e lista"
            >
              <X size={16} />
              {csvFileName}
            </button>
          ) : (
            <span className="meta">ou cole a lista abaixo</span>
          )}
        </div>
        {csvInfo ? <p className="message import-preview">{csvInfo}</p> : null}
        <p className="meta">
          Ex.: <code>handle</code> / <code>platform,handle</code> /{" "}
          <code>url</code> — separador , ; ou tab. UTF-8 com BOM do Excel ok.
        </p>
      </div>

      <label className="form-stack">
        <span className="meta">
          Lista de perfis
          {validCount > 0 || invalidCount > 0
            ? ` · ${validCount} valido(s)${invalidCount ? `, ${invalidCount} invalido(s)` : ""}`
            : ""}
          {overLimit ? ` · limite ${MAX_IMPORT_PROFILES}` : ""}
          {csvFileName ? ` · de ${csvFileName}` : ""}
        </span>
        <textarea
          className="textarea"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (csvFileName) {
              setCsvInfo("Lista editada apos o CSV — os botoes usam o texto atual.");
            }
          }}
          disabled={isSubmitting}
          placeholder={`https://www.instagram.com/perfil/
https://www.tiktok.com/@perfil
@perfil
instagram:@perfil
tiktok:@perfil

Ou envie um .csv com handle / url / platform`}
        />
      </label>

      {validCount > 0 && !isSubmitting ? (
        <p className={`message ${overLimit ? "error" : "import-preview"}`}>
          {overLimit ? (
            <>
              <strong>{validCount} perfis</strong> ultrapassam o limite de{" "}
              <strong>{MAX_IMPORT_PROFILES}</strong>. Divida a lista.
            </>
          ) : (
            <>
              <strong>{validCount}</strong> perfil(is) valido(s). Escolha o modo abaixo:{" "}
              <strong>so @</strong> (sem credito) ou <strong>com API</strong>
              {isMass
                ? ` (~${maxTimeLabel}, ${batchCount} lote(s))`
                : ` (~${formatMaxDurationLabel(1)})`}
              .
            </>
          )}
        </p>
      ) : null}

      <div className="import-actions">
        <button
          className="button ghost"
          type="button"
          disabled={!text.trim() || isPending || isSubmitting || overLimit}
          onClick={() => void runImport("register")}
          title="Grava so os @ no tracker. Nao gasta credito Bright Data."
        >
          <Database size={16} />
          {isSubmitting && activeMode === "register"
            ? `Cadastrando ${importCountSnapshot} @...`
            : validCount > 1
              ? `So cadastrar ${validCount} @`
              : "So cadastrar @"}
        </button>
        <button
          className="button teal"
          type="button"
          disabled={!text.trim() || isPending || isSubmitting || overLimit}
          onClick={() => void runImport("api")}
          title="Cadastra os @ e roda a coleta Bright Data (gasta credito)."
        >
          {isSubmitting && activeMode === "api" ? (
            <Upload size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          {isSubmitting && activeMode === "api"
            ? importCountSnapshot > 1
              ? `API: ${importCountSnapshot} perfis...`
              : "Coletando com API..."
            : validCount > 1
              ? `Importar ${validCount} com API`
              : "Importar com API"}
        </button>
      </div>

      {isSubmitting ? (
        <div className="import-progress" aria-live="polite">
          <p className="message">
            <strong>
              {activeMode === "register" ? "Cadastro local (sem API)" : "Importacao com API"}
            </strong>
            {elapsedLabel ? ` · decorrido ${elapsedLabel}` : null}
            {activeMode === "api" && importCountSnapshot > 0
              ? ` · teto ~${formatMaxDurationLabel(importCountSnapshot)}`
              : null}
          </p>
          {progressDetail ? <p className="message">{progressDetail}</p> : null}
          <p className="meta">
            {activeMode === "register"
              ? "So grava handle/URL no SQLite. Sem chamada Bright Data."
              : "Nao feche a pagina. Cadastro local ja fica salvo antes da coleta; se um lote falhar, os outros seguem."}
          </p>
        </div>
      ) : null}

      {message ? <p className="message success">{message}</p> : null}
      {error ? (
        <div className="message error" style={{ whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      ) : null}
      {invalid.length > 0 ? (
        <div className="message error">
          <strong>Linhas invalidas ({invalid.length})</strong>
          {invalid.slice(0, 40).map((item) => (
            <div key={`${item.input}-${item.reason}`}>
              {item.input}: {item.reason}
            </div>
          ))}
          {invalid.length > 40 ? <div>… +{invalid.length - 40} linha(s)</div> : null}
        </div>
      ) : null}
    </form>
  );
}
