import { NextRequest, NextResponse } from "next/server";
import {
  PLATFORMS,
  POST_METRICS,
  PROFILE_METRICS,
  RANKING_PERIODS,
  type Platform,
  type PostMetric,
  type ProfileMetric,
  type RankingPeriod,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { rankPosts, rankProfiles } from "@/lib/rankings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickValue<T extends readonly string[]>(value: string | null, allowed: T, fallback: T[number]) {
  return allowed.includes(value ?? "") ? (value as T[number]) : fallback;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type") === "profiles" ? "profiles" : "posts";
  const platformParam = searchParams.get("platform");
  const platform =
    platformParam && PLATFORMS.includes(platformParam as Platform)
      ? (platformParam as Platform)
      : "all";
  const period = pickValue(searchParams.get("period"), RANKING_PERIODS, "7d") as RankingPeriod;
  const limit = Math.min(Number(searchParams.get("limit") ?? 25) || 25, 100);

  if (type === "profiles") {
    const metric = pickValue(
      searchParams.get("metric"),
      PROFILE_METRICS,
      "followers_absolute",
    ) as ProfileMetric;
    const profiles = await prisma.profile.findMany({
      where: { status: "active" },
      include: {
        snapshots: {
          orderBy: { capturedAt: "asc" },
        },
      },
    });

    return NextResponse.json({
      type,
      metric,
      period,
      platform,
      items: rankProfiles(profiles, metric, period, platform).slice(0, limit),
    });
  }

  const metric = pickValue(searchParams.get("metric"), POST_METRICS, "views") as PostMetric;
  const posts = await prisma.post.findMany({
    include: {
      profile: true,
      snapshots: {
        orderBy: { capturedAt: "asc" },
      },
    },
  });

  return NextResponse.json({
    type,
    metric,
    period,
    platform,
    items: rankPosts(posts, metric, period, platform).slice(0, limit),
  });
}
