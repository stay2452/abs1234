import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { analyzeOutlier } from "@/lib/research/outlier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  creatorId: z.string().min(1),
  sourcePostId: z.string().min(1),
  pattern: z.string().max(500).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const creatorId = url.searchParams.get("creatorId");
  const isOutlier = url.searchParams.get("isOutlier");
  const take = Math.min(500, parseInt(url.searchParams.get("take") ?? "500", 10) || 500);

  const where: any = {};
  if (creatorId) where.creatorId = creatorId;
  if (isOutlier === "true") where.isOutlier = true;
  if (isOutlier === "false") where.isOutlier = false;

  const entries = await prisma.patternVaultEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: { creator: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const { creatorId, sourcePostId, pattern, tags, notes } = parsed.data;

  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!creator) return NextResponse.json({ error: "Creator não encontrada" }, { status: 404 });

  const exists = await prisma.patternVaultEntry.findUnique({
    where: { sourcePostId_creatorId: { sourcePostId, creatorId } },
  });
  if (exists) return NextResponse.json({ error: "Post já está no Vault desta Creator" }, { status: 409 });

  const analysis = await analyzeOutlier(sourcePostId);
  if (!analysis.isOutlier) {
    return NextResponse.json(
      { error: `Não é outlier (ratio ${analysis.outlierRatio ?? "n/a"} < 2.0) — só winners entram no Vault`, analysis },
      { status: 400 }
    );
  }

  const post = analysis.post as any;
  const profile = analysis.profile as any;
  const snap = post.snapshots?.[0];

  const entry = await prisma.patternVaultEntry.create({
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
      pattern: pattern ?? null,
      tags: tags ?? null,
      notes: notes ?? null,
    },
  });

  return NextResponse.json({ entry, analysis }, { status: 201 });
}
