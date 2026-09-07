import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGuard } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Detalhe de run (telemetria): so admin.
  const guard = await apiGuard(request, "admin");
  if (guard) {
    return guard;
  }
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
