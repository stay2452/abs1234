import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(request: NextRequest) {
  // Leitura: qualquer logado.
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const creators = await prisma.creator.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { vaultEntries: true, profileLinks: true, folderLinks: true } },
    },
  });
  return NextResponse.json({ creators });
}

export async function POST(request: NextRequest) {
  // Escrita: so admin.
  const guard = await apiGuard(request, "admin");
  if (guard) {
    return guard;
  }
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nome obrigatório (2-80 chars)" }, { status: 400 });

  const creator = await prisma.creator.create({
    data: { name: parsed.data.name.trim(), notes: parsed.data.notes?.trim() || null },
  });
  return NextResponse.json({ creator }, { status: 201 });
}
