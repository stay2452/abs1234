import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveCollectorSessions } from "@/lib/scrapers/session";
import { shouldScrapeProfile } from "@/lib/scrapers";
import { ESTIMATED_CREDITS_PER_PROFILE, MAX_SCRAPE_ALL_PROFILES } from "@/lib/constants";
import { apiGuard, getRequestUser } from "@/lib/auth";
import { ownerWhere } from "@/lib/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Qualquer logado ou token da extensao/operador.
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const force = url.searchParams.get("force") === "1";
  const profileIdsParam = url.searchParams.get("profileIds");

  let profileIds: string[] | undefined;
  if (scope === "profiles" && profileIdsParam) {
    profileIds = profileIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Estimativa na biblioteca de quem chamou (admin/token ve todos).
  const estimator = await getRequestUser(request);
  const ownership = ownerWhere(estimator);
  const requestedProfiles = await prisma.profile.findMany({
    where: { status: "active", ...ownership, id: profileIds ? { in: profileIds } : undefined },
    select: { lastPostsScrapeAt: true, snapshots: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } } },
  });

  const now = new Date();
  const eligible = requestedProfiles.filter((p: any) => shouldScrapeProfile(p as any, now, force));
  let profilesAttempted = eligible.length;
  let capped = false;
  if (scope === "all" && profilesAttempted > MAX_SCRAPE_ALL_PROFILES) {
    profilesAttempted = MAX_SCRAPE_ALL_PROFILES;
    capped = true;
  }
  const requiredCredits = profilesAttempted * ESTIMATED_CREDITS_PER_PROFILE;
  let sessions: any[] = [];
  try {
    sessions = await getActiveCollectorSessions();
  } catch {}
  const availableCredits = sessions.reduce((sum: number, s: any) => sum + (s.creditsRemaining ?? 0), 0);
  const deficit = Math.max(0, requiredCredits - availableCredits);
  return NextResponse.json({
    scope,
    profilesTotal: requestedProfiles.length,
    profilesAttempted,
    profilesSkipped: requestedProfiles.length - eligible.length,
    capped,
    capLimit: MAX_SCRAPE_ALL_PROFILES,
    requiredCredits,
    availableCredits: Math.round(availableCredits),
    deficit,
    perProfile: ESTIMATED_CREDITS_PER_PROFILE,
    canRun: deficit === 0 && sessions.length > 0,
    sessions: sessions.length,
  });
}
