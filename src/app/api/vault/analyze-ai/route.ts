import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { scrapeBrightDataDataset } from "@/lib/scrapers/brightdata-client";
import { classifyComments } from "@/lib/ai/comment-classifier";
import { getActiveCollectorSessions, recordCollectorSessionVaultUse } from "@/lib/scrapers/session";
import { isAuthorizedByToken } from "@/lib/access-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ creatorId: z.string().min(1), limit: z.number().min(1).max(20).optional() });
const COMMENTS_DATASET = "gd_ltppn085pokosxh13";

/**
 * Cooldown antes de re-tentar a MESMA entrada apos erro de provedor.
 * Sem isso, o loop de lotes do client re-disparava o mesmo post infinitamente
 * (mecanismo do acidente de 31/08: 5 contas x 5k creditos consumidas em ~25 min).
 */
const PROVIDER_RETRY_COOLDOWN_MS = 5 * 60 * 1000;

const globalForVaultAI = globalThis as unknown as {
  vaultAiRun?: Promise<unknown>;
};

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedByToken(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (globalForVaultAI.vaultAiRun) {
      return NextResponse.json({ error: "Já existe uma análise IA em andamento." }, { status: 409 });
    }
    const url = new URL(request.url);
    const wantStream = url.searchParams.get("stream") === "1";
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "creatorId obrigatório" }, { status: 400 });

    const { creatorId, limit: bodyLimit } = parsed.data;
    const limit = Math.max(1, Math.min(20, bodyLimit ?? (parseInt(url.searchParams.get("limit") ?? "5", 10) || 5)));

    // Cooldown: so pega pendentes nunca analisados OU cuja ultima tentativa falhou
    // ha mais de PROVIDER_RETRY_COOLDOWN_MS (evita re-trigger imediato da mesma URL).
    const cooldownCutoff = new Date(Date.now() - PROVIDER_RETRY_COOLDOWN_MS);

    let pending: any[] = [];
    try {
      pending = await prisma.patternVaultEntry.findMany({
        where: {
          creatorId,
          aiStatus: "pending",
          OR: [{ aiAnalyzedAt: null }, { aiAnalyzedAt: { lte: cooldownCutoff } }],
        },
        orderBy: { outlierRatio: "desc" },
        take: Math.min(limit, 3),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[vault/analyze-ai] prisma pending failed:", msg);
      if (wantStream) {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const enc = new TextEncoder();
        await writer.write(enc.encode(JSON.stringify({ type: "error", error: `DB falhou: ${msg.slice(0, 200)}` }) + "\n"));
        await writer.close().catch(() => {});
        return new Response(readable, { headers: { "Content-Type": "application/x-ndjson" } });
      }
      return NextResponse.json({ error: `DB falhou: ${msg.slice(0, 300)}` }, { status: 500 });
    }

  // Claim atomico: marca aiStatus=analyzing so nas entradas que AINDA estao pending.
  // Duas abas/duas chamadas concorrentes nunca processam a mesma entrada (sem gasto duplo).
  const candidateIds = pending.map((e: any) => e.id);
  let claimedCount = 0;
  if (candidateIds.length > 0) {
    try {
      const claimed = await prisma.patternVaultEntry.updateMany({
        where: { id: { in: candidateIds }, aiStatus: "pending" },
        data: { aiStatus: "analyzing" },
      });
      claimedCount = claimed.count;
    } catch {}
  }
  if (claimedCount > 0 && candidateIds.length > 0) {
    try {
      pending = await prisma.patternVaultEntry.findMany({
        where: { id: { in: candidateIds }, aiStatus: "analyzing" },
        orderBy: { outlierRatio: "desc" },
      });
    } catch {}
  }

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

  // Tenta env primeiro, depois todas as chaves do pool global (rotação em caso de Customer is not active)
  const brightKeys: string[] = [];
  const envKey = process.env.BRIGHTDATA_API_KEY?.trim() ?? process.env.BRIGHT_DATA_API_KEY?.trim() ?? "";
  if (envKey) brightKeys.push(envKey);
  try {
    const pool = await getActiveCollectorSessions();
    for (const s of pool) {
      const k = s.apiKey?.trim();
      if (k && !brightKeys.includes(k)) brightKeys.push(k);
    }
    if (brightKeys.length > 0) console.log(`[vault/analyze-ai] ${brightKeys.length} chave(s) BrightData disponíveis (pool global)`);
  } catch {}
  const brightKey = brightKeys[0] ?? "";
  if (!brightKey) {
    console.warn("[vault/analyze-ai] sem chave BrightData — cai para heurística sem comentários (todos REPROVADOS)");
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
        let scrapeNote: string | null = null;
        if (!brightKey) {
          scrapeNote = "sem chave BrightData — heurística";
          await writer.write(encoder.encode(JSON.stringify({ type: "progress", current: idx, total: pending.length, handle: entry.sourceHandle, note: scrapeNote }) + "\n"));
        } else {
          // heartbeat para Render/Cloudflare não fechar a conexão (30s timeout)
          let heartbeat: ReturnType<typeof setInterval> | null = null;
          let lastError: string | null = null;
          try {
            heartbeat = setInterval(() => {
              writer.write(encoder.encode(JSON.stringify({ type: "progress", current: idx, total: pending.length, handle: entry.sourceHandle, note: "aguardando BrightData..." }) + "\n")).catch(() => {});
            }, 5000);
            // tenta cada chave do pool até uma funcionar (Customer is not active = tenta próxima)
            let success = false;
            for (let k = 0; k < brightKeys.length; k++) {
              const keyTry = brightKeys[k];
              try {
                const scrapePromise = scrapeBrightDataDataset(COMMENTS_DATASET, { url: entry.sourceUrl }, keyTry, { pollAttempts: 45, pollDelayMs: 2000, query: { limit_per_input: 20 } });
                const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout comentários (90s)")), 90000));
                const result: any = await Promise.race([scrapePromise, timeoutPromise]);
                const got = (result.records as any[])
                  .map((r: any) => (r.comment_text ?? r.comment ?? r.text ?? r.body ?? "") as string)
                  .filter((t) => typeof t === "string" && t.trim().length > 0)
                  .slice(0, 20);
                if (got.length > 0) {
                  comments = got;
                  success = true;
                  if (k > 0) console.log(`[vault/analyze-ai] chave ${k+1}/${brightKeys.length} funcionou para @${entry.sourceHandle}`);
                  // Contabiliza crédito no pool (evita has_credit fantasma)
                  try {
                    const sess = await prisma.collectorSession.findFirst({ where: { apiKey: keyTry }, select: { id: true } });
                    if (sess) await recordCollectorSessionVaultUse(sess.id, got.length);
                  } catch {}
                  break;
                } else {
                  lastError = `BrightData retornou 0 comentários (chave ${k+1})`;
                }
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                lastError = msg.slice(0,120);
                const isCustomerInactive = /customer is not active/i.test(msg);
                const isAuthError = /http 40[13]|authe?ntic|permission/i.test(msg);
                await writer.write(encoder.encode(JSON.stringify({ type: "progress", current: idx, total: pending.length, handle: entry.sourceHandle, note: `chave ${k+1} falhou: ${lastError.slice(0,50)}` }) + "\n"));
                if (isCustomerInactive || isAuthError) {
                  console.warn(`[vault/analyze-ai] chave ${k+1} falhou (${isCustomerInactive ? "conta inativa" : "auth"}) — pausando chave e tentando próxima`);
                  try {
                    await prisma.collectorSession.updateMany({ where: { apiKey: keyTry }, data: { status: "paused", lastError: lastError } });
                  } catch {}
                  brightKeys.splice(k, 1);
                  k--;
                  continue;
                } else {
                  // Timeout/transient/provider: tenta a PRÓXIMA chave (antes: break deixava
                  // só 1 tentativa por entrada — agora roda o pool, limitado pelo claim+cooldown).
                  continue;
                }
              }
            }
            if (!success && comments.length === 0) {
              scrapeNote = lastError ? lastError : `BrightData retornou 0 comentários para ${entry.sourceUrl.slice(0,40)}`;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            scrapeNote = msg.slice(0,120);
            await writer.write(encoder.encode(JSON.stringify({ type: "progress", current: idx, total: pending.length, handle: entry.sourceHandle, note: `sem comentários: ${scrapeNote.slice(0, 80)}` }) + "\n"));
          } finally {
            if (heartbeat) clearInterval(heartbeat);
          }
        }

        try {
          if (comments.length === 0) {
            const motivo = scrapeNote ? `Sem comentários: ${scrapeNote.slice(0,100)}` : "Sem comentários";
            // Erro de provedor (chave morta/timeout/sem chave) NÃO reprova — entrada fica pendente para tentar de novo
            const isProviderError = !brightKey || /customer is not active|timeout|sem chave|http 40[13]|authe?ntic|permission/i.test(scrapeNote ?? "");
            if (isProviderError) {
              console.warn(`[vault/analyze-ai] provedor indisponível para @${entry.sourceHandle} — entrada volta a pendente com cooldown: ${motivo}`);
              // Volta para pending com cooldown (aiAnalyzedAt) — o proximo lote so
              // re-tenta esta entrada depois de PROVIDER_RETRY_COOLDOWN_MS.
              try {
                await prisma.patternVaultEntry.update({
                  where: { id: entry.id },
                  data: { aiStatus: "pending", aiAnalyzedAt: new Date() },
                });
              } catch {}
              await writer.write(encoder.encode(JSON.stringify({ type: "error", handle: entry.sourceHandle, error: `Provedor indisponível — entrada em cooldown (5 min): ${motivo.slice(0, 150)}` }) + "\n"));
              continue;
            }
            await prisma.patternVaultEntry.update({
              where: { id: entry.id },
              data: { aiStatus: "rejected", aiVeredict: "REPROVADO", aiMotivo: motivo, aiRealPct: 0, aiGringoPct: 100, aiAnalyzedAt: new Date(), aiResult: JSON.stringify({ comments: [], note: scrapeNote }) },
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
          // Falha da IA (Gemini): entrada volta a pendente com cooldown — nunca fica presa em "analyzing".
          try {
            await prisma.patternVaultEntry.update({
              where: { id: entry.id },
              data: { aiStatus: "pending", aiAnalyzedAt: new Date() },
            });
          } catch {}
          await writer.write(encoder.encode(JSON.stringify({ type: "error", handle: entry.sourceHandle, error: `IA falhou (entrada em cooldown): ${msg.slice(0, 200)}` }) + "\n"));
        }
      }
      const winners = await prisma.patternVaultEntry.count({ where: { creatorId, aiStatus: "approved" } });
      await writer.write(encoder.encode(JSON.stringify({ type: "complete", total: pending.length, approved, rejected, winners }) + "\n"));
      try { await writer.close(); } catch {}
    };

    const runPromise = run();
    globalForVaultAI.vaultAiRun = runPromise.finally(() => {
      globalForVaultAI.vaultAiRun = undefined;
    });
    void globalForVaultAI.vaultAiRun;
    return new Response(readable, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
  }

  let approved = 0;
  let rejected = 0;
  const runNonStream = async () => {
    for (const entry of pending) {
      try {
        let comments: string[] = [];
        let providerError = false;
        for (let i = 0; i < brightKeys.length; i++) {
          const k = brightKeys[i];
          try {
            const result = await scrapeBrightDataDataset(COMMENTS_DATASET, { url: entry.sourceUrl }, k, { pollAttempts: 45, pollDelayMs: 2000, query: { limit_per_input: 20 } });
            const got = result.records.map((r: any) => (r.comment_text ?? r.comment ?? r.text ?? r.body ?? "") as string).filter(Boolean).slice(0, 20);
            if (got.length > 0) {
              comments = got;
              try {
                const sess = await prisma.collectorSession.findFirst({ where: { apiKey: k }, select: { id: true } });
                if (sess) await recordCollectorSessionVaultUse(sess.id, got.length);
              } catch {}
              break;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Qualquer falha da Bright Data e erro de provedor: sem comentarios reais nao ha como julgar
            providerError = true;
            const isCustomerInactive = /customer is not active/i.test(msg);
            const isAuthError = /http 40[13]|authe?ntic|permission/i.test(msg);
            if (isCustomerInactive || isAuthError) {
              try { await prisma.collectorSession.updateMany({ where: { apiKey: k }, data: { status: "paused", lastError: msg.slice(0, 120) } }); } catch {}
              brightKeys.splice(i, 1);
              i--;
            }
            continue;
          }
        }
        if (comments.length === 0) {
          // falha de provedor (chave morta) ou pool vazio: volta a pendente COM cooldown
          if (providerError || brightKeys.length === 0) {
            try {
              await prisma.patternVaultEntry.update({
                where: { id: entry.id },
                data: { aiStatus: "pending", aiAnalyzedAt: new Date() },
              });
            } catch {}
            continue;
          }
        }
        const ai = await classifyComments(comments);
        await prisma.patternVaultEntry.update({
          where: { id: entry.id },
          data: { aiStatus: ai.veredito === "APROVADO" ? "approved" : "rejected", aiVeredict: ai.veredito, aiRealPct: ai.real_pct, aiGringoPct: ai.gringo_pct, aiMotivo: ai.motivo_curto, aiResult: JSON.stringify(ai), aiAnalyzedAt: new Date() },
        });
        if (ai.veredito === "APROVADO") approved++; else rejected++;
      } catch {
        // Falha inesperada: nunca deixa a entrada presa em "analyzing".
        try {
          await prisma.patternVaultEntry.update({
            where: { id: entry.id },
            data: { aiStatus: "pending", aiAnalyzedAt: new Date() },
          });
        } catch {}
      }
    }
  };
  const nonStreamPromise = runNonStream();
  globalForVaultAI.vaultAiRun = nonStreamPromise.finally(() => {
    globalForVaultAI.vaultAiRun = undefined;
  });
  await nonStreamPromise;
  return NextResponse.json({ total: pending.length, approved, rejected });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[vault/analyze-ai] unhandled:", msg);
    // se cliente pediu stream, devolve NDJSON para não dar 500 opaco
    try {
      const url = new URL(request.url);
      if (url.searchParams.get("stream") === "1") {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const enc = new TextEncoder();
        await writer.write(enc.encode(JSON.stringify({ type: "error", error: msg.slice(0, 300) }) + "\n"));
        await writer.close().catch(() => {});
        return new Response(readable, { headers: { "Content-Type": "application/x-ndjson" } });
      }
    } catch {}
    return NextResponse.json({ error: `Falha interna: ${msg.slice(0, 300)}` }, { status: 500 });
  }
}
