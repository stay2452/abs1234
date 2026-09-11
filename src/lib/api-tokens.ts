import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import type { SessionUser, UserRole } from "@/lib/auth";
import { isValidRole } from "@/lib/auth";

const TOKEN_PREFIX = "eoz_";
const TOKEN_BYTES = 24;
const PREFIX_LEN = 12;

export type ApiTokenInfo = {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

function hashToken(token: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(token, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyTokenHash(token: string, stored: string): boolean {
  const separator = stored.indexOf(":");
  if (separator < 1) return false;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(stored.slice(separator + 1), "hex");
    actual = scryptSync(token, stored.slice(0, separator), 64);
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Emite um token pessoal. Retorna o texto UMA vez (nunca gravado em claro). */
export async function issueApiToken(
  userId: string,
  name = "Chrome extension",
): Promise<{ token: string; info: ApiTokenInfo }> {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("hex")}`;
  const created = await prisma.apiToken.create({
    data: {
      userId,
      name: name.slice(0, 80),
      prefix: token.slice(0, PREFIX_LEN),
      tokenHash: hashToken(token),
    },
  });
  return {
    token,
    info: {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      createdAt: created.createdAt,
      lastUsedAt: created.lastUsedAt,
      revokedAt: created.revokedAt,
    },
  };
}

/** Resolve um Bearer `eoz_...` para o dono (ignora revogados). Sem revelar motivo. */
export async function verifyApiToken(bearer: string): Promise<SessionUser | null> {
  const token = bearer.trim();
  if (!token.startsWith(TOKEN_PREFIX) || token.length < PREFIX_LEN + 8) {
    return null;
  }
  const candidates = await prisma.apiToken
    .findMany({
      where: { prefix: token.slice(0, PREFIX_LEN), revokedAt: null },
      include: { user: true },
    })
    .catch(() => []);
  for (const row of candidates) {
    if (!verifyTokenHash(token, row.tokenHash)) continue;
    const user = row.user;
    if (!user || !user.isActive || !isValidRole(user.role)) return null;
    void prisma.apiToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
    };
  }
  return null;
}

export async function listApiTokens(userId: string): Promise<ApiTokenInfo[]> {
  const rows = await prisma.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  }));
}

export async function revokeApiTokenByValue(token: string): Promise<boolean> {
  const value = token.trim();
  if (!value.startsWith(TOKEN_PREFIX)) {
    return false;
  }
  const candidates = await prisma.apiToken
    .findMany({
      where: { prefix: value.slice(0, PREFIX_LEN), revokedAt: null },
      select: { id: true, tokenHash: true },
    })
    .catch(() => []);
  for (const row of candidates) {
    if (!verifyTokenHash(value, row.tokenHash)) continue;
    const result = await prisma.apiToken
      .updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => null);
    return (result?.count ?? 0) > 0;
  }
  return false;
}

export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {  const result = await prisma.apiToken
    .updateMany({
      where: { id: tokenId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => null);
  return (result?.count ?? 0) > 0;
}
