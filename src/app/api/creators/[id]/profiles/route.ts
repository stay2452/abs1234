import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard, getRequestUser } from "@/lib/auth";
import { canAccessOwner, isCreatorVisible } from "@/lib/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  profileIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["add", "remove"]).optional().default("add"),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Leitura: qualquer logado, mas so o proprio vault.
  const guard = await apiGuard(req);
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  if (!(await isCreatorVisible(await getRequestUser(req), id))) {
    return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });
  }
  const links = await prisma.creatorProfile.findMany({
    where: { creatorId: id },
    include: { profile: { select: { id: true, handle: true, platform: true, url: true, status: true } } },
  });
  return NextResponse.json({ profiles: links.map((l) => l.profile) });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Vinculo no proprio vault: dono ou admin.
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  const linker = await getRequestUser(request);
  if (!(await isCreatorVisible(linker, id))) {
    return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "profileIds 1-100 obrigatórios" }, { status: 400 });

  const { profileIds, action } = parsed.data;

  // So vincula perfis proprios (admin passa). Alheio = 404.
  if (linker && linker.role !== "admin") {
    const targets = await prisma.profile.findMany({
      where: { id: { in: profileIds } },
      select: { id: true, ownerId: true },
    });
    const ownerById = new Map(targets.map((target) => [target.id, target.ownerId]));
    const foreign = profileIds.some((pid) => !canAccessOwner(linker, ownerById.get(pid)));
    if (foreign) {
      return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 404 });
    }
  }

  if (action === "remove") {
    await prisma.creatorProfile.deleteMany({ where: { creatorId: id, profileId: { in: profileIds } } });
    return NextResponse.json({ removed: profileIds.length });
  }

  // add — cria ignorando já existentes
  const data = profileIds.map((pid) => ({ creatorId: id, profileId: pid }));
  await prisma.creatorProfile.createMany({ data, skipDuplicates: true });
  return NextResponse.json({ added: profileIds.length });
}
