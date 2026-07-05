import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { LineChart } from "@/components/line-chart";
import { ProfileContentTabs, type ProfileContentGroup } from "@/components/profile-content-tabs";
import { ProfileEditor } from "@/components/profile-editor";
import { RunScrapeButton } from "@/components/run-scrape-button";
import { PLATFORM_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, splitTags, toNumber } from "@/lib/format";
import { cleanInstagramCaption } from "@/lib/instagram-caption";

export const dynamic = "force-dynamic";

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: {
      snapshots: {
        orderBy: { capturedAt: "asc" },
      },
      posts: {
        orderBy: { updatedAt: "desc" },
        include: {
          snapshots: {
            orderBy: { capturedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!profile) {
    notFound();
  }

  const latestSnapshot = profile.snapshots.at(-1);
  const chartPoints = profile.snapshots.map((snapshot) => ({
    label: snapshot.capturedAt.toISOString(),
    value: toNumber(snapshot.followers),
  }));
  const toContentPost = (post: (typeof profile.posts)[number]) => {
    const latest = post.snapshots[0];

    return {
      id: post.id,
      url: post.url,
      caption: profile.platform === "instagram" ? cleanInstagramCaption(post.caption) : post.caption,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      metrics: {
        views: toNumber(latest?.views),
        likes: toNumber(latest?.likes),
        comments: toNumber(latest?.comments),
        shares: toNumber(latest?.shares),
      },
    };
  };
  const contentGroups: ProfileContentGroup[] =
    profile.platform === "instagram"
      ? [
          {
            key: "grid",
            label: "Grade",
            title: "Posts da grade",
            posts: profile.posts.filter((post) => post.sourceType === "grid").slice(0, 5).map(toContentPost),
          },
          {
            key: "reels",
            label: "Reels",
            title: "Posts da aba Reels",
            posts: profile.posts.filter((post) => post.sourceType === "reels").slice(0, 5).map(toContentPost),
          },
        ]
      : [
          {
            key: "video",
            label: "Conteudo",
            title: "Posts recentes",
            posts: profile.posts.map(toContentPost),
          },
        ];

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{PLATFORM_LABELS[profile.platform as "instagram" | "tiktok"]}</p>
          <h1>@{profile.handle}</h1>
          <div className="badge-row">
            {splitTags(profile.tags).map((tag) => (
              <span className="badge" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="toolbar">
          <a className="button secondary" href={profile.url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Abrir perfil
          </a>
          <RunScrapeButton compact />
        </div>
      </div>

      <section className="grid three">
        <div className="metric-card">
          <div>
            <p className="label">Seguidores</p>
            <p className="value">{formatNumber(latestSnapshot?.followers)}</p>
            <p className="hint">{formatDate(latestSnapshot?.capturedAt)}</p>
          </div>
        </div>
        <div className="metric-card">
          <div>
            <p className="label">Seguindo</p>
            <p className="value">{formatNumber(latestSnapshot?.following)}</p>
            <p className="hint">ultimo snapshot</p>
          </div>
        </div>
        <div className="metric-card">
          <div>
            <p className="label">Posts do perfil</p>
            <p className="value">{formatNumber(latestSnapshot?.postsCount)}</p>
            <p className="hint">{profile.posts.length} catalogados</p>
          </div>
        </div>
      </section>

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="panel">
          <p className="eyebrow">Historico</p>
          <h2>Crescimento de seguidores</h2>
          <LineChart points={chartPoints} />
        </section>
        <aside className="panel">
          <p className="eyebrow">Modelagem</p>
          <h2>Tags e notas</h2>
          <ProfileEditor
            id={profile.id}
            tags={profile.tags}
            notes={profile.notes}
            status={profile.status}
          />
        </aside>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <p className="eyebrow">Conteudo</p>
        <h2>Colecoes capturadas</h2>
        <ProfileContentTabs groups={contentGroups} />
      </section>
    </main>
  );
}
