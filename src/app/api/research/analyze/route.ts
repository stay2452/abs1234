import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeOutlier } from "@/lib/research/outlier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ postId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "postId obrigatório" }, { status: 400 });

  try {
    const result = await analyzeOutlier(parsed.data.postId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao analisar" }, { status: 404 });
  }
}
