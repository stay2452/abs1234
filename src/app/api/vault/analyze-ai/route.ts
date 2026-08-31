import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { scrapeBrightDataDataset } from "@/lib/scrapers/brightdata-client";
import { classifyComments } from "@/lib/ai/comment-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ creatorId: z.string().min(1), limit: z.number().min(1).max(20).optional() });
const COMMENTS_DATASET = "gd_ltppn085pokosxh13";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const wantStream = url.searchParams.get("stream") === "1";
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "creatorId obrigatório" }, { status: 400 });

  const { creatorId, limit: bodyLimit } = parsed.data;
  const limit = Math.max(1, Math.min(20, bodyLimit ?? (parseInt(url.searchParams.get("limit") ?? "5", 10) || 5)));

  const pending = await prisma.patternVaultEntry.findMany({
    where: { creatorId, aiStatus: "pending" },
    orderBy: { outlierRatio: "desc" },
    take: Math.min(limit, 3),
  });

  if (pending.length === 0) {
    if (wantStream) {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();
      const enc = new TextEncoder();
      writer.write(enc.encode(JSON.stringify({ type: "complete", total: 0, approved: 0, rejected: 0 }) + "\n"));
      writer.close();
      return new Response(readable, { headers: { "Content-Type": "application/x-ndjson" } });
    }
    return NextResponse.json({ total: 0, approved: 0, rejected: 0, message: "Nenhum potencial pendente" });
  }

  const brightKey = process.env.BRIGHTDATA_API_KEY?.trim() ?? process.env.BRIGHT_DATA_API_KEY?.trim();
  if (!brightKey) {
    return NextResponse.json({ error: "BRIGHTDATA_API_KEY não configurada" }, { status: 500 });
  }

  if (wantStream) {
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    const run = async () => {
      let approved = 0;
      let rejected = 0;
      let idx = 0;
      for (const entry of pending) {
        if (request.signal.aborted) {
          await writer.write(encoder.encode(JSON.stringify({ type: "aborted", approved, rejected, total: pending.length }) + "\n"));
          break;
        }
        idx++;
        await writer.write(encoder.encode(JSON.stringify({ type: "progress", current: idx, total: pending.length, handle: entry.sourceHandle, url: entry.sourceUrl }) + "\n"));

        let comments: string[] = [];
        try {
          const scrapePromise = scrapeBrightDataDataset(COMMENTS_DATASET, { url: entry.sourceUrl }, brightKey, { pollAttempts: 10, pollDelayMs: 1500 });
          const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout comentários (15s)")), 15000));
          const result: any = await Promise.race([scrapePromise, timeoutPromise]);
          comments = (result.records as any[])
            .map((r: any) => (r.comment_text ?? r.text ?? r.comment ?? r.body ?? "") as string)
            .filter((t) => typeof t === "string" && t.trim().length > 0)
            .slice(0, 20);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await writer.write(encoder.encode(JSON.stringify({ type: "progress", current: idx, total: pending.length, handle: entry.sourceHandle, note: `sem comentários: ${msg.slice(0, 60)}` }) + "\n"));
        }

        try {
          if (comments.length === 0) {
            await prisma.patternVaultEntry.update({
              where: { id: entry.id },
              data: { aiStatus: "rejected", aiVeredict: "REPROVADO", aiMotivo: "Sem comentários", aiRealPct: 0, aiGringoPct: 100, aiAnalyzedAt: new Date(), aiResult: JSON.stringify({ comments: [] }) },
            });
            rejected++;
            await writer.write(encoder.encode(JSON.stringify({ type: "classified", handle: entry.sourceHandle, veredict: "REPROVADO", motivo: "Sem comentários" }) + "\n"));
            continue;
          }

          const ai = await classifyComments(comments);

          await prisma.patternVaultEntry.update({
            where: { id: entry.id },
            data: {
              aiStatus: ai.veredito === "APROVADO" ? "approved" : "rejected",
              aiVeredict: ai.veredito,
              aiRealPct: ai.real_pct,
              aiGringoPct: ai.gringo_pct,
              aiMotivo: ai.motivo_curto,
              aiResult: JSON.stringify(ai),
              aiAnalyzedAt: new Date(),
            },
          });

          if (ai.veredito === "APROVADO") approved++;
          else rejected++;

          await writer.write(encoder.encode(JSON.stringify({ type: "classified", handle: entry.sourceHandle, veredict: ai.veredito, motivo: ai.motivo_curto, real_pct: ai.real_pct, gringo_pct: ai.gringo_pct }) + "\n"));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await writer.write(encoder.encode(JSON.stringify({ type: "error", handle: entry.sourceHandle, error: msg.slice(0, 200) }) + "\n"));
        }
      }
      const winners = await prisma.patternVaultEntry.count({ where: { creatorId, aiStatus: "approved" } });
      await writer.write(encoder.encode(JSON.stringify({ type: "complete", total: pending.length, approved, rejected, winners }) + "\n"));
      try { await writer.close(); } catch {}
    };

    void run();
    return new Response(readable, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
  }

  let approved = 0;
  let rejected = 0;
  for (const entry of pending) {
    try {
      const result = await scrapeBrightDataDataset(COMMENTS_DATASET, { url: entry.sourceUrl }, brightKey, { pollAttempts: 10, pollDelayMs: 1500 });
      const comments: string[] = result.records.map((r: any) => (r.comment_text ?? r.text ?? "") as string).filter(Boolean).slice(0, 20);
      const ai = await classifyComments(comments);
      await prisma.patternVaultEntry.update({
        where: { id: entry.id },
        data: { aiStatus: ai.veredito === "APROVADO" ? "approved" : "rejected", aiVeredict: ai.veredito, aiRealPct: ai.real_pct, aiGringoPct: ai.gringo_pct, aiMotivo: ai.motivo_curto, aiResult: JSON.stringify(ai), aiAnalyzedAt: new Date() },
      });
      if (ai.veredito === "APROVADO") approved++; else rejected++;
    } catch {}
  }
  return NextResponse.json({ total: pending.length, approved, rejected });
}
