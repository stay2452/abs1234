import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAuthorizedByToken } from "@/lib/access-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ creatorId: z.string().min(1), mode: z.enum(["errors", "all"]).optional() });

const globalForReset = globalThis as unknown as { vaultResetAtByCreator?: Map<string, number> };

function isResetRateLimited(creatorId: string) {
  const map = (globalForReset.vaultResetAtByCreator ??= new Map());
  const last = map.get(creatorId) ?? 0;
  if (Date.now() - last < 10 * 60 * 1000) return true;
  map.set(creatorId, Date.now());
  return false;
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedByToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "creatorId obrigatório" }, { status: 400 });
  const { creatorId, mode } = parsed.data;
  if (isResetRateLimited(creatorId)) {
    return NextResponse.json({ error: "Reset em cooldown (10 min por creator). Aguarde." }, { status: 429 });
  }
  const where: any =
    mode === "all"
      ? { creatorId, aiStatus: "rejected" }
      : {
          creatorId,
          aiStatus: "rejected",
          OR: [
            { aiMotivo: { contains: "Sem comentários" } },
            { aiMotivo: { contains: "Customer is not active" } },
            { aiMotivo: { contains: "Timeout" } },
            { aiMotivo: null },
          ],
        };
  const res = await prisma.patternVaultEntry.updateMany({
    where,
    data: {
      aiStatus: "pending",
      aiVeredict: null,
      aiMotivo: null,
      aiRealPct: null,
      aiGringoPct: null,
      aiResult: null,
      // Mantém cooldown (não zera) — evita re-trigger imediato que repaga Bright Data
      aiAnalyzedAt: new Date(),
    },
  });
  // também pega os que tem aiStatus rejected mas sem motivo (legado)
  return NextResponse.json({ reset: res.count });
}
