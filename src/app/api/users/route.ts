import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGuard } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista contas (sem hash de senha): so admin. */
export async function GET(request: Request) {
  const guard = await apiGuard(request, "admin");
  if (guard) {
    return guard;
  }
  const users = await prisma.user
    .findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    })
    .catch(() => null);
  if (!users) {
    return NextResponse.json({ error: "Banco indisponivel." }, { status: 500 });
  }
  return NextResponse.json({ users });
}
