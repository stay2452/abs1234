import { prisma } from "@/lib/db";

/**
 * 6-before / 6-after baseline (OFM Vault Pro Ch.5)
 * Candidate 130K vs média 12 vizinhos (6 antes + 6 depois) = 50K → 2.6x OUTLIER
 * Só entra no Vault se outlierRatio >= 2.0
 */
export type OutlierResult = {
  candidateViews: number | null;
  baselineAvg: number | null;
  outlierRatio: number | null;
  isOutlier: boolean;
  commentsRatio: number | null; // comments/views*100
  neighborsCount: number;
  sampleWarning: string | null;
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function analyzeOutlier(postId: string): Promise<OutlierResult & { post: any; profile: any }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      profile: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });

  if (!post) throw new Error("Post não encontrado");
  if (!post.publishedAt) {
    return {
      candidateViews: null,
      baselineAvg: null,
      outlierRatio: null,
      isOutlier: false,
      commentsRatio: null,
      neighborsCount: 0,
      sampleWarning: "Post sem data de publicação — não dá para calcular vizinhos",
      post,
      profile: post.profile,
    };
  }

  const candidateSnap = post.snapshots[0];
  const candidateViews = candidateSnap?.views != null ? Number(candidateSnap.views) : null;
  const candidateComments = candidateSnap?.comments != null ? Number(candidateSnap.comments) : null;
  const commentsRatio = candidateViews && candidateViews > 0 && candidateComments != null ? (candidateComments / candidateViews) * 100 : null;

  // Busca todos os posts do mesmo perfil ordenados por publishedAt
  const allPosts = await prisma.post.findMany({
    where: { profileId: post.profileId },
    orderBy: { publishedAt: "asc" },
    select: {
      id: true,
      publishedAt: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1, select: { views: true } },
    },
  });

  const idx = allPosts.findIndex((p) => p.id === postId);
  if (idx === -1) throw new Error("Post não encontrado na lista do perfil");

  const before = allPosts.slice(Math.max(0, idx - 6), idx);
  const after = allPosts.slice(idx + 1, idx + 7);
  const neighbors = [...before, ...after];

  const neighborViews = neighbors
    .map((p) => p.snapshots[0]?.views)
    .filter((v): v is number => v != null)
    .map(Number)
    .filter((v) => Number.isFinite(v));

  const baselineAvg = avg(neighborViews);
  const outlierRatio = baselineAvg && baselineAvg > 0 && candidateViews != null ? candidateViews / baselineAvg : null;
  const isOutlier = outlierRatio != null ? outlierRatio >= 2.0 : false;

  const sampleWarning = neighbors.length < 12 ? `Amostra curta: ${neighbors.length}/12 vizinhos (perfil com poucos posts)` : null;

  return {
    candidateViews,
    baselineAvg: baselineAvg != null ? Math.round(baselineAvg) : null,
    outlierRatio: outlierRatio != null ? Math.round(outlierRatio * 100) / 100 : null,
    isOutlier,
    commentsRatio: commentsRatio != null ? Math.round(commentsRatio * 10000) / 10000 : null,
    neighborsCount: neighbors.length,
    sampleWarning,
    post,
    profile: post.profile,
  };
}
