import { NextRequest, NextResponse } from "next/server";
import { optionsCors, withCors } from "@/lib/extension-cors";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return optionsCors(request.headers.get("origin"));
}

/** Health check para a extensão (app local online). */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const [profiles, keys] = await Promise.all([
      prisma.profile.count(),
      prisma.collectorSession.count({
        where: { status: "active", kind: "api", apiKey: { not: null } },
      }),
    ]);
    return withCors(
      NextResponse.json({
        ok: true,
        app: "biblioteca-perfis",
        profiles,
        activeKeys: keys,
      }),
      origin,
    );
  } catch {
    return withCors(
      NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 }),
      origin,
    );
  }
}
