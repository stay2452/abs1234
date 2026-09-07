import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  folderIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["add", "remove"]).optional().default("add"),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Leitura: qualquer logado.
  const guard = await apiGuard(req);
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  const links = await prisma.creatorFolder.findMany({
    where: { creatorId: id },
    include: { folder: true },
  });
  return NextResponse.json({ folders: links.map((l) => l.folder) });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Vinculo: so admin.
  const guard = await apiGuard(request, "admin");
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "folderIds 1-100 obrigatórios" }, { status: 400 });

  const { folderIds, action } = parsed.data;

  if (action === "remove") {
    await prisma.creatorFolder.deleteMany({ where: { creatorId: id, folderId: { in: folderIds } } });
    return NextResponse.json({ removed: folderIds.length });
  }

  const data = folderIds.map((fid) => ({ creatorId: id, folderId: fid }));
  await prisma.creatorFolder.createMany({ data, skipDuplicates: true });
  return NextResponse.json({ added: folderIds.length });
}
