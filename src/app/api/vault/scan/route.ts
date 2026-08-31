import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { analyzeOutlier } from "@/lib/research/outlier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ creatorId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "creatorId obrigatório" }, { status: 400 });

  const { creatorId } = parsed.data;

  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!creator) return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });

  // Perfis trackeados = união de CreatorProfile + pastas
  const [direct, viaFolders] = await Promise.all([
    prisma.creatorProfile.findMany({ where: { creatorId }, select: { profileId: true } }),
    prisma.creatorFolder.findMany({
      where: { creatorId },
      include: { folder: { include: { profiles: { select: { profileId: true } } } } },
    }),
  ]);

  const profileIds = new Set<string>();
  direct.forEach((r) => profileIds.add(r.profileId));
  viaFolders.forEach((f) => f.folder.profiles.forEach((p) => profileIds.add(p.profileId)));

  const ids = Array.from(profileIds);
  if (ids.length === 0) return NextResponse.json({ scanned: 0, winners: 0, already: 0, profiles: 0, message: "Nenhum perfil trackeado" });

  let scanned = 0;
  let winners = 0;
  let already = 0;

  for (const profileId of ids) {
    const posts = await prisma.post.findMany({
      where: { profileId },
      select: { id: true },
    });

    for (const { id: postId } of posts) {
      scanned += 1;
      try {
        const analysis = await analyzeOutlier(postId);
        if (!analysis.isOutlier) continue;

        const post = analysis.post as any;
        const profile = analysis.profile as any;
        const snap = post.snapshots?.[0];

        // tenta criar, ignora se já existe
        try {
          await prisma.patternVaultEntry.create({
            data: {
              creatorId,
              sourceProfileId: profile.id,
              sourcePostId: post.id,
              platform: post.platform,
              sourceHandle: profile.handle,
              sourceUrl: post.url,
              publishedAt: post.publishedAt,
              views: snap?.views != null ? Number(snap.views) : null,
              likes: snap?.likes != null ? Number(snap.likes) : null,
              comments: snap?.comments != null ? Number(snap.comments) : null,
              shares: snap?.shares != null ? Number(snap.shares) : null,
              caption: post.caption,
              baselineAvg: analysis.baselineAvg,
              outlierRatio: analysis.outlierRatio,
              isOutlier: true,
              commentsRatio: analysis.commentsRatio,
            },
          });
          winners += 1;
        } catch (e: any) {
          if (e.code === "P2002") already += 1;
          else throw e;
        }
      } catch {
        // ignora posts sem data ou erro isolado
      }
    }
  }

  const totalEntries = await prisma.patternVaultEntry.count({ where: { creatorId } });

  return NextResponse.json({
    scanned,
    winners,
    already,
    profiles: ids.length,
    totalEntries,
  });
}
