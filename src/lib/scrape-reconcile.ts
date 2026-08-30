import { prisma, withDbWriteRetry } from "@/lib/db";

/**
 * Zumbis: runs com status=running cujo startedAt é muito antigo.
 * Print mostrou runs de 27-28/08 travados por dias → finishedAt=null.
 * Causa: processo Next morreu sem executar finally em runScrape.
 */
export const ZOMBIE_RUN_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3h — acima do pior caso 240 perfis/20 chaves ≈ 36min; cobre 1 chave com muitos perfis
export const ZOMBIE_HEARTBEAT_MS = 3 * 60 * 60 * 1000;

export function isZombieStartedAt(startedAt: Date, now = new Date()) {
  return now.getTime() - startedAt.getTime() > ZOMBIE_RUN_TIMEOUT_MS;
}

/**
 * Marca todos os running antigos como failed.
 * Usado no boot (scripts/start.mjs), antes de aceitar nova coleta (route.ts) e no início de runScrape.
 * Funciona tanto em Postgres (Supabase) quanto em SQLite (dev.db) — usa Prisma updateMany sem raw.
 */
export async function reconcileZombieRuns(now = new Date()): Promise<number> {
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
          currentActivity: "Marcado como falha: timeout zumbi (sem heartbeat >3h, processo reiniciado)",
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
    const msg = error instanceof Error ? error.message : String(error);
    // Fallback para dev local: DATABASE_URL=file:... com provider postgresql ainda não compatível
    // Usa sqlite direto via python/Node sem Prisma — garante limpeza local 100% automática
    if (msg.includes("must start with the protocol `postgresql") || msg.includes("DATABASE_URL")) {
      try {
        const count = await reconcileZombieRunsSqliteFallback(now);
        if (count > 0) console.warn(`[reconcile:sqlite] ${count} zumbi(s) limpos via fallback`);
        return count;
      } catch (fallbackError) {
        console.warn("[reconcile] fallback sqlite falhou:", fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
        return 0;
      }
    }
    console.warn("[reconcile] falha ao reconciliar zumbis:", msg);
    return 0;
  }
}

async function reconcileZombieRunsSqliteFallback(now: Date): Promise<number> {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.startsWith("file:")) return 0;
  // file:./dev.db?query ou file:./prisma/dev.db
  const filePart = dbUrl.replace(/^file:/, "").split("?")[0];
  const { resolve } = await import("node:path");
  const { existsSync } = await import("node:fs");
  const dbPath = resolve(process.cwd(), filePart);
  if (!existsSync(dbPath)) {
    // tenta prisma/dev.db como fallback
    const alt = resolve(process.cwd(), "prisma", filePart.replace(/^\.\//, ""));
    if (!existsSync(alt)) return 0;
    return reconcileSqliteFile(alt, now);
  }
  return reconcileSqliteFile(dbPath, now);
}

async function reconcileSqliteFile(dbPath: string, now: Date): Promise<number> {
  const thresholdMs = now.getTime() - ZOMBIE_RUN_TIMEOUT_MS;
  // Usa python3 se disponível (já usado no projeto), senão tenta better-sqlite3
  const { spawnSync } = await import("node:child_process");
  const py = spawnSync("python3", ["-c", `
import sqlite3, sys
db=sys.argv[1]
thr=int(sys.argv[2])
now=int(sys.argv[3])
con=sqlite3.connect(db)
cur=con.cursor()
try:
    cur.execute('SELECT COUNT(*) FROM ScrapeRun WHERE status=\"running\" AND startedAt < ?', (thr,))
    before=cur.fetchone()[0]
    cur.execute('UPDATE ScrapeRun SET status=\"failed\", finishedAt=?, currentActivity=\"Marcado como falha: timeout zumbi (fallback sqlite)\", errorsJson=? WHERE status=\"running\" AND startedAt < ?', (now, '[{\"errorCode\":\"zombie_timeout\",\"error\":\"Run zumbi reconciliado fallback sqlite\"}]', thr))
    con.commit()
    print(cur.rowcount)
except Exception as e:
    print(f\"err:{e}\", file=sys.stderr)
    sys.exit(1)
` , dbPath, String(thresholdMs), String(now.getTime())], { encoding: "utf-8" });
  if (py.status === 0) {
    const count = parseInt((py.stdout || "").trim(), 10);
    return Number.isFinite(count) ? count : 0;
  }
  // fallback sem python: tenta via prisma raw já falhou, então retorna 0
  console.warn("[reconcile:sqlite] python3 falhou:", py.stderr);
  return 0;
}

export async function hasActiveRunningRun(now = new Date()): Promise<{ hasActive: boolean; zombieCount: number; activeRunId?: string }> {
  const threshold = new Date(now.getTime() - ZOMBIE_RUN_TIMEOUT_MS);
  try {
    const zombieCount = await prisma.scrapeRun.count({
      where: { status: "running", startedAt: { lt: threshold } },
    });
    const active = await prisma.scrapeRun.findFirst({
      where: { status: "running", startedAt: { gte: threshold } },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true },
    });
    return { hasActive: Boolean(active), zombieCount, activeRunId: active?.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("must start with the protocol `postgresql")) {
      // fallback sqlite: conta via python
      return hasActiveRunningRunSqliteFallback(now);
    }
    throw error;
  }
}

async function hasActiveRunningRunSqliteFallback(now: Date) {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.startsWith("file:")) return { hasActive: false, zombieCount: 0 };
  const { resolve } = await import("node:path");
  const { existsSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const filePart = dbUrl.replace(/^file:/, "").split("?")[0];
  let dbPath = resolve(process.cwd(), filePart);
  if (!existsSync(dbPath)) dbPath = resolve(process.cwd(), "prisma", filePart.replace(/^\.\//, ""));
  if (!existsSync(dbPath)) return { hasActive: false, zombieCount: 0 };
  const thresholdMs = now.getTime() - ZOMBIE_RUN_TIMEOUT_MS;
  const py = spawnSync("python3", ["-c", `
import sqlite3, sys
db=sys.argv[1]
thr=int(sys.argv[2])
con=sqlite3.connect(db)
cur=con.cursor()
cur.execute('SELECT COUNT(*) FROM ScrapeRun WHERE status=\"running\" AND startedAt < ?', (thr,))
z=int(cur.fetchone()[0] or 0)
cur.execute('SELECT COUNT(*) FROM ScrapeRun WHERE status=\"running\" AND startedAt >= ?', (thr,))
a=int(cur.fetchone()[0] or 0)
cur.execute('SELECT id FROM ScrapeRun WHERE status=\"running\" AND startedAt >= ? ORDER BY startedAt DESC LIMIT 1', (thr,))
row=cur.fetchone()
import json
print(json.dumps({\"z\":z,\"a\":a,\"id\":row[0] if row else None}))
`, dbPath, String(thresholdMs)], { encoding: "utf-8" });
  if (py.status !== 0) return { hasActive: false, zombieCount: 0 };
  try {
    const j = JSON.parse((py.stdout || "").trim());
    return { hasActive: j.a > 0, zombieCount: j.z, activeRunId: j.id ?? undefined };
  } catch {
    return { hasActive: false, zombieCount: 0 };
  }
}

export async function getActiveRunningRun() {
  const threshold = new Date(Date.now() - ZOMBIE_RUN_TIMEOUT_MS);
  return prisma.scrapeRun.findFirst({
    where: { status: "running", startedAt: { gte: threshold } },
    orderBy: { startedAt: "desc" },
  });
}

export async function listScrapeRunsSqliteFallback(take = 100) {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.startsWith("file:")) return [];
  const { resolve } = await import("node:path");
  const { existsSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const filePart = dbUrl.replace(/^file:/, "").split("?")[0];
  let dbPath = resolve(process.cwd(), filePart);
  if (!existsSync(dbPath)) dbPath = resolve(process.cwd(), "prisma", filePart.replace(/^\.\//, ""));
  if (!existsSync(dbPath)) return [];
  const py = spawnSync("python3", ["-c", `
import sqlite3, sys, json
db=sys.argv[1]
take=int(sys.argv[2])
con=sqlite3.connect(db)
con.row_factory=sqlite3.Row
cur=con.cursor()
cur.execute('SELECT id, status, startedAt, finishedAt, profilesTotal, profilesFinished, profilesOk, postsFound, recordsReceived, currentActivity FROM ScrapeRun ORDER BY startedAt DESC LIMIT ?', (take,))
rows=[dict(r) for r in cur.fetchall()]
# converte timestamps int -> iso-like int (Prisma espera Date, mas page.tsx usa Date)
for r in rows:
    # startedAt/finishedAt armazenados como int ms em dev.db
    for k in ('startedAt','finishedAt','updatedAt'):
        if r.get(k) is not None and isinstance(r[k], int):
            # mantém int, history/page.tsx converte via new Date(r.startedAt) se for int? Na verdade page usa Date direto
            # Vamos converter para string ISO via python, mas mantemos int para JS Date
            pass
print(json.dumps(rows))
`, dbPath, String(take)], { encoding: "utf-8" });
  if (py.status !== 0) return [];
  try {
    const rows = JSON.parse((py.stdout || "[]").trim());
    // Normaliza para formato esperado por history/page.tsx (Date objects)
    return rows.map((r: any) => ({
      ...r,
      startedAt: r.startedAt ? new Date(typeof r.startedAt === "number" ? r.startedAt : r.startedAt) : new Date(),
      finishedAt: r.finishedAt ? new Date(typeof r.finishedAt === "number" ? r.finishedAt : r.finishedAt) : null,
    }));
  } catch {
    return [];
  }
}
