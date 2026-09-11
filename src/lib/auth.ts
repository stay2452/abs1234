/**
 * Auth propria do app (parte 1 do modo prod, 2026-09-08).
 *
 * - Senha: hash scrypt com salt aleatorio (`salt:hash` em hex). Sem deps novas.
 * - Sessao: cookie `bp_session` com payload `{uid, role, exp}` assinado em
 *   HMAC-SHA256 com `SESSION_SECRET`. Sem tabela de sessao e sem JWT externo.
 * - `SESSION_SECRET` ausente = falha alto (mesmo espirito do Supabase-only).
 * - Nunca logar senha, hash ou secret. Ver regra 7 de AGENTS.md.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "bp_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 dias

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80),
  email: z.string().trim().toLowerCase().email("Email invalido.").max(160),
  password: z.string().min(8, "Senha com no minimo 8 caracteres.").max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalido.").max(160),
  password: z.string().min(1, "Informe a senha.").max(128),
});

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error(
      "SESSION_SECRET ausente ou curto (minimo 32 caracteres). Defina no .env / Render. Sem ele, login fica desligado por seguranca.",
    );
  }
  return secret;
}

export function isValidRole(role: unknown): role is UserRole {
  return role === "admin" || role === "user";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const separator = stored.indexOf(":");
  if (separator < 1) {
    return false;
  }
  const salt = stored.slice(0, separator);
  const expectedHex = stored.slice(separator + 1);
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
    actual = scryptSync(password, salt, 64);
  } catch {
    return false;
  }
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

type SessionPayload = {
  uid: string;
  role: UserRole;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function signPayload(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function signSessionToken(user: Pick<SessionUser, "id" | "role">, secret?: string): string {
  const key = secret ?? getSessionSecret();
  const payload: SessionPayload = {
    uid: user.id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded, key)}`;
}

export function verifySessionToken(token: string, secret?: string): SessionPayload | null {
  const key = secret ?? getSessionSecret();
  const dot = token.indexOf(".");
  if (dot < 1) {
    return null;
  }
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = signPayload(encoded, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  const raw = base64UrlDecode(encoded);
  if (!raw) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as SessionPayload).uid !== "string" ||
    !isValidRole((payload as SessionPayload).role) ||
    typeof (payload as SessionPayload).exp !== "number"
  ) {
    return null;
  }
  const typed = payload as SessionPayload;
  if (typed.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return typed;
}

/** Le o cookie, valida a assinatura e carrega o usuario ativo do banco. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return null;
  }
  return getUserFromToken(token);
}

function readCookieFromRequest(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) {
      continue;
    }
    if (part.slice(0, separator).trim() === SESSION_COOKIE) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

/** Variante para API routes (usa o header Cookie em vez de next/headers). */
export async function getRequestUser(request: Request): Promise<SessionUser | null> {
  const fromSession = await getUserFromToken(readCookieFromRequest(request));
  if (fromSession) {
    return fromSession;
  }
  // SaaS: extensao sem cookie usa Bearer `eoz_...` (token pessoal do usuario).
  // Import dinamico para nao criar ciclo auth <-> api-tokens.
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) {
    return null;
  }
  try {
    const { verifyApiToken } = await import("@/lib/api-tokens");
    return await verifyApiToken(bearer);
  } catch {
    return null;
  }
}

async function getUserFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }
  let payload: SessionPayload;
  try {
    const verified = verifySessionToken(token);
    if (!verified) {
      return null;
    }
    payload = verified;
  } catch {
    return null;
  }
  const user = await prisma.user
    .findUnique({ where: { id: payload.uid } })
    .catch(() => null);
  if (!user || !user.isActive || !isValidRole(user.role)) {
    return null;
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

/** Guarda para API routes. `role: "any"` = qualquer logado; "admin" = so admin. */
export async function requireApiUser(
  request: Request,
  role: "any" | UserRole = "any",
): Promise<SessionUser | null> {
  const user = await getRequestUser(request);
  if (!user) {
    return null;
  }
  if (role !== "any" && user.role !== role) {
    return null;
  }
  return user;
}

/**
 * Token explicito da extensao/operador (`API_ACCESS_TOKEN`).
 * Diferente de isAuthorizedByToken: aqui "sem variavel" NAO autoriza —
 * sem token configurado, a via e a sessao de login.
 */
export function hasValidApiToken(request: Request): boolean {
  const token = process.env.API_ACCESS_TOKEN?.trim();
  if (!token) {
    return false;
  }
  const auth = request.headers.get("authorization");
  const provided =
    auth?.replace(/^Bearer\s+/i, "") ?? new URL(request.url).searchParams.get("token");
  return provided === token;
}

/** Token valido OU sessao com o papel exigido. Fecha o legado "aberto sem token". */
export async function isApiAllowed(
  request: Request,
  role: "any" | UserRole = "any",
): Promise<boolean> {
  if (hasValidApiToken(request)) {
    return true;
  }
  return (await requireApiUser(request, role)) !== null;
}

/**
 * Guarda pronta para API routes: retorna `null` se liberado, ou a resposta
 * 401 (nao logado) / 403 (logado sem papel) para retornar direto.
 */
export async function apiGuard(
  request: Request,
  role: "any" | UserRole = "any",
): Promise<NextResponse | null> {
  if (await isApiAllowed(request, role)) {
    return null;
  }
  const logged = await getRequestUser(request);
  if (logged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
