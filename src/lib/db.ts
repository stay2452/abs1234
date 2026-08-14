import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * PostgreSQL handles concurrent writes natively (MVCC).
 * This is a pass-through kept to avoid refactoring all call sites.
 * Can be inlined later.
 */
export function withDbWrite<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

/**
 * Retry for transient PostgreSQL errors:
 * - 40001 serialization_failure
 * - 40P01 deadlock_detected
 * - 57P03 cannot_connect_now
 * - 08000/08003/08006 connection exceptions
 * - Generic timeout/locked/busy strings (covers Prisma client errors)
 */
export function isRetryableDbError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? (error as Prisma.PrismaClientKnownRequestError).code
      : null;
  if (code && ["P2024", "P1001", "P1002"].includes(code)) return true;
  return /timeout|timed out|locked|busy|Socket timeout|Unable to open|connection|40001|40P01|57P03|08000|08003|08006/i.test(msg);
}

export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
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

export function withDbWriteRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  return withDbWrite(() => withDbRetry(fn, attempts));
}
