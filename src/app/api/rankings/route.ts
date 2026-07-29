import { Prisma } from "@prisma/client";
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
import { getPeriodCutoff, rankPosts, rankProfiles } from "@/lib/rankings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileSnapshotRow = {
  id: string;
  platform: string;
  handle: string;
  url: string;
  notes: string | null;
  followers: number;
  capturedAt: Date;
};

type PostSnapshotRow = {
  id: string;
  platform: string;
  url: string;
  caption: string | null;
  publishedAt: Date | null;
  profileId: string;
  profileHandle: string;
  profilePlatform: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  capturedAt: Date;
};

function pickValue<T extends readonly string[]>(value: string | null, allowed: T, fallback: T[number]) {
  return allowed.includes(value ?? "") ? (value as T[number]) : fallback;
}

function pickLimit(value: string | null) {
  const parsed = Number(value ?? 25);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 100) : 25;
}

async function getProfilesForRanking(
  platform: Platform | "all",
  cutoff: Date | null,
  folderId: string | null,
) {
  const conditions = [Prisma.sql`p."status" = 'active'`, Prisma.sql`ps."followers" IS NOT NULL`];
  if (platform !== "all") {
    conditions.push(Prisma.sql`p."platform" = ${platform}`);
  }
  if (cutoff) {
    conditions.push(Prisma.sql`ps."capturedAt" >= ${cutoff}`);
  }
  if (folderId) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "ProfileFolder" pf WHERE pf."profileId" = p."id" AND pf."folderId" = ${folderId})`,
    );
  }

  const rows = await prisma.$queryRaw<ProfileSnapshotRow[]>(Prisma.sql`
    WITH ranked_snapshots AS (
      SELECT
        p."id",
        p."platform",
        p."handle",
        p."url",
        p."notes",
        ps."followers",
        ps."capturedAt",
        ROW_NUMBER() OVER (PARTITION BY p."id" ORDER BY ps."capturedAt" ASC) AS "firstRank",
        ROW_NUMBER() OVER (PARTITION BY p."id" ORDER BY ps."capturedAt" DESC) AS "lastRank"
      FROM "Profile" p
      JOIN "ProfileSnapshot" ps ON ps."profileId" = p."id"
      WHERE ${Prisma.join(conditions, " AND ")}
    )
    SELECT "id", "platform", "handle", "url", "notes", "followers", "capturedAt"
    FROM ranked_snapshots
    WHERE "firstRank" = 1 OR "lastRank" = 1
  `);
  const profiles = new Map<
    string,
    {
      id: string;
      platform: string;
      handle: string;
      url: string;
      notes: string | null;
      snapshots: Array<{ followers: number; capturedAt: Date }>;
    }
  >();

  for (const row of rows) {
    const profile = profiles.get(row.id) ?? {
      id: row.id,
      platform: row.platform,
      handle: row.handle,
      url: row.url,
      notes: row.notes,
      snapshots: [],
    };
    profile.snapshots.push({ followers: row.followers, capturedAt: new Date(row.capturedAt) });
    profiles.set(row.id, profile);
  }

  return [...profiles.values()];
}

type FolderRef = { id: string; name: string; color: string };

async function getFoldersByProfileIds(profileIds: string[]) {
  const map = new Map<string, FolderRef[]>();
  if (profileIds.length === 0) {
    return map;
  }

  const rows = await prisma.profileFolder.findMany({
    where: { profileId: { in: profileIds } },
    include: {
      folder: { select: { id: true, name: true, color: true } },
    },
  });

  for (const row of rows) {
    const list = map.get(row.profileId) ?? [];
    list.push({
      id: row.folder.id,
      name: row.folder.name,
      color: row.folder.color,
    });
    map.set(row.profileId, list);
  }

  for (const [id, list] of map) {
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    map.set(id, list);
  }

  return map;
}

async function getPostsForRanking(
  platform: Platform | "all",
  cutoff: Date | null,
  folderId: string | null,
) {
  // Periodo do ranking de posts = data REAL de publicacao (publishedAt),
  // nao a data em que o scrape salvou o snapshot (capturedAt).
  // Metricas usam o snapshot mais recente do post.
  const conditions = [Prisma.sql`p."status" = 'active'`];
  if (platform !== "all") {
    conditions.push(Prisma.sql`post."platform" = ${platform}`);
  }
  if (cutoff) {
    conditions.push(Prisma.sql`post."publishedAt" IS NOT NULL`);
    conditions.push(Prisma.sql`post."publishedAt" >= ${cutoff}`);
  }
  if (folderId) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "ProfileFolder" pf WHERE pf."profileId" = p."id" AND pf."folderId" = ${folderId})`,
    );
  }

  const rows = await prisma.$queryRaw<PostSnapshotRow[]>(Prisma.sql`
    WITH ranked_snapshots AS (
      SELECT
        post."id",
        post."platform",
        post."url",
        post."caption",
        post."publishedAt",
        p."id" AS "profileId",
        p."handle" AS "profileHandle",
        p."platform" AS "profilePlatform",
        ps."views",
        ps."likes",
        ps."comments",
        ps."shares",
        ps."favorites",
        ps."capturedAt",
        ROW_NUMBER() OVER (PARTITION BY post."id" ORDER BY ps."capturedAt" DESC) AS "snapshotRank"
      FROM "Post" post
      JOIN "Profile" p ON p."id" = post."profileId"
      JOIN "PostSnapshot" ps ON ps."postId" = post."id"
      WHERE ${Prisma.join(conditions, " AND ")}
    )
    SELECT
      "id", "platform", "url", "caption", "publishedAt", "profileId", "profileHandle",
      "profilePlatform", "views", "likes", "comments", "shares", "favorites", "capturedAt"
    FROM ranked_snapshots
    WHERE "snapshotRank" = 1
  `);

  return rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    url: row.url,
    caption: row.caption,
    publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
    profile: {
      id: row.profileId,
      handle: row.profileHandle,
      platform: row.profilePlatform,
    },
    snapshots: [
      {
        views: row.views,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        favorites: row.favorites,
        capturedAt: new Date(row.capturedAt),
      },
    ],
  }));
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
  const limit = pickLimit(searchParams.get("limit"));
  const folderIdRaw = searchParams.get("folderId")?.trim() || null;
  const folderId = folderIdRaw && folderIdRaw !== "all" ? folderIdRaw : null;
  const now = new Date();
  const cutoff = getPeriodCutoff(period, now);

  if (type === "profiles") {
    const metric = pickValue(
      searchParams.get("metric"),
      PROFILE_METRICS,
      "followers_absolute",
    ) as ProfileMetric;
    const profiles = await getProfilesForRanking(platform, cutoff, folderId);
    const folderMap = await getFoldersByProfileIds(profiles.map((profile) => profile.id));
    const profilesWithFolders = profiles.map((profile) => ({
      ...profile,
      folders: folderMap.get(profile.id) ?? [],
    }));

    return NextResponse.json({
      type,
      metric,
      period,
      platform,
      folderId,
      items: rankProfiles(profilesWithFolders, metric, period, platform, now).slice(0, limit),
    });
  }

  const metric = pickValue(searchParams.get("metric"), POST_METRICS, "views") as PostMetric;
  const posts = await getPostsForRanking(platform, cutoff, folderId);
  const folderMap = await getFoldersByProfileIds(
    [...new Set(posts.map((post) => post.profile.id))],
  );
  const postsWithFolders = posts.map((post) => ({
    ...post,
    profile: {
      ...post.profile,
      folders: folderMap.get(post.profile.id) ?? [],
    },
  }));

  return NextResponse.json({
    type,
    metric,
    period,
    platform,
    folderId,
    items: rankPosts(postsWithFolders, metric, period, platform, now).slice(0, limit),
  });
}
