import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Leitura: qualquer logado.
  const guard = await apiGuard(req);
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  const creator = await prisma.creator.findUnique({
    where: { id },
    include: {
      profileLinks: { include: { profile: { select: { id: true, handle: true, platform: true, url: true } } } },
      folderLinks: { include: { folder: true } },
      _count: { select: { vaultEntries: true } },
    },
  });
  if (!creator) return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });
  return NextResponse.json({ creator });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Escrita: so admin.
  const guard = await apiGuard(request, "admin");
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const updated = await prisma.creator.update({
    where: { id },
    data: {
      name: parsed.data.name?.trim(),
      notes: parsed.data.notes !== undefined ? parsed.data.notes?.trim() || null : undefined,
    },
  });
  return NextResponse.json({ creator: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Escrita: so admin.
  const guard = await apiGuard(req, "admin");
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  await prisma.creator.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
