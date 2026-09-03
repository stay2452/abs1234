"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, FolderSync, Info, Library, RefreshCw } from "lucide-react";
import {
  ESTIMATED_CREDITS_PER_PROFILE,
  INSTAGRAM_GRID_LIMIT,
  INSTAGRAM_REELS_LIMIT,
  MAX_SCRAPE_ALL_PROFILES,
  MAX_SCRAPE_PROFILE_IDS,
  SCRAPE_FRESHNESS_WINDOW_MINUTES,
  SCRAPE_MAX_PARALLEL_KEYS,
  TIKTOK_VIDEO_LIMIT,
  type Platform,
} from "@/lib/constants";
import {
  estimateScrapeMaxSeconds,
  formatDurationSeconds,
  formatMaxDurationLabel,
  SCRAPE_MAX_MINUTES_PER_PROFILE,
} from "@/lib/scrape-eta";
import type { ScrapeProgressEvent } from "@/lib/scrapers/types";

type ScrapeResult = {
  status: string;
  profilesTotal: number;
  profilesAttempted?: number;
  profilesOk: number;
  profilesSkipped?: number;
  postsFound: number;
  postsNew?: number;
  postsUpdated?: number;
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

async function readProgressStream(
  response: Response,
  onMessage: (message: string) => void,
  parallelKeys = 1,
): Promise<ScrapeResult> {
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
        const n = event.event.profilesAttempted;
        const skipped = event.event.profilesSkipped;
        if (n === 0 && skipped > 0) {
          onMessage(
            `Perfil dentro da janela de ${SCRAPE_FRESHNESS_WINDOW_MINUTES} min — coleta pulada (economia de credito).`,
          );
        } else {
          onMessage(
            `Preparando ${n} perfil(is), ${event.event.datasetsTotal} etapa(s) Bright Data. Tempo maximo da puxada: ${formatMaxDurationLabel(Math.max(n, 1), parallelKeys)}.`,
          );
        }
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
 * Atualiza a biblioteca de perfis.
 * - scope all: todos os ativos (respeita janela de 30 min, salvo force)
 * - profileId: um perfil (com painel de transparencia e ETA)
 * - mode folder + profileIds: só os perfis da pasta (em lotes de MAX_SCRAPE_PROFILE_IDS)
 */
export function RunScrapeButton({
  compact = false,
  profileId,
  handle,
  platform,
  mode = "default",
  /** Perfis ativos na biblioteca (para ETA total da puxada). */
  profileCount,
  /** IDs dos perfis da pasta (modo folder). */
  profileIds,
  /** Nome da pasta (só para textos do confirm/mensagens). */
  folderName,
}: {
  compact?: boolean;
  profileId?: string;
  handle?: string;
  platform?: Platform;
  /** library = botao principal "Atualizar biblioteca" | folder = "Atualizar pasta" */
  mode?: "default" | "library" | "folder";
  profileCount?: number;
  profileIds?: string[];
  folderName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progressDetail, setProgressDetail] = useState<string | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyCount, setKeyCount] = useState(1);
  const resolvedProfileCount = Math.max(0, profileCount ?? 0);
  const folderIds = useMemo(
    () => [...new Set((profileIds ?? []).filter((id) => id.trim().length > 0))],
    [profileIds],
  );

  const isSingle = Boolean(profileId);
  const isFolderMode = mode === "folder";
  const isFolder = isFolderMode || (!isSingle && folderIds.length > 0 && mode !== "library");
  // Quando profileIds é passado explicitamente (mesmo com mode default), trata como pasta.
  const effectiveIsFolder = isFolder && folderIds.length > 0;
  // NUNCA cair para library quando mode="folder" (pasta vazia virava "Atualizar biblioteca" → scope:all).
  const isLibrary =
    !isSingle && !effectiveIsFolder && !isFolderMode && (mode === "library" || !profileId);
  const folderLabel = folderName?.trim() ? folderName.trim() : "pasta";
  const profileLabel = handle ? `@${handle}` : "este perfil";
  const isTikTok = platform === "tiktok";
  const maxTimeOne = formatMaxDurationLabel(1);
  const contentHint = isTikTok
    ? `perfil + ate ${TIKTOK_VIDEO_LIMIT} videos`
    : `perfil + ate ${INSTAGRAM_GRID_LIMIT} Grade + ${INSTAGRAM_REELS_LIMIT} Reels`;

  const effectiveCount = effectiveIsFolder ? folderIds.length : resolvedProfileCount;

  const libraryEta = useMemo(() => {
    const n = Math.max(effectiveCount, 1);
    const keys = Math.max(1, Math.min(keyCount, SCRAPE_MAX_PARALLEL_KEYS));
    const seconds = estimateScrapeMaxSeconds(n, keys);
    return {
      n: effectiveCount,
      keys,
      label: formatMaxDurationLabel(n, keys),
      seconds,
      duration: formatDurationSeconds(seconds),
    };
  }, [keyCount, effectiveCount]);

  useEffect(() => {
    if (isSingle || (!isLibrary && !effectiveIsFolder)) {
      return;
    }

    let cancelled = false;
    async function loadEtaContext() {
      try {
        const response = await fetch("/api/scrape/session");
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          summary?: { hasCredit?: number; activeInQueue?: number };
        };
        const keys = Math.max(
          1,
          payload.summary?.hasCredit ?? payload.summary?.activeInQueue ?? 1,
        );
        if (!cancelled) {
          setKeyCount(keys);
        }
      } catch {
        // mantem 1 chave na estimativa
      }
    }
    void loadEtaContext();
    return () => {
      cancelled = true;
    };
  }, [isLibrary, effectiveIsFolder, isSingle]);

  useEffect(() => {
    if (startedAt === null) {
      return;
    }
    const tick = () => setElapsedLabel(formatDurationSeconds((Date.now() - startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  async function runSingleRequest(body: Record<string, unknown>) {
    const response = await fetch("/api/scrape/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stream: true, ...body }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Falha ao atualizar.");
    }
    return readProgressStream(response, setProgressDetail, isSingle ? 1 : libraryEta.keys);
  }

  function mergeResults(acc: ScrapeResult, cur: ScrapeResult): ScrapeResult {
    const ok = (acc.profilesOk ?? 0) + (cur.profilesOk ?? 0);
    const total = (acc.profilesTotal ?? 0) + (cur.profilesTotal ?? 0);
    const status =
      acc.status === "success" && cur.status === "success"
        ? "success"
        : ok > 0
          ? "partial_failed"
          : total > 0
            ? "failed"
            : cur.status;
    return {
      status,
      profilesTotal: (acc.profilesTotal ?? 0) + (cur.profilesTotal ?? 0),
      profilesAttempted: (acc.profilesAttempted ?? 0) + (cur.profilesAttempted ?? 0),
      profilesOk: (acc.profilesOk ?? 0) + (cur.profilesOk ?? 0),
      profilesSkipped: (acc.profilesSkipped ?? 0) + (cur.profilesSkipped ?? 0),
      postsFound: (acc.postsFound ?? 0) + (cur.postsFound ?? 0),
      postsNew: (acc.postsNew ?? 0) + (cur.postsNew ?? 0),
      postsUpdated: (acc.postsUpdated ?? 0) + (cur.postsUpdated ?? 0),
      errors: [...(acc.errors ?? []), ...(cur.errors ?? [])],
    };
  }

  async function runScrape() {
    // Guard do modo pasta: nunca deixar cair para scope:all (queimaria a biblioteca inteira).
    if (isFolderMode && folderIds.length === 0) {
      setError("Esta pasta não tem perfis para atualizar.");
      return;
    }

    // Teto anti-credit-burn: igual ao cap do scope:all (200). Pasta gigante = N runs
    // sequenciais sem cap queimaria crédito ilimitado em 1 clique.
    if (isFolderMode && folderIds.length > MAX_SCRAPE_ALL_PROFILES) {
      setError(
        `Esta pasta tem ${folderIds.length} perfil(is), acima do teto de ${MAX_SCRAPE_ALL_PROFILES} por rodada. ` +
          "Divida em pastas menores ou atualize pelos perfis individuais.",
      );
      return;
    }

    if (isLibrary && !isSingle && !effectiveIsFolder) {
      const confirmed = window.confirm(
        "Atualizar a biblioteca de todos os perfis ativos?\n\n" +
          "• Busca os ultimos 5 da Grade e 5 Reels (IG) ou 10 videos (TikTok)\n" +
          "• Conteudo NOVO e salvo na biblioteca\n" +
          "• Conteudo ja catalogado NAO duplica (so atualiza metricas se mudaram)\n" +
          "• Historico antigo permanece\n" +
          `• Perfis coletados ha menos de ${SCRAPE_FRESHNESS_WINDOW_MINUTES} min sao pulados\n` +
          `• Tempo maximo da puxada completa: ${libraryEta.label}\n\n` +
          "Continuar?",
      );
      if (!confirmed) {
        return;
      }
    }

    if (effectiveIsFolder) {
      const batches = Math.ceil(folderIds.length / MAX_SCRAPE_PROFILE_IDS);
      const estimatedCredits = folderIds.length * ESTIMATED_CREDITS_PER_PROFILE;
      const confirmed = window.confirm(
        `Atualizar os ${folderIds.length} perfil(is) da pasta "${folderLabel}"?\n\n` +
          "• Mesma coleta do botão da biblioteca, mas SÓ desta pasta\n" +
          "• Busca os ultimos 5 da Grade e 5 Reels (IG) ou 10 videos (TikTok)\n" +
          "• Conteudo NOVO e salvo na biblioteca\n" +
          "• Conteudo ja catalogado NAO duplica (so atualiza metricas se mudaram)\n" +
          `• Perfis coletados ha menos de ${SCRAPE_FRESHNESS_WINDOW_MINUTES} min sao pulados\n` +
          `• Custo estimado: ~${estimatedCredits} créditos (≈${ESTIMATED_CREDITS_PER_PROFILE}/perfil)\n` +
          `• Tempo maximo da puxada: ${libraryEta.label}` +
          (batches > 1 ? ` (${batches} lotes de até ${MAX_SCRAPE_PROFILE_IDS})` : "") +
          "\n\nContinuar?",
      );
      if (!confirmed) {
        return;
      }
    }

    setIsRunning(true);
    setMessage(null);
    setProgressDetail(null);
    setElapsedLabel(null);
    setError(null);
    const runStartedAt = Date.now();
    setStartedAt(runStartedAt);

    try {
      if (isSingle) {
        setMessage(`Atualizando ${profileLabel}...`);
        setProgressDetail(
          `O que acontece: Bright Data busca ${contentHint}. Conteudo novo entra na biblioteca; repetido nao duplica. Tempo maximo estimado: ${maxTimeOne}.`,
        );
      } else if (effectiveIsFolder) {
        setMessage(`Atualizando pasta "${folderLabel}" (${folderIds.length} perfil(is))...`);
        setProgressDetail(
          `Puxada da pasta: ate ${libraryEta.n || "?"} perfil(is) · ~${libraryEta.keys} chave(s) em paralelo · tempo maximo ${libraryEta.duration}. Ultimos 5 Grade + 5 Reels (ou 10 videos). Novo salva; repetido nao duplica.`,
        );
      } else {
        setMessage("Atualizando biblioteca de todos os perfis ativos...");
        setProgressDetail(
          `Puxada completa: ate ${libraryEta.n || "?"} perfil(is) · ~${libraryEta.keys} chave(s) em paralelo · tempo maximo ${libraryEta.duration}. Ultimos 5 Grade + 5 Reels (ou 10 videos). Novo salva; repetido nao duplica.`,
        );
      }

      let result: ScrapeResult;
      let folderBatchWarning: string | null = null;
      if (isSingle && profileId) {
        result = await runSingleRequest({ scope: "profiles", profileIds: [profileId] });
      } else if (effectiveIsFolder) {
        let acc: ScrapeResult | null = null;
        const totalBatches = Math.ceil(folderIds.length / MAX_SCRAPE_PROFILE_IDS);
        for (let i = 0; i < folderIds.length; i += MAX_SCRAPE_PROFILE_IDS) {
          const chunk = folderIds.slice(i, i + MAX_SCRAPE_PROFILE_IDS);
          const batchIndex = Math.floor(i / MAX_SCRAPE_PROFILE_IDS) + 1;
          const batchLabel = totalBatches > 1 ? ` (lote ${batchIndex}/${totalBatches})` : "";
          setProgressDetail(`Pasta "${folderLabel}": enviando ${chunk.length} perfil(is)${batchLabel}...`);
          try {
            const cur = await runSingleRequest({ scope: "profiles", profileIds: chunk });
            acc = acc ? mergeResults(acc, cur) : cur;
          } catch (chunkError) {
            // Não joga fora o que os lotes anteriores já coletaram (crédito já gasto):
            // encerra e relata o parcial + o erro do lote que parou.
            const chunkMessage = chunkError instanceof Error ? chunkError.message : "Falha no lote.";
            if (!acc) throw chunkError;
            folderBatchWarning = `ATENÇÃO: parou no lote ${batchIndex}/${totalBatches} (${chunkMessage}) — mostrando parcial dos lotes anteriores`;
            break;
          }
        }
        if (!acc) throw new Error("Nenhum perfil para atualizar.");
        result = acc;
      } else {
        result = await runSingleRequest({ scope: "all" });
      }
      const skipped = result.profilesSkipped ?? 0;
      const postsNew = result.postsNew ?? 0;
      const postsUpdated = result.postsUpdated ?? 0;
      const errCount = result.errors?.length ?? 0;
      const elapsed = formatDurationSeconds((Date.now() - runStartedAt) / 1000);

      if (isSingle) {
        if (skipped > 0 && result.profilesAttempted === 0) {
          // profilesAttempted might not be on result - check profilesOk 0 and skipped
        }
      }

      const parts = isSingle
        ? [
            skipped > 0 && result.profilesOk === 0
              ? `${profileLabel} pulado (coletado ha menos de ${SCRAPE_FRESHNESS_WINDOW_MINUTES} min)`
              : `${profileLabel}: coleta ${result.status === "success" ? "ok" : result.status}`,
            postsNew > 0 ? `${postsNew} post(s) novo(s)` : null,
            postsUpdated > 0 ? `${postsUpdated} ja na biblioteca (sem duplicar)` : null,
            result.postsFound === 0 && result.profilesOk > 0
              ? "nenhum post novo nesta leva"
              : null,
            errCount > 0
              ? result.errors?.map((e) => e.error).join("; ") ?? `${errCount} erro(s)`
              : null,
            `tempo ${elapsed} (teto ${maxTimeOne})`,
          ]
        : [
            effectiveIsFolder
              ? `Pasta "${folderLabel}": ${result.profilesOk}/${result.profilesTotal} perfis ok`
              : `${result.profilesOk}/${result.profilesTotal} perfis ok`,
            postsNew > 0 ? `${postsNew} post(s) novo(s)` : null,
            postsUpdated > 0 ? `${postsUpdated} ja catalogado(s)` : null,
            result.postsFound > 0 && postsNew === 0 && postsUpdated === 0
              ? `${result.postsFound} post(s) processado(s)`
              : null,
            skipped > 0 ? `${skipped} recente(s) pulado(s)` : null,
            errCount > 0 ? `${errCount} erro(s)` : null,
            folderBatchWarning,
            `tempo ${elapsed}`,
          ];

      setMessage(parts.filter(Boolean).join(" · ") + ".");
      setProgressDetail(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(null);
      setProgressDetail(null);
      setError(err instanceof Error ? err.message : "Falha ao atualizar.");
    } finally {
      setIsRunning(false);
      setStartedAt(null);
    }
  }

  const labelIdle = isSingle
    ? "Atualizar perfil"
    : isFolderMode
      ? folderIds.length > 0
        ? `Atualizar pasta (${folderIds.length})`
        : "Pasta vazia"
      : effectiveIsFolder
        ? `Atualizar pasta (${folderIds.length})`
        : mode === "library" || !compact
          ? "Atualizar biblioteca"
          : "Atualizar todos";

  const labelRunning = isSingle
    ? "Atualizando perfil..."
    : isFolderMode || effectiveIsFolder
      ? "Atualizando pasta..."
      : "Atualizando biblioteca...";

  // No detalhe do perfil o botao vem com compact — mesmo assim mostramos transparencia.
  const showTransparency = isSingle || !compact;

  return (
    <div className={`form-stack ${isSingle ? "scrape-single" : ""}`}>
      {isSingle && showTransparency ? (
        <div className="import-callout scrape-callout" role="note">
          <div className="import-callout-title">
            <Info size={16} aria-hidden />
            <strong>Atualizar {profileLabel}</strong>
          </div>
          <ol className="import-steps">
            <li>
              Bright Data busca <strong>{contentHint}</strong> (nao o catalogo inteiro).
            </li>
            <li>
              Conteudo <strong>novo</strong> entra na biblioteca; o que ja existe{" "}
              <strong>nao duplica</strong> (so atualiza metricas se mudaram).
            </li>
            <li>
              Se este perfil foi coletado ha menos de{" "}
              <strong>{SCRAPE_FRESHNESS_WINDOW_MINUTES} min</strong>, a coleta e pulada (economiza
              credito).
            </li>
          </ol>
          <div className="import-eta">
            <Clock3 size={15} aria-hidden />
            <div>
              <p>
                <strong>Tempo maximo (pior caso)</strong>
              </p>
              <p className="import-eta-live">
                <strong>{maxTimeOne}</strong>
                {isTikTok
                  ? ` · ate ~11 registros (1 perfil + ${TIKTOK_VIDEO_LIMIT} videos)`
                  : ` · ate ~11 registros (1 + ${INSTAGRAM_GRID_LIMIT} + ${INSTAGRAM_REELS_LIMIT})`}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <button
        className={`button teal ${compact && !isSingle ? "secondary" : ""}`}
        type="button"
        onClick={() => void runScrape()}
        disabled={isRunning || isPending || (isFolderMode && folderIds.length === 0)}
        title={
          isSingle
            ? `Puxa ${contentHint}; acumula na biblioteca sem duplicar. Teto ~${SCRAPE_MAX_MINUTES_PER_PROFILE} min.`
            : effectiveIsFolder
              ? `Atualiza só os ${folderIds.length} perfil(is) da pasta "${folderLabel}". Tempo maximo estimado: ${libraryEta.duration}.`
              : `Atualiza a biblioteca inteira. Tempo maximo estimado: ${libraryEta.duration}.`
        }
      >
        {isRunning ? (
          <RefreshCw size={16} className="spin" />
        ) : isLibrary && !isSingle ? (
          <Library size={16} />
        ) : isFolderMode || effectiveIsFolder ? (
          <FolderSync size={16} />
        ) : (
          <RefreshCw size={16} />
        )}
        {isRunning ? labelRunning : labelIdle}
      </button>

      {!isSingle && !compact ? (
        <div className="library-eta-block">
          <p className="meta" style={{ margin: 0 }}>
            {effectiveIsFolder
              ? `Só os perfis desta pasta ("${folderLabel}"). Ultimos 5 Grade + 5 Reels (ou 10 videos). Novo salva; repetido nao duplica.`
              : "Ultimos 5 Grade + 5 Reels (ou 10 videos). Novo salva; repetido nao duplica. Historico fica na biblioteca."}
          </p>
          <p className="meta library-eta-total" style={{ margin: "6px 0 0" }}>
            <Clock3 size={14} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />
            <strong>
              {effectiveIsFolder ? "Tempo maximo da pasta:" : "Tempo maximo da puxada completa:"}
            </strong>{" "}
            {libraryEta.duration}
            {libraryEta.n > 0
              ? ` · ${libraryEta.n} perfil(is) · ~${libraryEta.keys} chave(s) em paralelo`
              : null}
            {libraryEta.n > 0
              ? ` (base ~${SCRAPE_MAX_MINUTES_PER_PROFILE} min/perfil ÷ paralelismo)`
              : null}
          </p>
          <p className="meta" style={{ margin: "4px 0 0" }}>
            Perfis coletados ha menos de {SCRAPE_FRESHNESS_WINDOW_MINUTES} min sao pulados (a
            puxada pode ficar mais curta).
          </p>
        </div>
      ) : null}

      {isRunning ? (
        <div className="import-progress" aria-live="polite">
          <p className="message">
            <strong>Em andamento</strong>
            {elapsedLabel ? ` · decorrido ${elapsedLabel}` : null}
            {isSingle
              ? ` · teto ${maxTimeOne}`
              : ` · teto da puxada ~${libraryEta.duration}`}
          </p>
          {progressDetail ? <p className="message">{progressDetail}</p> : null}
          <p className="meta">Nao feche a pagina ate terminar a coleta Bright Data.</p>
        </div>
      ) : null}

      {message && !isRunning ? <p className="message success">{message}</p> : null}
      {error ? <p className="message error">{error}</p> : null}
    </div>
  );
}
