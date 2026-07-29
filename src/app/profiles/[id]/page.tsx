import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { DeleteProfileButton } from "@/components/delete-profile-button";
import { LineChart } from "@/components/line-chart";
import { ProfileContentTabs, type ProfileContentGroup } from "@/components/profile-content-tabs";
import { ProfileEditor } from "@/components/profile-editor";
import { RunScrapeButton } from "@/components/run-scrape-button";
import { PLATFORM_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, toNumber } from "@/lib/format";
import { cleanInstagramCaption } from "@/lib/instagram-caption";
import { listFolders } from "@/lib/folders";

export const dynamic = "force-dynamic";

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [profile, catalog] = await Promise.all([
    prisma.profile.findUnique({
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
        profileFolders: {
          include: { folder: true },
        },
      },
    }),
    listFolders(),
  ]);

  if (!profile) {
    notFound();
  }

  const profileFolderList = profile.profileFolders
    .map((row) => row.folder)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const latestRun = await prisma.scrapeRun.findFirst({
    where: {
      attempts: {
        some: { profileId: profile.id },
      },
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      errorsJson: true,
    },
  });
  const latestRunErrors = (() => {
    if (!latestRun?.errorsJson) {
      return [] as Array<{ profileId?: string; error?: string }>;
    }

    try {
      const parsed = JSON.parse(latestRun.errorsJson) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is { profileId?: string; error?: string } =>
              typeof item === "object" && item !== null,
          )
        : [];
    } catch {
      return [];
    }
  })();
  const latestRunError = latestRunErrors.find((item) => item.profileId === profile.id)?.error;
  const latestNoDataAttempt = latestRun
    ? await prisma.scrapeAttempt.findFirst({
        where: {
          scrapeRunId: latestRun.id,
          profileId: profile.id,
          status: "no_data",
        },
        select: { id: true },
      })
    : null;
  const latestSnapshot = profile.snapshots.at(-1);
  const isTikTok = profile.platform === "tiktok";
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
  const byPublishedAtDesc = (left: (typeof profile.posts)[number], right: (typeof profile.posts)[number]) => {
    const leftTime = left.publishedAt?.getTime() ?? left.updatedAt.getTime();
    const rightTime = right.publishedAt?.getTime() ?? right.updatedAt.getTime();

    return rightTime - leftTime;
  };
  const tiktokVideos = profile.posts
    .filter((post) => post.sourceType === "video")
    .sort(byPublishedAtDesc);
  // Biblioteca acumulada: mostra TODOS os posts salvos (nao so os 5 da ultima coleta).
  const gridPosts = profile.posts
    .filter((post) => post.sourceType === "grid")
    .sort(byPublishedAtDesc)
    .map(toContentPost);
  const reelsPosts = profile.posts
    .filter((post) => post.sourceType === "reels")
    .sort(byPublishedAtDesc)
    .map(toContentPost);
  const contentGroups: ProfileContentGroup[] =
    profile.platform === "instagram"
      ? [
          {
            key: "grid",
            label: "Grade",
            title: `Biblioteca Grade (${gridPosts.length} item(ns) catalogados)`,
            posts: gridPosts,
          },
          {
            key: "reels",
            label: "Reels",
            title: `Biblioteca Reels (${reelsPosts.length} item(ns) catalogados)`,
            posts: reelsPosts,
          },
        ]
      : [
          {
            key: "video",
            label: "Conteudo",
            title: `Biblioteca de videos (${tiktokVideos.length} catalogados)`,
            posts: tiktokVideos.map(toContentPost),
          },
        ];

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{PLATFORM_LABELS[profile.platform as "instagram" | "tiktok"]}</p>
          <h1>@{profile.handle}</h1>
          <div className="badge-row">
            {profileFolderList.map((folder) => (
              <a
                className={`badge tag-badge tag-${folder.color}`}
                href={`/folders/${folder.id}`}
                key={folder.id}
              >
                {folder.name}
              </a>
            ))}
          </div>
        </div>
        <div className="toolbar">
          <a className="button secondary" href={profile.url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Abrir perfil
          </a>
          <DeleteProfileButton
            id={profile.id}
            handle={profile.handle}
            compact
            redirectTo="/profiles"
          />
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <p className="eyebrow">Coleta individual</p>
        <h2>Atualizar @{profile.handle}</h2>
        <RunScrapeButton
          profileId={profile.id}
          handle={profile.handle}
          platform={profile.platform as "instagram" | "tiktok"}
        />
      </section>

      <section className={`grid ${isTikTok ? "four" : "three"}`}>
        {isTikTok ? (
          <>
            <div className="metric-card">
              <div>
                <p className="label">Seguindo</p>
                <p className="value">{formatNumber(latestSnapshot?.following)}</p>
                <p className="hint">{formatDate(latestSnapshot?.capturedAt)}</p>
              </div>
            </div>
            <div className="metric-card">
              <div>
                <p className="label">Seguidores</p>
                <p className="value">{formatNumber(latestSnapshot?.followers)}</p>
                <p className="hint">{formatDate(latestSnapshot?.capturedAt)}</p>
              </div>
            </div>
            <div className="metric-card">
              <div>
                <p className="label">Curtidas</p>
                <p className="value">{formatNumber(latestSnapshot?.likes)}</p>
                <p className="hint">total do perfil</p>
              </div>
            </div>
            <div className="metric-card">
              <div>
                <p className="label">Videos</p>
                <p className="value">{formatNumber(latestSnapshot?.postsCount)}</p>
                <p className="hint">{tiktokVideos.length} catalogados</p>
              </div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </section>

      {latestRun?.status === "failed" ? (
        <div className="message error" style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 8px" }}>
            Ultima coleta falhou em {formatDate(latestRun.startedAt)}. Nenhum dado{" "}
            <strong>novo</strong> foi gravado.
          </p>
          <p style={{ margin: "0 0 8px" }}>{latestRunError ?? "Erro do provedor."}</p>
          {/page isn.?t available|indisponivel|not_found/i.test(latestRunError ?? "") ? (
            <p style={{ margin: "0 0 8px" }}>
              A Bright Data/Instagram respondeu que a pagina do perfil nao esta disponivel
              (conta apagada, renomeada, privada ou bloqueio temporario do provedor). Confira no
              Instagram:{" "}
              <a href={profile.url} target="_blank" rel="noreferrer">
                {profile.url}
              </a>
            </p>
          ) : null}
          {profile.posts.length > 0 || latestSnapshot ? (
            <p style={{ margin: 0 }}>
              A biblioteca local <strong>nao foi apagada</strong>:{" "}
              {profile.posts.length} post(s) catalogado(s)
              {latestSnapshot?.followers != null
                ? ` · ultimo snapshot de seguidores: ${formatNumber(latestSnapshot.followers)} (${formatDate(latestSnapshot.capturedAt)})`
                : ""}
              .
            </p>
          ) : null}
        </div>
      ) : latestRun?.status === "partial_failed" ? (
        <p className="message" style={{ marginTop: 16 }}>
          Ultima coleta salvou dados parciais em {formatDate(latestRun.startedAt)}.{" "}
          {latestRunError ?? "Uma etapa do provedor nao concluiu."}
          {profile.posts.length > 0
            ? ` Biblioteca local: ${profile.posts.length} post(s) catalogado(s).`
            : ""}
        </p>
      ) : latestNoDataAttempt ? (
        <p className="message" style={{ marginTop: 16 }}>
          Ultima coleta em {formatDate(latestRun?.startedAt)} nao retornou dados uteis. O perfil
          continua elegivel para uma nova atualizacao.
        </p>
      ) : null}

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="panel">
          <p className="eyebrow">Historico</p>
          <h2>Crescimento de seguidores</h2>
          <LineChart points={chartPoints} />
        </section>
        <aside className="panel">
          <p className="eyebrow">Modelagem</p>
          <h2>Pastas e notas</h2>
          <ProfileEditor
            key={profileFolderList.map((folder) => folder.id).join(",")}
            id={profile.id}
            handle={profile.handle}
            folderIds={profileFolderList.map((folder) => folder.id)}
            notes={profile.notes}
            status={profile.status}
            availableFolders={catalog}
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
