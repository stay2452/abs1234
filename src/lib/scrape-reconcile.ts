import { assertSupabaseDatabaseUrl, prisma, withDbWriteRetry } from "@/lib/db";

/**
 * Zumbis: runs com status=running cujo startedAt é muito antigo.
 * Print mostrou runs de 27-28/08 travados por dias → finishedAt=null.
 * Causa: processo Next morreu sem executar finally em runScrape.
 *
 * Supabase-only (regra 2026-08-30, rígida desde 2026-09-07): sem fallback
 * SQLite/`file:` — sem `DATABASE_URL=postgresql://` do Supabase, falha alto.
 */
export const ZOMBIE_RUN_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3h — acima do pior caso 240 perfis/100 chaves; cobre 1 chave com muitos perfis

export function isZombieStartedAt(startedAt: Date, now = new Date()) {
  return now.getTime() - startedAt.getTime() > ZOMBIE_RUN_TIMEOUT_MS;
}

/**
 * Marca todos os running antigos como failed.
 * Usado no boot (scripts/start.mjs), antes de aceitar nova coleta (route.ts) e no início de runScrape.
 * PostgreSQL Supabase apenas — usa Prisma updateMany sem raw.
 */
export async function reconcileZombieRuns(now = new Date()): Promise<number> {
  assertSupabaseDatabaseUrl();
  const threshold = new Date(now.getTime() - ZOMBIE_RUN_TIMEOUT_MS);
  try {
    const result = await withDbWriteRetry(() =>
      prisma.scrapeRun.updateMany({
        where: {
          status: "running",
          startedAt: { lt: threshold },
        },
        data: {
          status: "failed",
          finishedAt: now,
          currentActivity: "Marcado como falha: timeout zumbi (sem finalização >3h, processo reiniciado)",
          errorsJson: JSON.stringify([
            { errorCode: "zombie_timeout", error: "Run travado sem finalizacao - processo reiniciado ou timeout global" },
          ]),
        },
      }),
    );
    if (result.count > 0) {
      console.warn(`[reconcile] ${result.count} run(s) zumbi marcado(s) como failed (threshold ${threshold.toISOString()})`);
    }
    return result.count;
  } catch (error) {
    console.warn("[reconcile] falha ao reconciliar zumbis:", error instanceof Error ? error.message : String(error));
    return 0;
  }
}

export async function hasActiveRunningRun(now = new Date()): Promise<{ hasActive: boolean; zombieCount: number; activeRunId?: string }> {
  assertSupabaseDatabaseUrl();
  const threshold = new Date(now.getTime() - ZOMBIE_RUN_TIMEOUT_MS);
  const zombieCount = await prisma.scrapeRun.count({
    where: { status: "running", startedAt: { lt: threshold } },
  });
  const active = await prisma.scrapeRun.findFirst({
    where: { status: "running", startedAt: { gte: threshold } },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });
  return { hasActive: Boolean(active), zombieCount, activeRunId: active?.id };
}

export async function getActiveRunningRun() {
  assertSupabaseDatabaseUrl();
  const threshold = new Date(Date.now() - ZOMBIE_RUN_TIMEOUT_MS);
  return prisma.scrapeRun.findFirst({
    where: { status: "running", startedAt: { gte: threshold } },
    orderBy: { startedAt: "desc" },
  });
}
