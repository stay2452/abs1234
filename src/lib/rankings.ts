import type { Platform, PostMetric, ProfileMetric, RankingPeriod } from "@/lib/constants";
import { toNumber } from "@/lib/format";

type ProfileSnapshotLike = {
  followers: bigint | number | null;
  capturedAt: Date;
};

export type RankingFolderRef = {
  id: string;
  name: string;
  color: string;
};

type ProfileLike = {
  id: string;
  platform: string;
  handle: string;
  url: string;
  notes: string | null;
  snapshots: ProfileSnapshotLike[];
  folders?: RankingFolderRef[];
};

type PostSnapshotLike = {
  views: bigint | number | null;
  likes: bigint | number | null;
  comments: bigint | number | null;
  shares: bigint | number | null;
  favorites?: bigint | number | null;
  capturedAt: Date;
};

type PostLike = {
  id: string;
  platform: string;
  url: string;
  caption: string | null;
  publishedAt: Date | null;
  profile: {
    id: string;
    handle: string;
    platform: string;
    folders?: RankingFolderRef[];
  };
  snapshots: PostSnapshotLike[];
};

export type ProfileRankingItem = {
  id: string;
  type: "profile";
  platform: string;
  handle: string;
  url: string;
  folders: RankingFolderRef[];
  followers: number | null;
  baselineFollowers: number | null;
  growthAbsolute: number | null;
  growthPercent: number | null;
  capturedAt: string | null;
  score: number | null;
};

export type PostRankingItem = {
  id: string;
  type: "post";
  platform: string;
  url: string;
  caption: string | null;
  publishedAt: string | null;
  profile: {
    id: string;
    handle: string;
    platform: string;
    folders: RankingFolderRef[];
  };
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number | null;
  capturedAt: string | null;
  score: number | null;
};

export function getPeriodCutoff(period: RankingPeriod, now = new Date()) {
  const daysByPeriod: Record<Exclude<RankingPeriod, "all">, number> = {
    "3d": 3,
    "7d": 7,
    "30d": 30,
    "90d": 90,
  };

  if (period === "all") {
    return null;
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - daysByPeriod[period]);
  return cutoff;
}

function sortByCapturedAt<T extends { capturedAt: Date }>(items: T[]) {
  return [...items].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
}

function latestSnapshot<T extends { capturedAt: Date }>(items: T[]) {
  return sortByCapturedAt(items).at(-1) ?? null;
}

/**
 * Periodo de ranking de POSTS usa a data real de publicacao do conteudo.
 * Video fixado antigo (publishedAt em 2025) nao entra em "7d" so porque foi scrapado hoje.
 * Posts sem publishedAt so entram no periodo "all".
 */
export function postMatchesPeriod(
  publishedAt: Date | null | undefined,
  period: RankingPeriod,
  now = new Date(),
) {
  const cutoff = getPeriodCutoff(period, now);
  if (!cutoff) {
    return true;
  }
  if (!publishedAt) {
    return false;
  }
  return publishedAt.getTime() >= cutoff.getTime();
}

export function rankProfiles(
  profiles: ProfileLike[],
  metric: ProfileMetric,
  period: RankingPeriod,
  platform: Platform | "all" = "all",
  now = new Date(),
) {
  // Perfis: o periodo continua sendo a janela de *medicao* (snapshots capturados),
  // porque o score e crescimento de seguidores entre duas coletas — nao data de post.
  const cutoff = getPeriodCutoff(period, now);

  return profiles
    .filter((profile) => platform === "all" || profile.platform === platform)
    .map<ProfileRankingItem>((profile) => {
      const snapshots = sortByCapturedAt(profile.snapshots).filter(
        (snapshot) => snapshot.followers !== null,
      );
      const latest = latestSnapshot(snapshots);
      // Baseline: ultimo snapshot ANTES da janela; se nao houver, o primeiro DENTRO da janela.
      // Assim 2 coletas (mesmo que a primeira seja "antiga") medem crescimento no periodo.
      let baseline: (typeof snapshots)[number] | null = null;
      if (cutoff) {
        const beforeWindow = snapshots.filter((snapshot) => snapshot.capturedAt < cutoff);
        const inWindow = snapshots.filter((snapshot) => snapshot.capturedAt >= cutoff);
        baseline = beforeWindow.at(-1) ?? inWindow[0] ?? null;
      } else {
        baseline = snapshots[0] ?? null;
      }
      const hasComparablePoints =
        latest && baseline && latest.capturedAt.getTime() !== baseline.capturedAt.getTime();
      const followers = toNumber(latest?.followers);
      const baselineFollowers = hasComparablePoints ? toNumber(baseline.followers) : null;
      const growthAbsolute =
        followers !== null && baselineFollowers !== null ? followers - baselineFollowers : null;
      const growthPercent =
        growthAbsolute !== null && baselineFollowers && baselineFollowers > 0
          ? (growthAbsolute / baselineFollowers) * 100
          : null;
      const score = metric === "followers_percent" ? growthPercent : growthAbsolute;

      return {
        id: profile.id,
        type: "profile",
        platform: profile.platform,
        handle: profile.handle,
        url: profile.url,
        folders: profile.folders ?? [],
        followers,
        baselineFollowers,
        growthAbsolute,
        growthPercent,
        capturedAt: latest?.capturedAt.toISOString() ?? null,
        score,
      };
    })
    // So entra no ranking quem tem crescimento calculavel (2+ snapshots).
    .filter((item) => item.score !== null && !Number.isNaN(item.score))
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

export function rankPosts(
  posts: PostLike[],
  metric: PostMetric,
  period: RankingPeriod,
  platform: Platform | "all" = "all",
  now = new Date(),
) {
  return posts
    .filter((post) => platform === "all" || post.platform === platform)
    .filter((post) => postMatchesPeriod(post.publishedAt, period, now))
    .map<PostRankingItem | null>((post) => {
      // Metricas: sempre o snapshot mais recente (o valor atual do post).
      // Periodo ja foi filtrado por publishedAt acima.
      const snapshot = latestSnapshot(post.snapshots);

      if (!snapshot) {
        return null;
      }

      const views = toNumber(snapshot.views);
      const likes = toNumber(snapshot.likes);
      const comments = toNumber(snapshot.comments);
      const shares = toNumber(snapshot.shares);
      const favorites = toNumber(snapshot.favorites);
      const engagementParts = [likes, comments, shares, favorites].filter(
        (value): value is number => value !== null,
      );
      const engagement =
        engagementParts.length > 0
          ? engagementParts.reduce((sum, value) => sum + value, 0)
          : null;
      const score =
        metric === "engagement"
          ? engagement
          : ({
              views,
              likes,
              comments,
              shares,
            } satisfies Record<Exclude<PostMetric, "engagement">, number | null>)[metric];

      return {
        id: post.id,
        type: "post",
        platform: post.platform,
        url: post.url,
        caption: post.caption,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        profile: {
          ...post.profile,
          folders: post.profile.folders ?? [],
        },
        views,
        likes,
        comments,
        shares,
        engagement,
        capturedAt: snapshot.capturedAt.toISOString(),
        score,
      };
    })
    .filter((item): item is PostRankingItem => item !== null)
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}
