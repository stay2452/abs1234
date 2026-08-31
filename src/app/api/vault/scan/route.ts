import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { analyzeOutlier } from "@/lib/research/outlier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ creatorId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const wantStream = url.searchParams.get("stream") === "1";
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "creatorId obrigatório" }, { status: 400 });

  const { creatorId } = parsed.data;

  if (wantStream) {
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    const runScan = async () => {
      try {
        const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
        if (!creator) {
          await writer.write(encoder.encode(JSON.stringify({ type: "error", error: "Creator não encontrada" }) + "\n"));
          await writer.close();
          return;
        }
        const [direct, viaFolders] = await Promise.all([
          prisma.creatorProfile.findMany({ where: { creatorId }, select: { profileId: true } }),
          prisma.creatorFolder.findMany({ where: { creatorId }, include: { folder: { include: { profiles: { select: { profileId: true } } } } } }),
        ]);
        const profileIds = new Set<string>();
        direct.forEach((r) => profileIds.add(r.profileId));
        viaFolders.forEach((f) => f.folder.profiles.forEach((p) => profileIds.add(p.profileId)));
        const ids = Array.from(profileIds);
        if (ids.length === 0) {
          await writer.write(encoder.encode(JSON.stringify({ type: "complete", scanned: 0, winners: 0, already: 0, profiles: 0, totalEntries: 0 }) + "\n"));
          await writer.close();
          return;
        }
        let scanned = 0;
        let winners = 0;
        let already = 0;
        for (let pi = 0; pi < ids.length; pi++) {
          if (request.signal.aborted) {
            await writer.write(encoder.encode(JSON.stringify({ type: "aborted", scanned, winners, already, profiles: ids.length }) + "\n"));
            break;
          }
          const profileId = ids[pi];
          const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true, handle: true } });
          if (!profile) {
            await writer.write(encoder.encode(JSON.stringify({ type: "progress", current: pi + 1, total: ids.length, handle: "desconhecido", scanned, winners }) + "\n"));
            continue;
          }
          await writer.write(encoder.encode(JSON.stringify({ type: "progress", current: pi + 1, total: ids.length, handle: profile.handle, scanned, winners }) + "\n"));
          const posts = await prisma.post.findMany({
            where: { profileId },
            orderBy: { publishedAt: "asc" },
            select: { id: true, platform: true, url: true, caption: true, publishedAt: true, snapshots: { orderBy: { capturedAt: "desc" }, take: 1, select: { views: true, likes: true, comments: true, shares: true } } },
          });
          const withViews = posts.filter((p) => p.publishedAt && p.snapshots[0]?.views != null);
          for (let idx = 0; idx < withViews.length; idx++) {
            if (request.signal.aborted) break;
            scanned += 1;
            const post = withViews[idx] as any;
            const candidateViews = Number(post.snapshots[0].views);
            const candidateComments = post.snapshots[0].comments != null ? Number(post.snapshots[0].comments) : null;
            const before = withViews.slice(Math.max(0, idx - 6), idx);
            const after = withViews.slice(idx + 1, idx + 7);
            const neighbors = [...before, ...after];
            const neighborViews = neighbors.map((n: any) => Number(n.snapshots[0].views)).filter((v: number) => Number.isFinite(v));
            if (neighborViews.length < 4) continue;
            const baselineAvg = neighborViews.reduce((a: number, b: number) => a + b, 0) / neighborViews.length;
            if (!baselineAvg || baselineAvg <= 0) continue;
            const outlierRatio = candidateViews / baselineAvg;
            if (outlierRatio < 2.0) continue;
            const commentsRatio = candidateComments != null && candidateViews > 0 ? (candidateComments / candidateViews) * 100 : null;
            try {
              await prisma.patternVaultEntry.create({
                data: {
                  creatorId,
                  sourceProfileId: profileId,
                  sourcePostId: post.id,
                  platform: post.platform,
                  sourceHandle: profile.handle,
                  sourceUrl: post.url,
                  publishedAt: post.publishedAt,
                  views: candidateViews,
                  likes: post.snapshots[0].likes != null ? Number(post.snapshots[0].likes) : null,
                  comments: candidateComments,
                  shares: post.snapshots[0].shares != null ? Number(post.snapshots[0].shares) : null,
                  caption: post.caption,
                  baselineAvg: Math.round(baselineAvg),
                  outlierRatio: Math.round(outlierRatio * 100) / 100,
                  isOutlier: true,
                  commentsRatio: commentsRatio != null ? Math.round(commentsRatio * 10000) / 10000 : null,
                },
              });
              winners += 1;
              await writer.write(encoder.encode(JSON.stringify({ type: "found", handle: profile.handle, url: post.url, ratio: Math.round(outlierRatio * 100) / 100, winners }) + "\n"));
            } catch (e: any) {
              if (e.code === "P2002") already += 1;
            }
          }
        }
        const totalEntries = await prisma.patternVaultEntry.count({ where: { creatorId } });
        await writer.write(encoder.encode(JSON.stringify({ type: "complete", scanned, winners, already, profiles: ids.length, totalEntries }) + "\n"));
      } catch (e) {
        await writer.write(encoder.encode(JSON.stringify({ type: "error", error: e instanceof Error ? e.message : String(e) }) + "\n"));
      } finally {
        try { await writer.close(); } catch {}
      }
    };

    // dispara sem await, retorna stream imediatamente
    void runScan();
    return new Response(readable, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
  }

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

  // Otimizado: 1 query por perfil + cálculo em memória (evita 2k queries)
  for (const profileId of ids) {
    if (request.signal.aborted) break;

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, handle: true },
    });
    if (!profile) continue;

    const posts = await prisma.post.findMany({
      where: { profileId },
      orderBy: { publishedAt: "asc" },
      select: {
        id: true,
        platform: true,
        url: true,
        caption: true,
        publishedAt: true,
        snapshots: { orderBy: { capturedAt: "desc" }, take: 1, select: { views: true, likes: true, comments: true, shares: true } },
      },
    });

    // Só posts com data e views
    const withViews = posts.filter((p) => p.publishedAt && p.snapshots[0]?.views != null);

    for (let idx = 0; idx < withViews.length; idx++) {
      if (request.signal.aborted) break;
      scanned += 1;
      const post = withViews[idx] as any;
      const candidateViews = Number(post.snapshots[0].views);
      const candidateComments = post.snapshots[0].comments != null ? Number(post.snapshots[0].comments) : null;

      const before = withViews.slice(Math.max(0, idx - 6), idx);
      const after = withViews.slice(idx + 1, idx + 7);
      const neighbors = [...before, ...after];
      const neighborViews = neighbors.map((n: any) => Number(n.snapshots[0].views)).filter((v: number) => Number.isFinite(v));
      if (neighborViews.length < 4) continue; // precisa mínimo de vizinhos

      const baselineAvg = neighborViews.reduce((a: number, b: number) => a + b, 0) / neighborViews.length;
      if (!baselineAvg || baselineAvg <= 0) continue;
      const outlierRatio = candidateViews / baselineAvg;
      if (outlierRatio < 2.0) continue;

      const commentsRatio = candidateComments != null && candidateViews > 0 ? (candidateComments / candidateViews) * 100 : null;

      try {
        await prisma.patternVaultEntry.create({
          data: {
            creatorId,
            sourceProfileId: profileId,
            sourcePostId: post.id,
            platform: post.platform,
            sourceHandle: profile.handle,
            sourceUrl: post.url,
            publishedAt: post.publishedAt,
            views: candidateViews,
            likes: post.snapshots[0].likes != null ? Number(post.snapshots[0].likes) : null,
            comments: candidateComments,
            shares: post.snapshots[0].shares != null ? Number(post.snapshots[0].shares) : null,
            caption: post.caption,
            baselineAvg: Math.round(baselineAvg),
            outlierRatio: Math.round(outlierRatio * 100) / 100,
            isOutlier: true,
            commentsRatio: commentsRatio != null ? Math.round(commentsRatio * 10000) / 10000 : null,
          },
        });
        winners += 1;
      } catch (e: any) {
        if (e.code === "P2002") already += 1;
        else throw e;
      }
    }
  }

  if (request.signal.aborted) {
    return NextResponse.json({ scanned, winners, already, profiles: ids.length, totalEntries: await prisma.patternVaultEntry.count({ where: { creatorId } }), aborted: true }, { status: 499 });
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
