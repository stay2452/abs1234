import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  normalizeEmail,
  registerSchema,
  sessionCookieHeader,
  signSessionToken,
  hashPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cadastro: primeira conta vira admin ativa; resto entra pendente (isActive=false)
 * e so loga depois que um admin aprovar em /users. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados invalidos." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  if (existing) {
    return NextResponse.json({ error: "Esse email ja tem conta. Faca login." }, { status: 409 });
  }

  let total = 0;
  try {
    total = await prisma.user.count();
  } catch {
    return NextResponse.json({ error: "Banco indisponivel. Tente de novo." }, { status: 500 });
  }

  const isFirst = total === 0;
  const role = isFirst ? "admin" : "user";
  const user = await prisma.user
    .create({
      data: {
        name: parsed.data.name.trim(),
        email,
        passwordHash: hashPassword(parsed.data.password),
        role,
        isActive: isFirst,
      },
    })
    .catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Nao foi possivel criar a conta." }, { status: 500 });
  }

  // Conta pendente: sem login automatico, admin aprova em /users.
  if (!user.isActive) {
    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        pending: true,
        message: "Conta criada. Aguarde a aprovacao do administrador para entrar.",
      },
      { status: 201 },
    );
  }

  let token: string;
  try {
    token = signSessionToken({ id: user.id, role: user.role === "admin" ? "admin" : "user" });
  } catch {
    return NextResponse.json(
      { error: "Conta criada, mas login automatico falhou (SESSION_SECRET?). Faca login." },
      { status: 201 },
    );
  }

  const response = NextResponse.json(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    { status: 201 },
  );
  response.headers.set("Set-Cookie", sessionCookieHeader(token));
  return response;
}
