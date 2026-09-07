import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard, getRequestUser } from "@/lib/auth";
import { canAccessOwner, isCreatorVisible } from "@/lib/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Leitura: qualquer logado, mas so o proprio vault (admin ve todos).
  const guard = await apiGuard(req);
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  const viewer = await getRequestUser(req);
  const creator = await prisma.creator.findUnique({
    where: { id },
    include: {
      profileLinks: { include: { profile: { select: { id: true, handle: true, platform: true, url: true } } } },
      folderLinks: { include: { folder: true } },
      _count: { select: { vaultEntries: true } },
    },
  });
  if (!creator) return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });
  // Vault alheio responde 404 igual (nao vaza existencia).
  if (!canAccessOwner(viewer, creator.ownerId)) {
    return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ creator });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Escrita no proprio vault: dono ou admin.
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const editor = await getRequestUser(request);
  const { id } = await ctx.params;
  if (!(await isCreatorVisible(editor, id))) {
    return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });
  }
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
  // Escrita no proprio vault: dono ou admin.
  const guard = await apiGuard(req);
  if (guard) {
    return guard;
  }
  const remover = await getRequestUser(req);
  const { id } = await ctx.params;
  if (!(await isCreatorVisible(remover, id))) {
    return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });
  }
  await prisma.creator.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
