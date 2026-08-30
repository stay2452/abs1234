import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { reconcileZombieRuns } = await import("@/lib/scrape-reconcile");
    await reconcileZombieRuns();
  } catch {}
  let runs: any[] = [];
  try {
    runs = await prisma.scrapeRun.findMany({
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("must start with the protocol `postgresql")) {
      try {
        const { listScrapeRunsSqliteFallback } = await import("@/lib/scrape-reconcile");
        runs = (await listScrapeRunsSqliteFallback(100)) as typeof runs;
      } catch {}
    } else {
      throw error;
    }
  }

  return NextResponse.json({ runs });
}
