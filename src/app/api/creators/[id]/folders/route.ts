import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard, getRequestUser } from "@/lib/auth";
import { canAccessOwner, isCreatorVisible } from "@/lib/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  folderIds: z.array(z.string().min(1)).min(1).max(100),
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
  const links = await prisma.creatorFolder.findMany({
    where: { creatorId: id },
    include: { folder: true },
  });
  return NextResponse.json({ folders: links.map((l) => l.folder) });
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
  if (!parsed.success) return NextResponse.json({ error: "folderIds 1-100 obrigatórios" }, { status: 400 });

  const { folderIds, action } = parsed.data;

  // So vincula pastas proprias (admin passa). Alheia = 404.
  if (linker && linker.role !== "admin") {
    const targets = await prisma.folder.findMany({
      where: { id: { in: folderIds } },
      select: { id: true, ownerId: true },
    });
    const ownerById = new Map(targets.map((target) => [target.id, target.ownerId]));
    const foreign = folderIds.some((fid) => !canAccessOwner(linker, ownerById.get(fid)));
    if (foreign) {
      return NextResponse.json({ error: "Pasta nao encontrada." }, { status: 404 });
    }
  }

  if (action === "remove") {
    await prisma.creatorFolder.deleteMany({ where: { creatorId: id, folderId: { in: folderIds } } });
    return NextResponse.json({ removed: folderIds.length });
  }

  const data = folderIds.map((fid) => ({ creatorId: id, folderId: fid }));
  await prisma.creatorFolder.createMany({ data, skipDuplicates: true });
  return NextResponse.json({ added: folderIds.length });
}
