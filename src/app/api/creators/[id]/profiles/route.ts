import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  profileIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["add", "remove"]).optional().default("add"),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Leitura: qualquer logado.
  const guard = await apiGuard(req);
  if (guard) {
    return guard;
  }
  const { id } = await ctx.params;
  const links = await prisma.creatorProfile.findMany({
    where: { creatorId: id },
    include: { profile: { select: { id: true, handle: true, platform: true, url: true, status: true } } },
  });
  return NextResponse.json({ profiles: links.map((l) => l.profile) });
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
  if (!parsed.success) return NextResponse.json({ error: "profileIds 1-100 obrigatórios" }, { status: 400 });

  const { profileIds, action } = parsed.data;

  if (action === "remove") {
    await prisma.creatorProfile.deleteMany({ where: { creatorId: id, profileId: { in: profileIds } } });
    return NextResponse.json({ removed: profileIds.length });
  }

  // add — cria ignorando já existentes
  const data = profileIds.map((pid) => ({ creatorId: id, profileId: pid }));
  await prisma.creatorProfile.createMany({ data, skipDuplicates: true });
  return NextResponse.json({ added: profileIds.length });
}
