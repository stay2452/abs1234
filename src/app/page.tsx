import { Activity, Library, PlayCircle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { RankingPanel } from "@/components/ranking-panel";
import { RunScrapeButton } from "@/components/run-scrape-button";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, formatSigned } from "@/lib/format";
import { rankProfiles } from "@/lib/rankings";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [profileCount, postCount, lastRun, profiles] = await Promise.all([
    prisma.profile.count(),
    prisma.post.count(),
    prisma.scrapeRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.profile.findMany({
      where: { status: "active" },
      include: {
        snapshots: {
          orderBy: { capturedAt: "asc" },
        },
      },
    }),
  ]);
  const topGrowth =
    rankProfiles(profiles, "followers_absolute", "7d", "all").find(
      (item) => item.growthAbsolute !== null,
    ) ?? null;

  return {
    profileCount,
    postCount,
    lastRun,
    topGrowth,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Radar do nicho</p>
          <h1>Ranking viral</h1>
          <p className="lede">Perfis e posts monitorados no seu nicho.</p>
        </div>
        <RunScrapeButton />
      </div>

      <section className="grid three" aria-label="Resumo">
        <div className="metric-card">
          <div>
            <p className="label">Perfis</p>
            <p className="value">{formatNumber(data.profileCount)}</p>
            <p className="hint">catalogados</p>
          </div>
          <span className="icon-box">
            <Library size={20} />
          </span>
        </div>
        <div className="metric-card">
          <div>
            <p className="label">Posts</p>
            <p className="value">{formatNumber(data.postCount)}</p>
            <p className="hint">com snapshots</p>
          </div>
          <span className="icon-box">
            <PlayCircle size={20} />
          </span>
        </div>
        <div className="metric-card">
          <div>
            <p className="label">Maior crescimento</p>
            <p className="value">{formatSigned(data.topGrowth?.growthAbsolute)}</p>
            <p className="hint">
              {data.topGrowth ? (
                <Link href={`/profiles/${data.topGrowth.id}`}>@{data.topGrowth.handle}</Link>
              ) : (
                "sem histórico"
              )}
            </p>
          </div>
          <span className="icon-box">
            <TrendingUp size={20} />
          </span>
        </div>
      </section>

      <div className="grid two" style={{ marginTop: 16 }}>
        <RankingPanel />
        <aside className="panel">
          <p className="eyebrow">Última atualização</p>
          <h2>{data.lastRun ? formatDate(data.lastRun.startedAt) : "sem coletas"}</h2>
          <div className="status">
            <span
              className={`status-dot ${
                data.lastRun?.status === "success"
                  ? "success"
                  : data.lastRun?.status === "failed"
                    ? "error"
                    : "warning"
              }`}
            />
            {data.lastRun?.status ?? "aguardando"}
          </div>
          <div className="metric-strip" style={{ marginTop: 16 }}>
            <div className="mini-metric">
              <span>Perfis</span>
              <strong>{formatNumber(data.lastRun?.profilesOk)}</strong>
            </div>
            <div className="mini-metric">
              <span>Posts</span>
              <strong>{formatNumber(data.lastRun?.postsFound)}</strong>
            </div>
          </div>
          <div className="status" style={{ marginTop: 18 }}>
            <Activity size={16} />
            <span>Atualização manual</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
