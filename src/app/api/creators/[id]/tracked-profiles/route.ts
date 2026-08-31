import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const [direct, viaFolders] = await Promise.all([
    prisma.creatorProfile.findMany({
      where: { creatorId: id },
      include: { profile: { select: { id: true, handle: true, platform: true, url: true, status: true } } },
    }),
    prisma.creatorFolder.findMany({
      where: { creatorId: id },
      include: { folder: { include: { profiles: { include: { profile: { select: { id: true, handle: true, platform: true, url: true, status: true } } } } } } },
    }),
  ]);

  const map = new Map<string, any>();
  for (const link of direct) if (link.profile) map.set(link.profile.id, link.profile);
  for (const fl of viaFolders) {
    for (const pf of fl.folder.profiles) {
      if (pf.profile) map.set(pf.profile.id, pf.profile);
    }
  }

  const profiles = Array.from(map.values()).sort((a, b) => a.handle.localeCompare(b.handle));
  return NextResponse.json({ profiles, total: profiles.length });
}
