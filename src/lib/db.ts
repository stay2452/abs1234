import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  dbWriteChain?: Promise<unknown>;
  dbReady?: Promise<void>;
};

/**
 * SQLite + N workers de scrape: uma conexão, WAL e timeout alto evitam
 * "Socket timeout" / database is locked em createMany paralelo.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Cada PRAGMA isolado: journal_mode retorna linha e $executeRawUnsafe falha no SQLite. */
async function runPragma(sql: string) {
  try {
    // queryRaw aceita resultado (ex.: journal_mode → [{ "journal_mode": "wal" }])
    await prisma.$queryRawUnsafe(sql);
  } catch {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      /* ignore */
    }
  }
}

async function ensureSqliteTuned() {
  await runPragma("PRAGMA journal_mode = WAL;");
  await runPragma("PRAGMA synchronous = NORMAL;");
  await runPragma("PRAGMA busy_timeout = 60000;");
  await runPragma("PRAGMA temp_store = MEMORY;");
  await runPragma("PRAGMA foreign_keys = ON;");
}

/** Garante pragmas aplicados 1x por processo. */
export const dbReady: Promise<void> =
  globalForPrisma.dbReady ??
  (globalForPrisma.dbReady = ensureSqliteTuned().then(() => undefined));

/**
 * Serializa escritas concorrentes. Chamadas HTTP Bright Data continuam em paralelo;
 * só o SQLite grava uma de cada vez (evita timeout com 20 chaves).
 */
export function withDbWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalForPrisma.dbWriteChain ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => dbReady)
    .then(() => fn());
  globalForPrisma.dbWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function isRetryableDbError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|locked|busy|SQLITE_BUSY|database is locked|Socket timeout|Unable to open/i.test(
    msg,
  );
}

/** Retry com backoff para erros transitórios de SQLite. */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await dbReady;
      return await fn();
    } catch (error) {
      last = error;
      if (!isRetryableDbError(error) || attempt === attempts) {
        throw error;
      }
      const delayMs = Math.min(2000, 50 * attempt * attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw last;
}

/** Atalho: fila de write + retry. */
export function withDbWriteRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  return withDbWrite(() => withDbRetry(fn, attempts));
}
