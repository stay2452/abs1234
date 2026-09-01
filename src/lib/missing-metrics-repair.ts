import type { Profile } from "@prisma/client";
import { SCRAPE_FRESHNESS_WINDOW_MINUTES, SCRAPE_MAX_PARALLEL_KEYS } from "@/lib/constants";
import { prisma, withDbWriteRetry } from "@/lib/db";
import { canonicalizePostUrl } from "@/lib/post-url";
import { scrapeInstagramRecentReelsWithBrightData } from "@/lib/scrapers/brightdata-instagram";
import { scrapeTikTokRecentVideosWithBrightData } from "@/lib/scrapers/brightdata-tiktok";
import { getActiveCollectorSessions, recordCollectorSessionFailure, recordCollectorSessionSuccess } from "@/lib/scrapers/session";
import type { ScrapedPost, ScrapeProfileInput } from "@/lib/scrapers/types";

export const REPAIRABLE_POST_METRICS = ["views", "likes", "comments", "shares", "favorites"] as const;
export type RepairablePostMetric = (typeof REPAIRABLE_POST_METRICS)[number];

type RepairProgress = (event: {
  type: "started" | "profile";
  profilesTotal: number;
  profilesFinished: number;
  repaired: number;
  unavailable: number;
  handle?: string;
}) => void | Promise<void>;

type RepairTarget = {
  id: string;
  profileId: string;
  platform: string;
  url: string;
  sourceType: string;
  profile: Profile;
  snapshot: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
  } | null;
};

function metricIsMissing(target: RepairTarget, metrics: RepairablePostMetric[]) {
  return metrics.some((metric) => target.snapshot?.[metric] == null);
}

function metricWasRepaired(
  target: RepairTarget,
  scraped: ScrapedPost,
  metrics: RepairablePostMetric[],
) {
  return metrics.some(
    (metric) => target.snapshot?.[metric] == null && scraped.metrics[metric] != null,
  );
}

async function repairProfile(
  profile: Profile,
  targets: RepairTarget[],
  metrics: RepairablePostMetric[],
  apiKey: string,
) {
  if (profile.platform !== "instagram" && profile.platform !== "tiktok") {
    throw new Error(`Plataforma nao suportada para reparo: ${profile.platform}`);
  }
  const input: ScrapeProfileInput = {
    id: profile.id,
    platform: profile.platform as ScrapeProfileInput["platform"],
    handle: profile.handle,
    url: profile.url,
  };
  const scraped =
    profile.platform === "instagram"
      ? await scrapeInstagramRecentReelsWithBrightData(input, apiKey)
      : await scrapeTikTokRecentVideosWithBrightData(input, apiKey);

  let repaired = 0;
  const byUrl = new Map(
    scraped.map((post) => [
      canonicalizePostUrl(profile.platform as "instagram" | "tiktok", post.url, post.externalId),
      post,
    ]),
  );

  await withDbWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      for (const target of targets) {
        const fresh = byUrl.get(target.url);
        if (!fresh || !metricWasRepaired(target, fresh, metrics)) {
          continue;
        }

        const previous = target.snapshot;
        const next = {
          views:
            metrics.includes("views") ? fresh.metrics.views ?? previous?.views ?? null : previous?.views ?? null,
          likes:
            metrics.includes("likes") ? fresh.metrics.likes ?? previous?.likes ?? null : previous?.likes ?? null,
          comments:
            metrics.includes("comments")
              ? fresh.metrics.comments ?? previous?.comments ?? null
              : previous?.comments ?? null,
          shares:
            metrics.includes("shares") ? fresh.metrics.shares ?? previous?.shares ?? null : previous?.shares ?? null,
          favorites:
            metrics.includes("favorites")
              ? fresh.metrics.favorites ?? previous?.favorites ?? null
              : previous?.favorites ?? null,
        };
        await tx.postSnapshot.create({ data: { postId: target.id, ...next } });
        repaired += 1;
      }
    }),
  );

  return { repaired, unavailable: targets.length - repaired };
}

/**
 * Repara somente Reels IG e videos TikTok com metricas nulas. Grade fica fora:
 * fotos/carrosseis nao possuem view count publico e nao devem gerar custo.
 * A Bright Data devolve apenas os 5/10 conteudos recentes, portanto videos antigos
 * fora dessa janela permanecem indisponiveis ate terem metrica em coleta futura.
 */
export async function repairMissingPostMetrics(
  metrics: RepairablePostMetric[],
  onProgress?: RepairProgress,
) {
  const selected = [...new Set(metrics)].filter((metric): metric is RepairablePostMetric =>
    REPAIRABLE_POST_METRICS.includes(metric),
  );
  if (selected.length === 0) {
    throw new Error("Selecione ao menos uma metrica para reparar.");
  }

  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { platform: "instagram", sourceType: "reels" },
        { platform: "tiktok", sourceType: "video" },
      ],
      profile: { status: "active" },
    },
    include: {
      profile: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
    take: 500,
    orderBy: { createdAt: "asc" },
  });

  const targets = posts
    .map<RepairTarget>((post) => ({
      id: post.id,
      profileId: post.profileId,
      platform: post.platform,
      url: post.url,
      sourceType: post.sourceType,
      profile: post.profile,
      snapshot: post.snapshots[0] ?? null,
    }))
    .filter((target) => metricIsMissing(target, selected));

  const byProfile = new Map<string, RepairTarget[]>();
  for (const target of targets) {
    const group = byProfile.get(target.profileId) ?? [];
    group.push(target);
    byProfile.set(target.profileId, group);
  }
  // Janela anti-recoleta (auditoria 2026-08-31): pula perfis coletados nos ultimos
  // 30 min — reparar de novo imediatamente duplicaria o custo sem dados novos.
  const now = Date.now();
  const freshnessMs = SCRAPE_FRESHNESS_WINDOW_MINUTES * 60 * 1000;
  let groups = [...byProfile.values()].filter((group) => {
    const last = group[0].profile.lastPostsScrapeAt?.getTime?.() ?? null;
    const lastSnapshot = (group[0].profile as any).snapshots?.[0]?.capturedAt?.getTime?.() ?? null;
    const latestRelevant = Math.max(last ?? 0, lastSnapshot ?? 0);
    return latestRelevant === 0 || now - latestRelevant >= freshnessMs;
  });
  // Teto para não queimar biblioteca inteira em 1 clique (100 perfis × ~5 créd = 500)
  if (groups.length > 100) groups = groups.slice(0, 100);
  await onProgress?.({
    type: "started",
    profilesTotal: groups.length,
    profilesFinished: 0,
    repaired: 0,
    unavailable: 0,
  });

  if (groups.length === 0) {
    return { profilesTotal: 0, profilesFinished: 0, targets: 0, repaired: 0, unavailable: 0, errors: [] };
  }

  const sessions = await getActiveCollectorSessions();
  if (sessions.length === 0) {
    throw new Error("Nenhuma chave com credito disponivel. Atualize saldos em /settings.");
  }

  let cursor = 0;
  let repaired = 0;
  let unavailable = 0;
  let finished = 0;
  const errors: Array<{ handle: string; error: string }> = [];
  const workerCount = Math.min(sessions.length, SCRAPE_MAX_PARALLEL_KEYS, groups.length);

  await Promise.all(
    Array.from({ length: workerCount }, async (_, workerIndex) => {
      const session = sessions[workerIndex];
      while (true) {
        const index = cursor;
        cursor += 1;
        const group = groups[index];
        if (!group) return;
        const profile = group[0].profile;
        try {
          const result = await repairProfile(profile, group, selected, session.apiKey!);
          repaired += result.repaired;
          unavailable += result.unavailable;
          await recordCollectorSessionSuccess(session.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha ao reparar metricas.";
          errors.push({ handle: profile.handle, error: message });
          unavailable += group.length;
          await recordCollectorSessionFailure(session.id, message, false);
        }
        finished += 1;
        await onProgress?.({
          type: "profile",
          profilesTotal: groups.length,
          profilesFinished: finished,
          repaired,
          unavailable,
          handle: profile.handle,
        });
      }
    }),
  );

  return {
    profilesTotal: groups.length,
    profilesFinished: finished,
    targets: targets.length,
    repaired,
    unavailable,
    errors,
  };
}
