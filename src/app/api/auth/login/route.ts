import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  loginSchema,
  normalizeEmail,
  sessionCookieHeader,
  signSessionToken,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trava simples anti-forca-bruta em memoria (zera ao reiniciar).
// V1 suficiente para comecar; endurecer depois com rate-limit persistente.
const failures = new Map<string, { count: number; until: number }>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "ip-desconhecido";
  return ip;
}

function isBlocked(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) {
    return false;
  }
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

export async function POST(request: Request) {
  const key = `${clientKey(request)}`;
  if (isBlocked(key)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 15 minutos." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  const ok = user && user.isActive && verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    registerFailure(key);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  let token: string;
  try {
    token = signSessionToken({ id: user.id, role: user.role === "admin" ? "admin" : "user" });
  } catch {
    return NextResponse.json({ error: "Login indisponivel (SESSION_SECRET?)." }, { status: 500 });
  }

  const response = NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  response.headers.set("Set-Cookie", sessionCookieHeader(token));
  return response;
}
