import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FolderCompare } from "@/components/folder-compare";
import { RunScrapeButton } from "@/components/run-scrape-button";
import { PLATFORM_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { rankProfiles } from "@/lib/rankings";

export const dynamic = "force-dynamic";

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const folder = await prisma.folder.findUnique({
    where: { id },
    include: {
      profiles: {
        include: {
          profile: {
            include: {
              snapshots: {
                orderBy: { capturedAt: "asc" },
              },
              posts: {
                include: {
                  snapshots: {
                    orderBy: { capturedAt: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!folder) {
    notFound();
  }

  const profiles = folder.profiles.map((row) => row.profile);
  // Só perfis ativos são coletados (o backend filtra status="active").
  // Passar só os ativos mantém rótulo/ETA/custo do botão fiéis ao que será puxado.
  const activeProfileIds = profiles
    .filter((profile) => profile.status === "active")
    .map((profile) => profile.id);
  const growthMap = new Map(
    rankProfiles(profiles, "followers_absolute", "7d", "all").map((item) => [item.id, item]),
  );

  const compareRows = profiles.map((profile) => {
    const latest = profile.snapshots.at(-1);
    const growth = growthMap.get(profile.id);
    let bestPostViews: number | null = null;
    let bestPostUrl: string | null = null;
    let bestPostCaption: string | null = null;

    for (const post of profile.posts) {
      const views = toNumber(post.snapshots[0]?.views);
      if (views != null && (bestPostViews == null || views > bestPostViews)) {
        bestPostViews = views;
        bestPostUrl = post.url;
        bestPostCaption = post.caption;
      }
    }

    return {
      id: profile.id,
      handle: profile.handle,
      platform: profile.platform as "instagram" | "tiktok",
      platformLabel:
        profile.platform === "instagram" || profile.platform === "tiktok"
          ? PLATFORM_LABELS[profile.platform]
          : profile.platform,
      url: profile.url,
      status: profile.status,
      followers: toNumber(latest?.followers),
      following: toNumber(latest?.following),
      postsCount: toNumber(latest?.postsCount) ?? profile.posts.length,
      catalogedPosts: profile.posts.length,
      growthAbsolute: growth?.growthAbsolute ?? null,
      growthPercent: growth?.growthPercent ?? null,
      bestPostViews,
      bestPostUrl,
      bestPostCaption,
      lastCapturedAt: latest?.capturedAt.toISOString() ?? null,
    };
  });

  // Ranking interno da pasta por crescimento absoluto (7d)
  const ranked = [...compareRows].sort(
    (a, b) => (b.growthAbsolute ?? -Infinity) - (a.growthAbsolute ?? -Infinity),
  );

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Pasta</p>
          <h1 className="folder-title-row">
            <span className={`badge tag-badge tag-${folder.color}`}>{folder.name}</span>
          </h1>
          <p className="lede">
            {folder.description?.trim() ||
              "Compare os perfis desta pasta: seguidores, crescimento em 7 dias e melhor post."}
          </p>
          <p className="meta">{compareRows.length} perfil(is) · comparação local (sem Bright Data)</p>
        </div>
        <div className="toolbar">
          <RunScrapeButton
            compact
            mode="folder"
            folderName={folder.name}
            profileIds={activeProfileIds}
            profileCount={activeProfileIds.length}
          />
          <Link className="button secondary" href="/folders">
            <ArrowLeft size={16} />
            Todas as pastas
          </Link>
          <Link className="button secondary" href="/profiles">
            Biblioteca
          </Link>
        </div>
      </div>

      <FolderCompare
        folderId={folder.id}
        folderName={folder.name}
        rows={ranked}
      />
    </main>
  );
}
