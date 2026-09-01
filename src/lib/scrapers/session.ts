import type { CollectorSession } from "@prisma/client";
import { prisma, withDbWriteRetry } from "@/lib/db";
import {
  fetchBrightDataBalance,
  FREE_TIER_CREDITS,
  isInsufficientCreditError,
  type CreditStatus,
} from "@/lib/scrapers/brightdata-balance";

/** Valor gravado em CollectorSession.platform: chave serve qualquer plataforma. */
export const GLOBAL_SESSION_PLATFORM = "global";

type CreateCollectorSessionInput = {
  name: string;
  provider?: ApiProvider;
  apiKey: string;
};

type UpdateCollectorSessionInput = {
  id: string;
  name?: string;
  provider?: ApiProvider;
  apiKey?: string;
  status?: "active" | "paused";
};

export type ApiProvider = "brightdata";

/** Classificacao principal: credito, nao "boa/ruim" por falha generica. */
export type SessionHealth = "has_credit" | "no_credit" | "unknown" | "paused";

export type CollectorSessionView = {
  id: string;
  scope: "global";
  name: string;
  provider: ApiProvider | null;
  providerLabel: string | null;
  hasApiKey: boolean;
  credentialLabel: string;
  status: string;
  health: SessionHealth;
  healthLabel: string;
  queuePosition: number | null;
  creditStatus: CreditStatus;
  balanceUsd: number | null;
  pendingBalanceUsd: number | null;
  creditsRemaining: number | null;
  creditsSource: string | null;
  creditsLabel: string;
  balanceCheckedAt: string | null;
  balanceError: string | null;
  monthRecordsUsed: number;
  lastAttemptedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  createdAt: string;
};

export type SessionPoolSummary = {
  total: number;
  hasCredit: number;
  noCredit: number;
  unknown: number;
  paused: number;
  activeInQueue: number;
};

export type CollectorSessionsList = {
  sessions: CollectorSessionView[];
  summary: SessionPoolSummary;
};

export type CollectorSessionTestResult = {
  sessionId: string;
  ok: boolean;
  checks: Array<{
    label: string;
    url: string;
    ok: boolean;
    status: number | null;
    detail: string;
  }>;
};

export type ActiveCollectorSession = CollectorSession;

const API_PROVIDER_LABELS: Record<ApiProvider, string> = {
  brightdata: "Bright Data",
};

function isApiProvider(value: string | null | undefined): value is ApiProvider {
  return value === "brightdata";
}

function normalizeProvider(provider?: string | null) {
  const trimmed = provider?.trim().toLowerCase();
  return isApiProvider(trimmed) ? trimmed : null;
}

function normalizeName(name: string) {
  const trimmed = name.trim();
  return trimmed || "Bright Data";
}

function normalizeApiKey(apiKey?: string | null) {
  const trimmed = apiKey?.trim();
  return trimmed || null;
}

function makeLegacyStorageKey(provider: ApiProvider) {
  return `global-${provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function requireApiSession(session: CollectorSession) {
  if (session.kind !== "api") {
    throw new Error("Sessoes de navegador foram desativadas. Cadastre uma API Bright Data.");
  }

  const provider = normalizeProvider(session.provider);
  if (provider !== "brightdata" || !session.apiKey?.trim()) {
    throw new Error("Sessao API sem provedor Bright Data ou chave cadastrada.");
  }

  return { provider, apiKey: session.apiKey };
}

async function getSession(id: string) {
  return prisma.collectorSession.findUniqueOrThrow({
    where: { id },
  });
}

function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function classifySessionHealth(session: {
  status: string;
  creditStatus?: string | null;
}): SessionHealth {
  if (session.status !== "active") {
    return "paused";
  }

  const credit = session.creditStatus ?? "unknown";
  if (credit === "has_credit") {
    return "has_credit";
  }
  if (credit === "no_credit") {
    return "no_credit";
  }
  return "unknown";
}

function healthLabel(health: SessionHealth) {
  if (health === "has_credit") {
    return "com credito";
  }
  if (health === "no_credit") {
    return "sem credito";
  }
  if (health === "paused") {
    return "pausada";
  }
  return "credito desconhecido";
}

function formatCreditsLabel(input: {
  creditsRemaining: number | null;
  creditsSource: string | null;
  balanceUsd: number | null;
  monthRecordsUsed: number;
}) {
  if (input.creditsRemaining !== null && Number.isFinite(input.creditsRemaining)) {
    const rounded = Math.round(input.creditsRemaining);
    if (input.creditsSource === "official") {
      const usd =
        input.balanceUsd !== null ? ` · US$ ${input.balanceUsd.toFixed(2)}` : "";
      return `~${rounded.toLocaleString("pt-BR")} creditos (saldo oficial)${usd}`;
    }
    if (input.creditsSource === "estimated_local") {
      return `~${rounded.toLocaleString("pt-BR")} creditos est. (uso local ${input.monthRecordsUsed.toLocaleString("pt-BR")}/${FREE_TIER_CREDITS.toLocaleString("pt-BR")} no mes)`;
    }
    return `~${rounded.toLocaleString("pt-BR")} creditos`;
  }

  if (input.monthRecordsUsed > 0) {
    return `uso local no mes: ${input.monthRecordsUsed.toLocaleString("pt-BR")} registros (saldo BD indisponivel)`;
  }

  return "saldo nao consultado";
}

function sessionToView(
  session: CollectorSession,
  queuePosition: number | null,
  monthRecordsUsed: number,
): CollectorSessionView {
  const provider = normalizeProvider(session.provider);
  const providerLabel = provider ? API_PROVIDER_LABELS[provider] : null;
  const health = classifySessionHealth(session);
  const creditStatus = (session.creditStatus as CreditStatus) || "unknown";
  const balanceUsd = session.balanceUsd ?? null;
  const creditsRemaining = session.creditsRemaining ?? null;
  const creditsSource = session.creditsSource ?? null;

  return {
    id: session.id,
    scope: "global",
    name: session.name,
    provider,
    providerLabel,
    hasApiKey: Boolean(session.apiKey?.trim()),
    credentialLabel: session.apiKey?.trim() ? "chave cadastrada" : "sem chave",
    status: session.status,
    health,
    healthLabel: healthLabel(health),
    queuePosition,
    creditStatus,
    balanceUsd,
    pendingBalanceUsd: session.pendingBalanceUsd ?? null,
    creditsRemaining,
    creditsSource,
    creditsLabel: formatCreditsLabel({
      creditsRemaining,
      creditsSource,
      balanceUsd,
      monthRecordsUsed,
    }),
    balanceCheckedAt: session.balanceCheckedAt?.toISOString() ?? null,
    balanceError: session.balanceError,
    monthRecordsUsed,
    lastAttemptedAt: session.lastAttemptedAt?.toISOString() ?? null,
    lastSuccessAt: session.lastSuccessAt?.toISOString() ?? null,
    lastError: session.lastError,
    consecutiveFailures: session.consecutiveFailures,
    createdAt: session.createdAt.toISOString(),
  };
}

function buildPoolSummary(sessions: CollectorSessionView[]): SessionPoolSummary {
  return {
    total: sessions.length,
    hasCredit: sessions.filter((session) => session.health === "has_credit").length,
    noCredit: sessions.filter((session) => session.health === "no_credit").length,
    unknown: sessions.filter((session) => session.health === "unknown").length,
    paused: sessions.filter((session) => session.health === "paused").length,
    activeInQueue: sessions.filter((session) => session.queuePosition !== null).length,
  };
}

export async function migrateSessionsToGlobalScope() {
  await prisma.collectorSession.updateMany({
    where: {
      kind: "api",
      NOT: { platform: GLOBAL_SESSION_PLATFORM },
    },
    data: { platform: GLOBAL_SESSION_PLATFORM },
  });
}

async function monthUsageBySession(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return new Map<string, number>();
  }

  const since = monthStartUtc();
  const rows = await prisma.scrapeAttempt.groupBy({
    by: ["sessionId"],
    where: {
      sessionId: { in: sessionIds },
      startedAt: { gte: since },
    },
    _sum: { recordsReceived: true },
  });

  return new Map(
    rows
      .filter((row) => row.sessionId)
      .map((row) => [row.sessionId as string, row._sum.recordsReceived ?? 0]),
  );
}

function applyLocalCreditEstimate(
  session: CollectorSession,
  monthRecordsUsed: number,
): Pick<
  CollectorSession,
  "creditStatus" | "creditsRemaining" | "creditsSource" | "balanceError"
> {
  // Se ja temos status oficial de saldo, nao sobrescrever com estimativa local.
  if (session.creditStatus === "has_credit" || session.creditStatus === "no_credit") {
    if (session.creditsSource === "official") {
      return {
        creditStatus: session.creditStatus,
        creditsRemaining: session.creditsRemaining,
        creditsSource: session.creditsSource,
        balanceError: session.balanceError,
      };
    }
  }

  if (session.creditStatus === "no_credit" && session.creditsSource === "scrape_error") {
    return {
      creditStatus: "no_credit",
      creditsRemaining: 0,
      creditsSource: "scrape_error",
      balanceError: session.balanceError,
    };
  }

  // Do not resurrect an explicitly exhausted session from a month-local estimate.
  // A balance refresh is the explicit operation that can prove credit is available again.
  if (session.creditStatus === "no_credit") {
    return {
      creditStatus: "no_credit",
      creditsRemaining: 0,
      creditsSource: session.creditsSource ?? "estimated_local",
      balanceError: session.balanceError,
    };
  }

  let remaining = Math.max(0, FREE_TIER_CREDITS - monthRecordsUsed);
  // Se já há um saldo local decrementado (no_data, vault), respeita o menor valor
  // — evita ressuscitar crédito que ScrapeAttempt não contou (0 registros mas 1 créd).
  if (
    session.creditsRemaining !== null &&
    Number.isFinite(session.creditsRemaining) &&
    session.creditsSource === "estimated_local"
  ) {
    remaining = Math.min(remaining, Math.max(0, Math.trunc(session.creditsRemaining)));
  }
  return {
    creditStatus: remaining > 0 ? "has_credit" : "no_credit",
    creditsRemaining: remaining,
    creditsSource: "estimated_local",
    balanceError:
      session.creditStatus === "permission_denied"
        ? "Chave sem permissao de billing — usando estimativa local."
        : session.balanceError,
  };
}

export async function listCollectorSessions(): Promise<CollectorSessionsList> {
  await migrateSessionsToGlobalScope();

  const sessions = await prisma.collectorSession.findMany({
    where: { kind: "api" },
    orderBy: [{ createdAt: "asc" }],
  });

  const usage = await monthUsageBySession(sessions.map((session) => session.id));

  // Enriquece com estimativa local quando nao ha saldo oficial.
  const enriched = sessions.map((session) => {
    const used = usage.get(session.id) ?? 0;
    const local = applyLocalCreditEstimate(session, used);
    return {
      session: {
        ...session,
        creditStatus: local.creditStatus,
        creditsRemaining: local.creditsRemaining,
        creditsSource: local.creditsSource,
        balanceError: local.balanceError,
      } as CollectorSession,
      used,
    };
  });

  // Fila: so quem tem credito (ou desconhecido ainda sem estimativa zero).
  let queueCursor = 0;
  const views = enriched
    .slice()
    .sort((left, right) => {
      // Com credito primeiro, depois unknown, sem credito, pausadas no fim.
      const rank = (item: { session: CollectorSession }) => {
        if (item.session.status !== "active") {
          return 3;
        }
        if (item.session.creditStatus === "has_credit") {
          return 0;
        }
        if (item.session.creditStatus === "unknown") {
          return 1;
        }
        return 2;
      };
      const diff = rank(left) - rank(right);
      if (diff !== 0) {
        return diff;
      }
      const leftCredits = left.session.creditsRemaining ?? -1;
      const rightCredits = right.session.creditsRemaining ?? -1;
      if (leftCredits !== rightCredits) {
        return rightCredits - leftCredits;
      }
      return left.session.createdAt.getTime() - right.session.createdAt.getTime();
    })
    .map(({ session, used }) => {
      const eligible =
        session.status === "active" &&
        Boolean(session.apiKey?.trim()) &&
        normalizeProvider(session.provider) === "brightdata" &&
        session.creditStatus !== "no_credit";

      let queuePosition: number | null = null;
      if (eligible) {
        queueCursor += 1;
        queuePosition = queueCursor;
      }

      return sessionToView(session, queuePosition, used);
    });

  return {
    sessions: views,
    summary: buildPoolSummary(views),
  };
}

/**
 * Consulta GET /customer/balance para cada chave (ou uma) e grava cache local.
 * Chaves sem permissao de billing ficam com permission_denied + estimativa local.
 */
export async function refreshSessionBalances(sessionId?: string) {
  await migrateSessionsToGlobalScope();

  const sessions = await prisma.collectorSession.findMany({
    where: {
      kind: "api",
      id: sessionId ? sessionId : undefined,
      apiKey: { not: null },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const usage = await monthUsageBySession(sessions.map((session) => session.id));
  const results: Array<{ id: string; name: string; creditStatus: string; creditsLabel: string }> =
    [];

  for (const session of sessions) {
    const apiKey = session.apiKey?.trim();
    if (!apiKey) {
      continue;
    }

    const probe = await fetchBrightDataBalance(apiKey);
    const used = usage.get(session.id) ?? 0;
    const now = new Date();

    let creditStatus = probe.creditStatus;
    let creditsRemaining = probe.creditsFromBalance;
    let creditsSource: string | null = null;
    let balanceError = probe.message;

    if (probe.creditStatus === "has_credit" || probe.creditStatus === "no_credit") {
      creditsSource = "official";
      if (probe.creditStatus === "no_credit") {
        creditsRemaining = 0;
      }
    } else if (probe.creditStatus === "permission_denied") {
      const remaining = Math.max(0, FREE_TIER_CREDITS - used);
      creditStatus = remaining > 0 ? "has_credit" : "no_credit";
      creditsRemaining = remaining;
      creditsSource = "estimated_local";
    } else {
      const remaining = Math.max(0, FREE_TIER_CREDITS - used);
      creditStatus = remaining > 0 ? "has_credit" : "no_credit";
      creditsRemaining = remaining;
      creditsSource = "estimated_local";
    }

    const updated = await prisma.collectorSession.update({
      where: { id: session.id },
      data: {
        creditStatus,
        balanceUsd: probe.balanceUsd,
        pendingBalanceUsd: probe.pendingBalanceUsd,
        creditsRemaining,
        creditsSource,
        balanceCheckedAt: now,
        balanceError,
      },
    });

    results.push({
      id: updated.id,
      name: updated.name,
      creditStatus: updated.creditStatus,
      creditsLabel: formatCreditsLabel({
        creditsRemaining: updated.creditsRemaining,
        creditsSource: updated.creditsSource,
        balanceUsd: updated.balanceUsd,
        monthRecordsUsed: used,
      }),
    });
  }

  return { refreshed: results.length, results };
}

export async function createCollectorSession(input: CreateCollectorSessionInput) {
  const provider = normalizeProvider(input.provider) ?? "brightdata";
  const apiKey = normalizeApiKey(input.apiKey);

  if (provider !== "brightdata" || !apiKey) {
    throw new Error("Informe uma chave Bright Data valida.");
  }

  const session = await prisma.collectorSession.create({
    data: {
      platform: GLOBAL_SESSION_PLATFORM,
      name: normalizeName(input.name),
      kind: "api",
      provider,
      apiKey,
      legacyStorageKey: makeLegacyStorageKey(provider),
      status: "active",
      creditStatus: "unknown",
    },
  });

  // Tenta ler saldo na hora (best effort).
  try {
    await refreshSessionBalances(session.id);
  } catch {
    // Cadastro nao depende do saldo.
  }

  const list = await listCollectorSessions();
  const view = list.sessions.find((item) => item.id === session.id);
  return view ?? sessionToView(session, null, 0);
}

export async function updateCollectorSession(input: UpdateCollectorSessionInput) {
  const existing = await getSession(input.id);
  requireApiSession(existing);

  if (input.provider !== undefined && input.provider !== "brightdata") {
    throw new Error("Provedor API invalido.");
  }

  if (input.apiKey !== undefined && !normalizeApiKey(input.apiKey)) {
    throw new Error("A chave Bright Data nao pode ficar vazia.");
  }

  const clearingFailures = input.status === "active" && existing.status !== "active";

  const session = await prisma.collectorSession.update({
    where: { id: input.id },
    data: {
      platform: GLOBAL_SESSION_PLATFORM,
      name: input.name === undefined ? undefined : normalizeName(input.name),
      provider: input.provider,
      apiKey: input.apiKey === undefined ? undefined : normalizeApiKey(input.apiKey),
      status: input.status,
      consecutiveFailures: clearingFailures ? 0 : undefined,
      lastError: clearingFailures ? null : undefined,
      // Ao reativar, zera "sem credito" por erro antigo e reconsulta depois.
      creditStatus: clearingFailures ? "unknown" : undefined,
      balanceError: clearingFailures ? null : undefined,
    },
  });

  if (clearingFailures || input.apiKey !== undefined) {
    try {
      await refreshSessionBalances(session.id);
    } catch {
      // ignore
    }
  }

  const list = await listCollectorSessions();
  const view = list.sessions.find((item) => item.id === session.id);
  return view ?? sessionToView(session, null, 0);
}

export async function deleteCollectorSession(id: string) {
  const session = await getSession(id);
  await prisma.collectorSession.delete({ where: { id: session.id } });
  return { deleted: true, id: session.id };
}

/**
 * Workers so usam chaves ativas com credito (oficial ou estimado).
 * Ordena por mais credito restante.
 */
export async function getActiveCollectorSessions(): Promise<ActiveCollectorSession[]> {
  await migrateSessionsToGlobalScope();

  const sessions = await prisma.collectorSession.findMany({
    where: {
      kind: "api",
      provider: "brightdata",
      status: "active",
      apiKey: { not: null },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const withKey = sessions.filter((session) => Boolean(session.apiKey?.trim()));
  const usage = await monthUsageBySession(withKey.map((session) => session.id));

  const enriched = withKey.map((session) => {
    const used = usage.get(session.id) ?? 0;
    const local = applyLocalCreditEstimate(session, used);
    // Chave recém-criada sem nenhum refresh: bloqueia até provar saldo (evita has_credit fantasma 5000)
    const isFreshUnknown =
      (session.creditStatus === "unknown" || session.creditStatus === null) &&
      !session.balanceCheckedAt;
    if (isFreshUnknown && local.creditStatus === "has_credit" && local.creditsSource === "estimated_local") {
      return {
        ...session,
        creditStatus: "unknown",
        creditsRemaining: null,
        creditsSource: null,
      } as CollectorSession;
    }
    return {
      ...session,
      creditStatus: local.creditStatus,
      creditsRemaining: local.creditsRemaining,
      creditsSource: local.creditsSource,
    } as CollectorSession;
  });

  const withCredit = enriched
    .filter((session) => session.creditStatus === "has_credit")
    .sort((left, right) => {
      const leftCredits = left.creditsRemaining ?? 0;
      const rightCredits = right.creditsRemaining ?? 0;
      if (leftCredits !== rightCredits) {
        return rightCredits - leftCredits;
      }
      return left.createdAt.getTime() - right.createdAt.getTime();
    });

  if (withCredit.length === 0) {
    return [];
  }

  return withCredit;
}

export async function recordCollectorSessionSuccess(id: string) {
  return withDbWriteRetry(() =>
    prisma.collectorSession.update({
      where: { id },
      data: {
        lastAttemptedAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
        // Sucesso implica que havia credito na conta.
        creditStatus: "has_credit",
      },
    }),
  );
}

export async function recordCollectorSessionNoData(id: string) {
  return withDbWriteRetry(async () => {
    const commonData = {
      lastAttemptedAt: new Date(),
      lastError: null,
      consecutiveFailures: 0,
    };

    // The predicate and decrement are evaluated by PostgreSQL in one update.
    // The separate final-credit branch prevents concurrent calls from making
    // the local estimate negative while marking the last credit as used.
    const decremented = await prisma.collectorSession.updateMany({
      where: {
        id,
        creditsSource: "estimated_local",
        creditsRemaining: { gt: 1 },
      },
      data: {
        ...commonData,
        creditsRemaining: { decrement: 1 },
        creditStatus: "has_credit",
      },
    });

    if (decremented.count === 0) {
      const exhausted = await prisma.collectorSession.updateMany({
        where: {
          id,
          creditsSource: "estimated_local",
          creditsRemaining: 1,
        },
        data: {
          ...commonData,
          creditsRemaining: { decrement: 1 },
          creditStatus: "no_credit",
        },
      });

      if (exhausted.count === 0) {
        return prisma.collectorSession.update({ where: { id }, data: commonData });
      }
    }

    return prisma.collectorSession.findUniqueOrThrow({ where: { id } });
  });
}

export async function recordCollectorSessionVaultUse(id: string, records: number) {
  const cost = Math.max(1, Math.trunc(records));
  return withDbWriteRetry(async () => {
    const session = await prisma.collectorSession.findUnique({ where: { id }, select: { creditsRemaining: true, creditsSource: true } });
    if (!session || session.creditsSource !== "estimated_local" || session.creditsRemaining === null) {
      return session;
    }
    const remaining = Math.max(0, (session.creditsRemaining ?? 0) - cost);
    return prisma.collectorSession.update({
      where: { id },
      data: {
        creditsRemaining: remaining,
        creditStatus: remaining > 0 ? "has_credit" : "no_credit",
        lastAttemptedAt: new Date(),
      },
    });
  });
}

export async function recordCollectorSessionFailure(
  id: string,
  error: string,
  pause: boolean,
) {
  const noCredit = isInsufficientCreditError(error);

  return withDbWriteRetry(() =>
    prisma.collectorSession.update({
      where: { id },
      data: {
        lastAttemptedAt: new Date(),
        lastError: error.slice(0, 240),
        consecutiveFailures: { increment: 1 },
        status: pause ? "paused" : undefined,
        creditStatus: noCredit ? "no_credit" : undefined,
        creditsRemaining: noCredit ? 0 : undefined,
        creditsSource: noCredit ? "scrape_error" : undefined,
        balanceError: noCredit ? error.slice(0, 240) : undefined,
      },
    }),
  );
}

export async function testCollectorSession(sessionId: string): Promise<CollectorSessionTestResult> {
  const session = await getSession(sessionId);
  requireApiSession(session);

  const refresh = await refreshSessionBalances(sessionId);
  const result = refresh.results[0];

  return {
    sessionId: session.id,
    ok: true,
    checks: [
      {
        label: "Cadastro local",
        url: "local",
        ok: true,
        status: null,
        detail: "Chave global salva localmente (IG + TikTok).",
      },
      {
        label: "Saldo / credito",
        url: "https://api.brightdata.com/customer/balance",
        ok: result?.creditStatus !== "no_credit",
        status: null,
        detail: result
          ? `${result.creditStatus}: ${result.creditsLabel}`
          : "Nao foi possivel atualizar o saldo.",
      },
    ],
  };
}

// Compat: testes antigos que importavam classify por falhas.
export function classifySessionHealthLegacy(session: {
  status: string;
  consecutiveFailures: number;
  lastError: string | null;
}): "good" | "bad" | "paused" {
  if (session.status !== "active") {
    return "paused";
  }
  if (session.consecutiveFailures > 0 || Boolean(session.lastError?.trim())) {
    return "bad";
  }
  return "good";
}
