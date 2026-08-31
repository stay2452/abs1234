import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ creatorId: z.string().min(1), mode: z.enum(["errors", "all"]).optional() });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "creatorId obrigatório" }, { status: 400 });
  const { creatorId, mode } = parsed.data;
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
      aiAnalyzedAt: null,
    },
  });
  // também pega os que tem aiStatus rejected mas sem motivo (legado)
  return NextResponse.json({ reset: res.count });
}
