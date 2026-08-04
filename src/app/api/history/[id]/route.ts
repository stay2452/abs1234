import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const run = await prisma.scrapeRun.findUnique({
    where: { id },
    include: {
      attempts: {
        orderBy: { startedAt: "asc" },
        take: 10_000,
        select: {
          id: true,
          profileId: true,
          sessionId: true,
          platform: true,
          datasetId: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          recordsReceived: true,
          recordsKept: true,
          recordsDiscarded: true,
          errorCode: true,
          errorMessage: true,
          profile: { select: { handle: true } },
          session: { select: { name: true } },
        },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Coleta não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ run });
}
