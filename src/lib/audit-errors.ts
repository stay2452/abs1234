import { prisma } from "@/lib/db";
import { isUnavailableTargetError } from "@/lib/scrapers/brightdata-client";

export type ErrorProfileSummary = {
  profileId: string;
  handle: string;
  platform: string;
  url: string;
  status: string;
  lastError: string;
  errorCode: string;
  lastFailedAt: Date;
  failedCount: number;
  failedInRuns: string[];
};

function isRemovableError(errorCode: string | null, message: string | null): boolean {
  if (!errorCode) return false;
  const msg = (message ?? "").toLowerCase();
  if (errorCode === "not_found") return true;
  if (errorCode === "account" && /suspended|banned|account has been/.test(msg)) return true;
  if (errorCode === "provider" && isUnavailableTargetError(message ?? "")) return true;
  return false;
}

export async function getErrorProfilesFromLastRuns(n = 5): Promise<{ runs: Array<{ id: string; startedAt: Date }>; profiles: ErrorProfileSummary[] }> {
  const runs = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: Math.max(1, Math.min(n, 10)),
    select: { id: true, startedAt: true },
  });

  if (runs.length === 0) return { runs: [], profiles: [] };

  const runIds = runs.map((r) => r.id);

  // Busca todas as tentativas falhadas desses runs com profileId
  const attempts = await prisma.scrapeAttempt.findMany({
    where: {
      scrapeRunId: { in: runIds },
      status: "failed",
      profileId: { not: null },
    },
    select: {
      profileId: true,
      scrapeRunId: true,
      errorCode: true,
      errorMessage: true,
      startedAt: true,
      profile: {
        select: { id: true, handle: true, platform: true, url: true, status: true },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  // Agrupa por profileId, mantém só os com erro removível
  const map = new Map<string, ErrorProfileSummary & { _lastTs: number }>();

  for (const att of attempts) {
    if (!att.profileId || !att.profile) continue;
    if (!isRemovableError(att.errorCode, att.errorMessage)) continue;

    const existing = map.get(att.profileId);
    const failedAt = att.startedAt;

    if (!existing) {
      map.set(att.profileId, {
        profileId: att.profileId,
        handle: att.profile.handle,
        platform: att.profile.platform,
        url: att.profile.url,
        status: att.profile.status,
        lastError: att.errorMessage ?? att.errorCode ?? "Erro desconhecido",
        errorCode: att.errorCode ?? "unknown",
        lastFailedAt: failedAt,
        failedCount: 1,
        failedInRuns: [att.scrapeRunId],
        _lastTs: failedAt.getTime(),
      });
    } else {
      // evita contar mesmo run duplicado (vários datasets falharam no mesmo run)
      if (!existing.failedInRuns.includes(att.scrapeRunId)) {
        existing.failedInRuns.push(att.scrapeRunId);
        existing.failedCount += 1;
      }
      // mantém o erro mais recente
      if (failedAt.getTime() > existing._lastTs) {
        existing.lastError = att.errorMessage ?? att.errorCode ?? existing.lastError;
        existing.errorCode = att.errorCode ?? existing.errorCode;
        existing.lastFailedAt = failedAt;
        existing._lastTs = failedAt.getTime();
      }
    }
  }

  const profiles = Array.from(map.values())
    .map(({ _lastTs, ...rest }) => rest)
    .sort((a, b) => {
      if (b.failedCount !== a.failedCount) return b.failedCount - a.failedCount;
      return b.lastFailedAt.getTime() - a.lastFailedAt.getTime();
    });

  return { runs, profiles };
}
