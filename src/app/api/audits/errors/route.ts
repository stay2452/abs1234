import { NextResponse } from "next/server";
import { getErrorProfilesFromLastRuns } from "@/lib/audit-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lastRuns = Math.max(1, Math.min(10, parseInt(url.searchParams.get("lastRuns") ?? "5", 10) || 5));
  const platform = url.searchParams.get("platform") ?? "all";

  const { runs, profiles } = await getErrorProfilesFromLastRuns(lastRuns);

  // Filtro opcional por plataforma (instagram/tiktok)
  const filtered = platform === "all" ? profiles : profiles.filter((p) => p.platform === platform);

  return NextResponse.json({
    runs,
    profiles: filtered,
    total: filtered.length,
    lastRuns,
  });
}
