import type { CollectorSession, Prisma, Profile } from "@prisma/client";
import type { Platform } from "@/lib/constants";
import { SCRAPE_FRESHNESS_WINDOW_MINUTES, SCRAPE_MAX_PARALLEL_KEYS, SCRAPE_MAX_RETRIES_PER_PROFILE } from "@/lib/constants";
import { prisma, withDbWriteRetry } from "@/lib/db";
import { estimateScrapeMaxSeconds } from "@/lib/scrape-eta";
import { reconcileZombieRuns } from "@/lib/scrape-reconcile";
import { canonicalizePostUrl } from "@/lib/post-url";
import {
  scrapeInstagramProfileWithBrightData,
  scrapeInstagramRecentReelsWithBrightData,
} from "@/lib/scrapers/brightdata-instagram";
import {
  scrapeTikTokProfileWithBrightData,
  scrapeTikTokRecentVideosWithBrightData,
} from "@/lib/scrapers/brightdata-tiktok";
import {
  createCollectorSession,
  deleteCollectorSession,
  getActiveCollectorSessions,
  listCollectorSessions,
  recordCollectorSessionFailure,
  recordCollectorSessionNoData,
  recordCollectorSessionSuccess,
  refreshSessionBalances,
  testCollectorSession,
  updateCollectorSession,
  type ActiveCollectorSession,
} from "@/lib/scrapers/session";
import {
  getScrapeDatasetUsage,
  getScrapeErrorCode,
  type DatasetProgressReporter,
  type ScrapeDatasetProgress,
  type ScrapeDatasetUsage,
  type ScrapePartialError,
  type ScrapedPost,
  type ScrapedProfileResult,
  type ScrapeProgressEvent,
} from "@/lib/scrapers/types";

export {
  createCollectorSession,
  deleteCollectorSession,
  listCollectorSessions,
  refreshSessionBalances,
  testCollectorSession,
  updateCollectorSession,
};

type ScrapeError = {
  profileId: string;
  handle: string;
  platform: string;
  sessionId?: string;
  sessionName?: string;
  error: string;
  errorCode: string;
};

export type ScrapeScope =
  | { kind: "all" }
  | {
      kind: "profiles";
      profileIds: string[];
    };

type RunScrapeOptions = {
  force?: boolean;
  now?: Date;
  /** Cancela o run (workers param de agendar e fetches são aborted). */
  signal?: AbortSignal;
  onRunCreated?: (runId: string) => void | Promise<void>;
  onProgress?: (event: ScrapeProgressEvent) => void | Promise<void>;
};

type ProfileForScrape = Profile & {
  snapshots: Array<{ capturedAt: Date }>;
  lastPostsScrapeAt?: Date | null;
};

type ScrapeJob = {
  profile: Profile;
  attemptedSessionIds: Set<string>;
};

type PersistedResult = {
  profileSnapshotCreated: boolean;
  postsFound: number;
  postsNew: number;
  postsUpdated: number;
  recordsPersisted: number;
  noData: boolean;
};

type AttemptOutcome = {
  success: boolean;
  retryable: boolean;
  noData?: boolean;
  error?: ScrapeError;
  partialError?: ScrapeError;
  datasets: ScrapeDatasetUsage[];
  postsFound: number;
  postsNew: number;
  postsUpdated: number;
  recordsPersisted: number;
};

type StageOutcome = {
  retryJobs: ScrapeJob[];
  errors: ScrapeError[];
  profilesOk: number;
  postsFound: number;
  postsNew: number;
  postsUpdated: number;
  recordsPersisted: number;
  requestsMade: number;
  recordsReceived: number;
};

function toStoredCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Falha desconhecida durante a coleta.";
}

function metricsMatch(
  snapshot: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
  },
  metrics: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
  },
) {
  return (
    snapshot.views === metrics.views &&
    snapshot.likes === metrics.likes &&
    snapshot.comments === metrics.comments &&
    snapshot.shares === metrics.shares &&
    snapshot.favorites === metrics.favorites
  );
}

async function persistPost(
  tx: Prisma.TransactionClient,
  profile: Profile,
  scrapedPost: ScrapedPost,
) {
  const sourceType = scrapedPost.sourceType ?? (profile.platform === "tiktok" ? "video" : "grid");
  const url = canonicalizePostUrl(profile.platform as Platform, scrapedPost.url, scrapedPost.externalId);
  const identityFilters: Prisma.PostWhereInput[] = [{ url }];
  if (scrapedPost.externalId?.trim()) {
    identityFilters.push({ externalId: scrapedPost.externalId.trim() });
  }
  const existing = await tx.post.findFirst({
    where: { profileId: profile.id, OR: identityFilters },
    select: { id: true },
  });
  // A URL/externalId identifies content within a profile even when datasets
  // report different sourceType values. Keep the first sourceType, but do not
  // create a second row for the same content.
  const post = existing
    ? await tx.post.update({
        where: { id: existing.id },
        data: {
          caption: scrapedPost.caption ?? undefined,
          externalId: scrapedPost.externalId ?? undefined,
          publishedAt: scrapedPost.publishedAt ?? undefined,
          platform: profile.platform,
        },
      })
    : await tx.post.create({
        data: {
          platform: profile.platform,
          profileId: profile.id,
          externalId: scrapedPost.externalId ?? null,
          url,
          sourceType,
          caption: scrapedPost.caption ?? null,
          publishedAt: scrapedPost.publishedAt ?? null,
        },
      });
  const metrics = {
    views: toStoredCount(scrapedPost.metrics.views),
    likes: toStoredCount(scrapedPost.metrics.likes),
    comments: toStoredCount(scrapedPost.metrics.comments),
    shares: toStoredCount(scrapedPost.metrics.shares),
    favorites: toStoredCount(scrapedPost.metrics.favorites),
  };
  const latestSnapshot = await tx.postSnapshot.findFirst({
    where: { postId: post.id },
    orderBy: { capturedAt: "desc" },
  });

  if (latestSnapshot && metricsMatch(latestSnapshot, metrics)) {
    return { snapshotCreated: false, isNew: !existing };
  }

  await tx.postSnapshot.create({
    data: { postId: post.id, ...metrics },
  });
  return { snapshotCreated: true, isNew: !existing };
}

export function deduplicateScrapedPosts(platform: Platform, posts: ScrapedPost[]) {
  const unique: ScrapedPost[] = [];

  for (const post of posts) {
    const url = canonicalizePostUrl(platform, post.url, post.externalId);
    const externalId = post.externalId?.trim() || null;
    const duplicate = unique.find((candidate) => {
      const candidateUrl = canonicalizePostUrl(platform, candidate.url, candidate.externalId);
      const candidateExternalId = candidate.externalId?.trim() || null;
      return candidateUrl === url || (externalId !== null && candidateExternalId === externalId);
    });

    if (!duplicate) {
      unique.push({ ...post, url });
    }
  }

  return unique;
}

async function persistScrapeResult(profile: Profile, result: ScrapedProfileResult): Promise<PersistedResult> {
  const posts = deduplicateScrapedPosts(profile.platform as Platform, result.posts);
  if (!result.profileDataFound && posts.length === 0) {
    return {
      profileSnapshotCreated: false,
      postsFound: 0,
      postsNew: 0,
      postsUpdated: 0,
      recordsPersisted: 0,
      noData: true,
    };
  }

  // Retry para falhas transitorias do banco durante os workers paralelos.
  return withDbWriteRetry(() =>
    prisma.$transaction(
      async (tx) => {
        let profileSnapshotCreated = false;
        let postsFound = 0;
        let postsNew = 0;
        let postsUpdated = 0;
        let recordsPersisted = 0;

        if (result.profileDataFound) {
          await tx.profileSnapshot.create({
            data: {
              profileId: profile.id,
              followers: toStoredCount(result.followers),
              following: toStoredCount(result.following),
              likes: toStoredCount(result.likes),
              postsCount: toStoredCount(result.postsCount),
            },
          });
          profileSnapshotCreated = true;
          recordsPersisted += 1;
        }

        for (const scrapedPost of posts) {
          if (!scrapedPost.url) {
            continue;
          }

          const persistedPost = await persistPost(tx, profile, scrapedPost);
          postsFound += 1;
          if (persistedPost.isNew) {
            postsNew += 1;
          } else {
            postsUpdated += 1;
          }
          recordsPersisted += persistedPost.snapshotCreated ? 1 : 0;
        }

        // Atualiza lastPostsScrapeAt quando a coleta trouxe posts (mesmo sem
        // profileSnapshot) — fecha a janela anti-recoleta para perfil so-com-posts.
        if (postsFound > 0) {
          await tx.profile.update({
            where: { id: profile.id },
            data: { lastPostsScrapeAt: new Date() },
          });
        }

        return {
          profileSnapshotCreated,
          postsFound,
          postsNew,
          postsUpdated,
          recordsPersisted,
          noData: false,
        };
      },
      { timeout: 60_000, maxWait: 60_000 },
    ),
  );
}

/**
 * Chave e global: a plataforma vem do perfil, nao da sessao.
 * Qualquer API Bright Data ativa pode coletar IG ou TikTok.
 */
async function scrapeWithApiSession(
  session: ActiveCollectorSession,
  profile: Profile,
  reportDataset?: DatasetProgressReporter,
  signal?: AbortSignal,
) {
  if (session.provider !== "brightdata" || !session.apiKey?.trim()) {
    throw new Error("Sessao API sem provedor Bright Data ou chave cadastrada.");
  }

  if (profile.platform === "instagram") {
    return scrapeInstagramProfileWithBrightData(
      { id: profile.id, platform: "instagram", handle: profile.handle, url: profile.url },
      session.apiKey,
      reportDataset,
      signal,
    );
  }

  if (profile.platform === "tiktok") {
    return scrapeTikTokProfileWithBrightData(
      { id: profile.id, platform: "tiktok", handle: profile.handle, url: profile.url },
      session.apiKey,
      reportDataset,
      signal,
    );
  }

  throw new Error(`Plataforma de perfil nao suportada: ${profile.platform}`);
}

function usageTotals(datasets: ScrapeDatasetUsage[]) {
  return datasets.reduce(
    (total, dataset) => ({
      requestsMade: total.requestsMade + dataset.requestsMade,
      recordsReceived: total.recordsReceived + dataset.recordsReceived,
    }),
    { requestsMade: 0, recordsReceived: 0 },
  );
}

async function setRunActivity(runId: string, activity: string) {
  await withDbWriteRetry(() =>
    prisma.scrapeRun.update({
      where: { id: runId },
      data: { currentActivity: activity.slice(0, 240) },
    }),
  );
}

function getRunTimeoutMs(profileCount: number, sessionCount: number) {
  const baseSeconds = estimateScrapeMaxSeconds(profileCount, Math.max(1, sessionCount));
  // +10min buffer para overhead de retries/backoff/persistencia
  const bufferSeconds = 10 * 60;
  const cappedSeconds = Math.min(baseSeconds + bufferSeconds, 3 * 60 * 60); // teto 3h alinha com ZOMBIE_RUN_TIMEOUT_MS
  return Math.max(5 * 60 * 1000, cappedSeconds * 1000);
}

async function withRunTimeout<T>(
  timeoutMs: number,
  fn: () => Promise<T>,
  onTimeout?: (() => void) | undefined,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      // Aborta o run ANTES de rejeitar — workers param de agendar e fetches são cancelados.
      onTimeout?.();
      reject(new Error(`Timeout global: coleta excedeu ${Math.round(timeoutMs / 60000)} min sem concluir`));
    }, timeoutMs);
  });
  try {
    return (await Promise.race([fn(), timeoutPromise])) as T;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function recordRunAttemptProgress(
  runId: string,
  job: ScrapeJob,
  outcome: AttemptOutcome,
  finalProfileOutcome: boolean,
) {
  const totals = usageTotals(outcome.datasets);
  const activity = outcome.success
    ? outcome.partialError
      ? `Dados parciais de @${job.profile.handle} foram salvos; uma etapa falhou.`
      : outcome.noData
        ? `@${job.profile.handle} respondeu sem dados uteis.`
        : `Dados de @${job.profile.handle} foram salvos.`
    : finalProfileOutcome
      ? `A coleta de @${job.profile.handle} terminou com falha.`
      : `Falha temporaria em @${job.profile.handle}; tentando outra API.`;

  await withDbWriteRetry(() =>
    prisma.scrapeRun.update({
      where: { id: runId },
      data: {
        profilesFinished: finalProfileOutcome ? { increment: 1 } : undefined,
        profilesOk: outcome.success ? { increment: 1 } : undefined,
        postsFound: { increment: outcome.postsFound },
        requestsMade: { increment: totals.requestsMade },
        recordsReceived: { increment: totals.recordsReceived },
        recordsPersisted: { increment: outcome.recordsPersisted },
        // Custo estimado = registros entregues (BD cobra por registro), nao requests.
        estimatedCredits: { increment: totals.recordsReceived },
        currentActivity: activity,
      },
    }),
  );
}

function toPartialScrapeError(
  profile: Profile,
  session: ActiveCollectorSession,
  partialError: ScrapePartialError | undefined,
): ScrapeError | undefined {
  if (!partialError) {
    return undefined;
  }

  return {
    profileId: profile.id,
    handle: profile.handle,
    platform: profile.platform,
    sessionId: session.id,
    sessionName: session.name,
    error: partialError.message,
    // Se o partialError veio de um dataset opcional (essential=false), marca como
    // "partial_empty" — vira warning no run em vez de falha estrutural. Assim
    // Grade vazia em perfil so-reels nao vira "partial_failed" injustificado.
    errorCode: partialError.essential === false ? "partial_empty" : partialError.errorCode,
  };
}

async function recordRunFinalFailure(runId: string, job: ScrapeJob, activity: string) {
  await withDbWriteRetry(() =>
    prisma.scrapeRun.update({
      where: { id: runId },
      data: {
        profilesFinished: { increment: 1 },
        currentActivity: activity.slice(0, 240),
      },
    }),
  );
}

export function getScrapeRunStatus(errors: Array<Pick<ScrapeError, "errorCode">>, profilesOk: number) {
  const realErrors = errors.filter(
    (error) => error.errorCode !== "not_found" && error.errorCode !== "partial_empty",
  );
  return realErrors.length === 0 ? "success" : profilesOk > 0 ? "partial_failed" : "failed";
}

export function markDatasetsNoData(datasets: ScrapeDatasetUsage[]) {
  return datasets.map((dataset) => ({
    ...dataset,
    status: dataset.status === "success" ? "no_data" : dataset.status,
    recordsKept: 0,
  }));
}

async function recordDatasetAttempts(
  runId: string,
  profile: Profile,
  session: ActiveCollectorSession,
  datasets: ScrapeDatasetUsage[],
) {
  if (datasets.length === 0) {
    return;
  }

  const now = new Date();
  const data = datasets.map((dataset) => ({
    scrapeRunId: runId,
    profileId: profile.id,
    sessionId: session.id,
    platform: profile.platform,
    datasetId: dataset.datasetId,
    status: dataset.status,
    startedAt: now,
    finishedAt: now,
    recordsReceived: dataset.recordsReceived,
    recordsKept: dataset.recordsKept,
    recordsDiscarded: Math.max(dataset.recordsReceived - dataset.recordsKept, 0),
    errorCode: dataset.errorCode ?? null,
    errorMessage: dataset.errorMessage ?? null,
  }));

  // createMany em massa + 20 workers = timeout sem fila
  await withDbWriteRetry(() => prisma.scrapeAttempt.createMany({ data }));
}

/**
 * Erros de autenticacao/conta tornam a chave inutil no run inteiro e exigem pausa:
 * sao credenciais invalidas, conta suspensa ou sem permissao — nao vai melhorar
 * trocando de perfil. Provider/transient/not_found sao perfil/dataset especificos
 * e trocam de chave so para o perfil afetado; a chave segue para os proximos.
 */
function isSessionUnrecoverable(errorCode: string) {
  return errorCode === "authentication" || errorCode === "account";
}

/**
 * Pausa persistente da chave (DB) — so auth/conta.
 */
const shouldPauseSession = isSessionUnrecoverable;

/**
 * Esgota a chave neste run (tira ela dos workers sem reusar para outros perfis).
 * Mesmo criterio de pausa: auth/conta. Provider/transient nao esgotam.
 */
const shouldExhaustSessionInQueue = isSessionUnrecoverable;

function shouldRetryWithAnotherSession(errorCode: string) {
  // not_found = perfil/conteudo inexistente: trocar de chave nao resolve.
  // provider/transient: tenta outra chave no retry stage.
  return (
    errorCode === "authentication" ||
    errorCode === "account" ||
    errorCode === "transient" ||
    errorCode === "provider"
  );
}

function hasUnusedHealthySession(
  job: ScrapeJob,
  sessions: ActiveCollectorSession[],
  disabledSessionIds: Set<string>,
) {
  return sessions.some(
    (session) => !disabledSessionIds.has(session.id) && !job.attemptedSessionIds.has(session.id),
  );
}

async function executeAttempt(
  runId: string,
  job: ScrapeJob,
  session: ActiveCollectorSession,
  reportDataset?: DatasetProgressReporter,
  signal?: AbortSignal,
): Promise<AttemptOutcome> {
  // Fase 1 — COLETA (Bright Data). Se falhar aqui, classificacao normal + retry decide.
  let result: ScrapedProfileResult;
  try {
    await setRunActivity(
      runId,
      `Coletando @${job.profile.handle}: perfil e conteudos recentes de ${job.profile.platform}.`,
    );
    result = await scrapeWithApiSession(session, job.profile, reportDataset, signal);
  } catch (error) {
    const datasets = getScrapeDatasetUsage(error);
    const errorCode = getScrapeErrorCode(error);
    const message = errorMessage(error);
    await recordDatasetAttempts(runId, job.profile, session, datasets);
    await recordCollectorSessionFailure(session.id, message, shouldPauseSession(errorCode));

    return {
      success: false,
      retryable: shouldRetryWithAnotherSession(errorCode),
      datasets,
      postsFound: 0,
      postsNew: 0,
      postsUpdated: 0,
      recordsPersisted: 0,
      error: {
        profileId: job.profile.id,
        handle: job.profile.handle,
        platform: job.profile.platform,
        sessionId: session.id,
        sessionName: session.name,
        error: message,
        errorCode,
      },
    };
  }

  // Fase 2 — PERSISTENCIA. A coleta JÁ FOI PAGA (registros entregues/cobrados pela BD).
  // Falha de banco aqui NÃO deve re-disparar a coleta com outra chave (custo duplicado):
  // retornamos falha NÃO-retryável e registramos uso real dos datasets.
  try {
    const persisted = await persistScrapeResult(job.profile, result);
    const datasets = persisted.noData ? markDatasetsNoData(result.datasets) : result.datasets;
    await recordDatasetAttempts(runId, job.profile, session, datasets);
    const partialError = toPartialScrapeError(job.profile, session, result.partialError);
    if (persisted.noData && partialError) {
      await recordCollectorSessionFailure(
        session.id,
        partialError.error,
        shouldPauseSession(partialError.errorCode),
      );
    } else if (persisted.noData) {
      await recordCollectorSessionNoData(session.id);
    } else {
      await recordCollectorSessionSuccess(session.id);
    }

    return {
      success: true,
      retryable: false,
      noData: persisted.noData,
      partialError,
      datasets,
      postsFound: persisted.postsFound,
      postsNew: persisted.postsNew,
      postsUpdated: persisted.postsUpdated,
      recordsPersisted: persisted.recordsPersisted,
    };
  } catch (error) {
    const message = errorMessage(error);
    console.warn(
      `[scrapers] persistencia falhou apos coleta paga de @${job.profile.handle} — nao recolhendo: ${message.slice(0, 200)}`,
    );
    await recordDatasetAttempts(runId, job.profile, session, result.datasets);
    await recordCollectorSessionFailure(
      session.id,
      `Persistencia falhou apos coleta paga (nao recolhendo): ${message.slice(0, 160)}`,
      false,
    );

    return {
      success: false,
      retryable: false,
      datasets: result.datasets,
      postsFound: 0,
      postsNew: 0,
      postsUpdated: 0,
      recordsPersisted: 0,
      error: {
        profileId: job.profile.id,
        handle: job.profile.handle,
        platform: job.profile.platform,
        sessionId: session.id,
        sessionName: session.name,
        error: `Falha ao persistir resultado da coleta ja paga (nao sera refeita): ${message}`,
        errorCode: "persist_error",
      },
    };
  }
}

/**
 * Distribui perfis entre ate SCRAPE_MAX_PARALLEL_KEYS sessoes saudaveis.
 * Striping deterministico (ordem de cadastro das chaves), nao sorteio.
 * Cada chave processa sua fatia em serie; varias chaves rodam em paralelo.
 */
function scheduleJobs(
  jobs: ScrapeJob[],
  sessions: ActiveCollectorSession[],
  disabledSessionIds: Set<string>,
) {
  const assignments = new Map<string, ScrapeJob[]>();
  const unassigned: ScrapeJob[] = [];
  const healthy = sessions.filter((session) => !disabledSessionIds.has(session.id));
  const workerLimit = Math.max(1, SCRAPE_MAX_PARALLEL_KEYS);
  const workers = healthy.slice(0, workerLimit);
  let stripe = 0;

  for (const job of jobs) {
    const candidates = workers.filter(
      (session) => !job.attemptedSessionIds.has(session.id) && !disabledSessionIds.has(session.id),
    );
    const fallback = healthy.filter(
      (session) => !job.attemptedSessionIds.has(session.id) && !disabledSessionIds.has(session.id),
    );
    const pool = candidates.length > 0 ? candidates : fallback;

    if (pool.length === 0) {
      unassigned.push(job);
      continue;
    }

    const session = pool[stripe % pool.length];
    stripe += 1;
    const assigned = assignments.get(session.id) ?? [];
    assigned.push(job);
    assignments.set(session.id, assigned);
  }

  return { assignments, unassigned };
}

async function executeStage(
  runId: string,
  jobs: ScrapeJob[],
  sessions: ActiveCollectorSession[],
  disabledSessionIds: Set<string>,
  allowRetry: boolean,
  reportDataset?: (job: ScrapeJob, progress: ScrapeDatasetProgress) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<StageOutcome> {
  const { assignments, unassigned } = scheduleJobs(jobs, sessions, disabledSessionIds);
  const errors: ScrapeError[] = unassigned.map((job) => ({
    profileId: job.profile.id,
    handle: job.profile.handle,
    platform: job.profile.platform,
    error: "Nenhuma sessao API saudavel ficou disponivel para este perfil.",
    errorCode: "no_session",
  }));
  await Promise.all(
    unassigned.map((job) =>
      recordRunFinalFailure(
        runId,
        job,
        `Nenhuma API saudavel ficou disponivel para @${job.profile.handle}.`,
      ),
    ),
  );
  const retryJobs: ScrapeJob[] = [];
  let profilesOk = 0;
  let postsFound = 0;
  let postsNew = 0;
  let postsUpdated = 0;
  let recordsPersisted = 0;
  let requestsMade = 0;
  let recordsReceived = 0;

  // Workers em paralelo: 1 chave = 1 worker (serie de perfis). N chaves = N perfis ao mesmo tempo.
  const orderedSessionIds = sessions
    .map((session) => session.id)
    .filter((sessionId) => assignments.has(sessionId));

  const workerResults = await Promise.all(
    orderedSessionIds.map(async (sessionId) => {
      const session = sessions.find((item) => item.id === sessionId);
      const assignedJobs = assignments.get(sessionId) ?? [];
      const outcomes: Array<{ job: ScrapeJob; outcome?: AttemptOutcome }> = [];
      if (!session || assignedJobs.length === 0) {
        return outcomes;
      }

      for (const job of assignedJobs) {
        if (signal?.aborted) {
          // Run cancelado/timeout — para de agendar novos perfis (evita gasto órfão).
          break;
        }
        if (disabledSessionIds.has(session.id)) {
          outcomes.push({ job });
          continue;
        }

        job.attemptedSessionIds.add(session.id);
        await setRunActivity(
          runId,
          `Worker ${session.name}: @${job.profile.handle} (${job.profile.platform}).`,
        );
        const outcome = await executeAttempt(
          runId,
          job,
          session,
          reportDataset ? (progress) => reportDataset(job, progress) : undefined,
          signal,
        );
        const errorCode = outcome.error?.errorCode ?? "unknown";
        if (!outcome.success && shouldExhaustSessionInQueue(errorCode)) {
          disabledSessionIds.add(session.id);
        }
        if (!outcome.success && shouldPauseSession(errorCode)) {
          disabledSessionIds.add(session.id);
        }
        const willRetry =
          !outcome.success &&
          allowRetry &&
          outcome.retryable &&
          hasUnusedHealthySession(job, sessions, disabledSessionIds);
        await recordRunAttemptProgress(runId, job, outcome, !willRetry);
        outcomes.push({ job, outcome });
      }

      return outcomes;
    }),
  );

  const workerOutcomes = workerResults.flat();

  for (const { job, outcome } of workerOutcomes) {
    if (!outcome) {
      if (allowRetry && hasUnusedHealthySession(job, sessions, disabledSessionIds)) {
        retryJobs.push(job);
      } else {
        await recordRunFinalFailure(
          runId,
          job,
          `A chave do worker foi esgotada antes de concluir @${job.profile.handle}.`,
        );
        errors.push({
          profileId: job.profile.id,
          handle: job.profile.handle,
          platform: job.profile.platform,
          error: "A chave do worker foi esgotada antes de concluir a coleta.",
          errorCode: "session_paused",
        });
      }
      continue;
    }

    const totals = usageTotals(outcome.datasets);
    requestsMade += totals.requestsMade;
    recordsReceived += totals.recordsReceived;
    postsFound += outcome.postsFound;
    postsNew += outcome.postsNew;
    postsUpdated += outcome.postsUpdated;
    recordsPersisted += outcome.recordsPersisted;

    if (outcome.success) {
      profilesOk += 1;
      if (outcome.partialError) {
        errors.push(outcome.partialError);
      }
    } else if (
      allowRetry &&
      outcome.retryable &&
      hasUnusedHealthySession(job, sessions, disabledSessionIds)
    ) {
      retryJobs.push(job);
    } else if (outcome.error) {
      errors.push(outcome.error);
    }
  }

  return {
    retryJobs,
    errors,
    profilesOk,
    postsFound,
    postsNew,
    postsUpdated,
    recordsPersisted,
    requestsMade,
    recordsReceived,
  };
}

export function shouldScrapeProfile(
  profile: ProfileForScrape,
  now = new Date(),
  force = false,
) {
  if (force) {
    return true;
  }

  const freshnessMs = SCRAPE_FRESHNESS_WINDOW_MINUTES * 60 * 1000;

  // Anti-recoleta 30min cobre tanto a janela do ProfileSnapshot quanto a do
  // lastPostsScrapeAt. Coleta que so trouxe posts (sem profileSnapshot, ex:
  // perfil privado com conteudo publico) atualiza lastPostsScrapeAt — sem isso
  // a janela nao contava e o perfil podia ser re-coletado em seguida, gastando
  // credito. Usa o max() entre os dois timestamps.
  const snapshotAt = profile.snapshots[0]?.capturedAt.getTime() ?? null;
  const postsAt = profile.lastPostsScrapeAt?.getTime?.() ?? null;
  const latestRelevant = Math.max(
    ...(snapshotAt !== null ? [snapshotAt] : []),
    ...(postsAt !== null ? [postsAt] : []),
  );

  if (!Number.isFinite(latestRelevant)) {
    return true;
  }

  return now.getTime() - latestRelevant >= freshnessMs;
}

export async function runScrape(scope: ScrapeScope, options: RunScrapeOptions = {}) {
  // Reconcilia zumbis antes de criar novo run — evita que auditoria acumule RUNNING eternos
  try {
    await reconcileZombieRuns(options.now ?? new Date());
  } catch {
    // não bloqueia coleta se reconciliação falhar
  }
  const profileIds = scope.kind === "profiles" ? [...new Set(scope.profileIds)].filter(Boolean) : undefined;
  const requestedProfiles = await prisma.profile.findMany({
    where: {
      status: "active",
      id: profileIds === undefined ? undefined : { in: profileIds },
    },
    select: {
      id: true,
      platform: true,
      handle: true,
      url: true,
      notes: true,
      status: true,
      lastPostsScrapeAt: true,
      createdAt: true,
      updatedAt: true,
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { capturedAt: true },
      },
    },
    orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
  });
  const now = options.now ?? new Date();
  const profiles = requestedProfiles.filter((profile) =>
    shouldScrapeProfile(profile, now, Boolean(options.force)),
  );
  const profilesSkipped = requestedProfiles.length - profiles.length;
  const run = await prisma.scrapeRun.create({
    data: {
      status: "running",
      profilesTotal: requestedProfiles.length,
      profilesAttempted: profiles.length,
    },
  });
  await options.onRunCreated?.(run.id);

  try {
    const disabledSessionIds = new Set<string>();
    const errors: ScrapeError[] = [];
    let profilesOk = 0;
    let postsFound = 0;
    let postsNew = 0;
    let postsUpdated = 0;
    let recordsPersisted = 0;
    let requestsMade = 0;
    let recordsReceived = 0;
    let datasetsCompleted = 0;
    const datasetsTotal = profiles.reduce(
      (total, profile) => total + (profile.platform === "instagram" ? 3 : 2),
      0,
    );
    await options.onProgress?.({
      type: "started",
      profilesTotal: requestedProfiles.length,
      profilesAttempted: profiles.length,
      profilesSkipped,
      datasetsTotal,
    });

    const reportDataset = async (job: ScrapeJob, progress: ScrapeDatasetProgress) => {
      datasetsCompleted += 1;
      const activity = progress.status === "success"
        ? `@${job.profile.handle}: dataset concluido (${datasetsCompleted}/${datasetsTotal}).`
        : `@${job.profile.handle}: dataset falhou; consolidando o resultado.`;
      await setRunActivity(run.id, activity);
      await options.onProgress?.({
        type: "dataset",
        profileId: job.profile.id,
        handle: job.profile.handle,
        platform: job.profile.platform as Platform,
        datasetId: progress.datasetId,
        status: progress.status,
        recordsReceived: progress.recordsReceived,
        datasetsCompleted,
        datasetsTotal,
        errorCode: progress.errorCode,
      });
    };

    // Pool global de chaves: IG e TikTok compartilham os mesmos workers.
    let sessions: ActiveCollectorSession[] = [];
    let sessionsError: string | null = null;
    try {
      sessions = await getActiveCollectorSessions();
    } catch (error) {
      sessionsError = errorMessage(error);
    }

    const noSessionsAvailable = sessions.length === 0;
    if (noSessionsAvailable && profiles.length > 0) {
      const reason =
        sessionsError ??
        "Nenhuma chave com credito disponivel. Atualize saldos em /settings ou cadastre uma conta free com saldo.";
      for (const profile of profiles) {
        errors.push({
          profileId: profile.id,
          handle: profile.handle,
          platform: profile.platform,
          error: reason,
          errorCode: "no_session",
        });
        await recordRunFinalFailure(
          run.id,
          { profile, attemptedSessionIds: new Set<string>() },
          `Nenhuma API ativa para @${profile.handle}.`,
        );
      }
    }

    const runTimeoutMs = getRunTimeoutMs(profiles.length, Math.max(sessions.length, 1));
    // AbortSignal do run: cancela workers + fetches quando o timeout global estourar
    // (antes: o run falhava mas as coletas seguiam pagando) ou quando options.signal abortar.
    const runController = new AbortController();
    const externalSignal = options.signal;
    const forwardExternalAbort = () => runController.abort();
    if (externalSignal?.aborted) {
      runController.abort();
    } else {
      externalSignal?.addEventListener("abort", forwardExternalAbort, { once: true });
    }
    await withRunTimeout(
      runTimeoutMs,
      async () => {
        if (sessions.length > 0 && profiles.length > 0) {
          let pendingJobs: ScrapeJob[] = profiles.map((profile) => ({
            profile,
            attemptedSessionIds: new Set<string>(),
          }));
          const maxRounds = Math.max(
            Math.min(sessions.length, SCRAPE_MAX_RETRIES_PER_PROFILE),
            1,
          );

          for (let round = 0; round < maxRounds && pendingJobs.length > 0; round += 1) {
            if (runController.signal.aborted) {
              break;
            }
            const healthySessions = sessions.filter((session) => !disabledSessionIds.has(session.id));
            if (healthySessions.length === 0) {
              break;
            }

            // Backoff exponencial entre rounds: 1s, 2s, 4s, ..., teto 30s. Evita
            // retry imediato em cenarios de rate-limit prolongado (20 contas 5xx).
            if (round > 0) {
              const delayMs = Math.min(30_000, 1_000 * 2 ** (round - 1));
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }

            const stage = await executeStage(
              run.id,
              pendingJobs,
              sessions,
              disabledSessionIds,
              true,
              reportDataset,
              runController.signal,
            );
            errors.push(...stage.errors);
            profilesOk += stage.profilesOk;
            postsFound += stage.postsFound;
            postsNew += stage.postsNew;
            postsUpdated += stage.postsUpdated;
            recordsPersisted += stage.recordsPersisted;
            requestsMade += stage.requestsMade;
            recordsReceived += stage.recordsReceived;
            pendingJobs = stage.retryJobs;
          }

          if (runController.signal.aborted) {
            // Timeout global ou cancelamento: encerra sem agendar novos perfis.
            throw new Error("Coleta cancelada (timeout global ou pedido do usuário).");
          }

          for (const job of pendingJobs) {
            errors.push({
              profileId: job.profile.id,
              handle: job.profile.handle,
              platform: job.profile.platform,
              error: "Nenhuma sessao API saudavel concluiu a coleta deste perfil.",
              errorCode: "no_session",
            });
            await recordRunFinalFailure(
              run.id,
              job,
              `Nenhuma API saudavel concluiu @${job.profile.handle}.`,
            );
          }
        }
      },
      () => runController.abort(),
    );
    if (externalSignal) {
      externalSignal.removeEventListener("abort", forwardExternalAbort);
    }

    // Erros not_found/partial_empty sao avisos de datasets opcionais e nao
    // tornam o run parcialmente falho sozinhos.
    const status = getScrapeRunStatus(errors, profilesOk);
    const updated = await withDbWriteRetry(() =>
      prisma.scrapeRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          profilesOk,
          postsFound,
          requestsMade,
          recordsReceived,
          recordsPersisted,
          // Custo estimado = registros entregues (BD cobra por registro), nao requests.
          estimatedCredits: recordsReceived,
          currentActivity: `Coleta concluida: ${profilesOk}/${requestedProfiles.length} perfil(is) finalizado(s).`,
          errorsJson: errors.length > 0 ? JSON.stringify(errors) : null,
        },
      }),
    );

    return {
      id: updated.id,
      status: updated.status,
      profilesTotal: updated.profilesTotal,
      profilesAttempted: updated.profilesAttempted,
      profilesOk: updated.profilesOk,
      profilesSkipped,
      postsFound: updated.postsFound,
      postsNew,
      postsUpdated,
      requestsMade: updated.requestsMade,
      recordsReceived: updated.recordsReceived,
      recordsPersisted: updated.recordsPersisted,
      estimatedCredits: updated.estimatedCredits,
      profilesFinished: updated.profilesFinished,
      currentActivity: updated.currentActivity,
      errors,
    };
  } catch (error) {
    const message = errorMessage(error);
    const isTimeout = message.toLowerCase().includes("timeout global");
    await withDbWriteRetry(() =>
      prisma.scrapeRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          currentActivity: `Coleta interrompida: ${message}`.slice(0, 240),
          errorsJson: JSON.stringify([{ error: message, errorCode: isTimeout ? "timeout" : "unknown" }]),
        },
      }),
    );
    throw error;
  }
}

export { reconcileZombieRuns } from "@/lib/scrape-reconcile";
