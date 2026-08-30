import { NextResponse } from "next/server";
import { reconcileZombieRuns } from "@/lib/scrape-reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reconcile
 * Marca runs RUNNING antigos (>3h) como failed.
 * Usado como cron no Render (a cada 30min) e para limpeza manual.
 * Protegido opcionalmente por CRON_SECRET se definido.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const provided = auth?.replace(/^Bearer\s+/i, "") ?? token;
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const count = await reconcileZombieRuns();
  return NextResponse.json({ reconciled: count, thresholdMs: 3 * 60 * 60 * 1000 });
}

export async function POST(request: Request) {
  return GET(request);
}
