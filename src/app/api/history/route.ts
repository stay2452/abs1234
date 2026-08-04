import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
