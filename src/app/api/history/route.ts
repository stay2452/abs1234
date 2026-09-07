import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGuard } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Auditoria (inclui creditos): so admin.
  const guard = await apiGuard(request, "admin");
  if (guard) {
    return guard;
  }
  try {
    const { reconcileZombieRuns } = await import("@/lib/scrape-reconcile");
    await reconcileZombieRuns();
  } catch {}
  // Supabase-only: sem fallback local — falha alto se o banco remoto cair.
  const runs = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      profilesTotal: true,
      profilesAttempted: true,
      profilesFinished: true,
      profilesOk: true,
      postsFound: true,
      recordsReceived: true,
      estimatedCredits: true,
    },
  });

  return NextResponse.json({ runs });
}
