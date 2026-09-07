import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard, getRequestUser } from "@/lib/auth";
import { ownerWhere } from "@/lib/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(request: NextRequest) {
  // Vaults pessoais: cada um ve os proprios (admin ve todos).
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const user = await getRequestUser(request);
  const creators = await prisma.creator.findMany({
    where: { ...ownerWhere(user) },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { vaultEntries: true, profileLinks: true, folderLinks: true } },
    },
  });
  return NextResponse.json({ creators });
}

export async function POST(request: NextRequest) {
  // Vaults pessoais: qualquer logado cria o proprio (admin ve todos).
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nome obrigatório (2-80 chars)" }, { status: 400 });

  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const creator = await prisma.creator.create({
    data: { name: parsed.data.name.trim(), notes: parsed.data.notes?.trim() || null, ownerId: user.id },
  });
  return NextResponse.json({ creator }, { status: 201 });
}
