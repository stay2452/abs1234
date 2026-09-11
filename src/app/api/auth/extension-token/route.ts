import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loginSchema, normalizeEmail, verifyPassword } from "@/lib/auth";
import { issueApiToken, revokeApiTokenByValue } from "@/lib/api-tokens";
import { optionsCors, withCors } from "@/lib/extension-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anti-forca-bruta proprio (mesma regra do /api/auth/login: 5 tentativas -> 15min).
const failures = new Map<string, { count: number; until: number }>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "ip-desconhecido";
}

function isBlocked(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() > entry.until) {
    failures.delete(key);
    return false;
  }
  return entry.count >= 5;
}

function registerFailure(key: string) {
  const entry = failures.get(key) ?? { count: 0, until: 0 };
  entry.count += 1;
  entry.until = Date.now() + 15 * 60 * 1000;
  failures.set(key, entry);
}

const GENERIC_ERROR = "Email ou senha incorretos.";

export async function OPTIONS(request: Request) {
  return optionsCors(request.headers.get("origin"));
}

/**
 * Login da extensao (SaaS): email+senha -> token pessoal `eoz_...` (texto uma vez).
 * Import/coleta com esse Bearer caem na biblioteca DO DONO, nunca no admin.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const key = clientKey(request);
  if (isBlocked(key)) {
    return withCors(
      NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 }),
      origin,
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(NextResponse.json({ error: GENERIC_ERROR }, { status: 401 }), origin);
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  if (user && !user.isActive) {
    return withCors(
      NextResponse.json({ error: "Conta aguardando aprovacao do administrador." }, { status: 403 }),
      origin,
    );
  }
  const ok = user && verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok || !user) {
    registerFailure(key);
    return withCors(NextResponse.json({ error: GENERIC_ERROR }, { status: 401 }), origin);
  }

  const { token, info } = await issueApiToken(user.id, "Chrome extension");
  return withCors(
    NextResponse.json({
      token,
      prefix: info.prefix,
      name: user.name,
      email: user.email,
    }),
    origin,
  );
}

/** Logout da extensao: revoga o proprio Bearer. */
export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) {
    return withCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin);
  }
  const revoked = await revokeApiTokenByValue(bearer);
  return withCors(NextResponse.json({ revoked }), origin);
}
