import { Activity, Library, PlayCircle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { RankingPanel } from "@/components/ranking-panel";
import { RepairMissingMetricsButton } from "@/components/repair-missing-metrics-button";
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
      <div className="page-header page-header-dashboard">
        <div className="page-header-copy">
          <p className="eyebrow">Radar do nicho</p>
          <h1>Ranking viral</h1>
          <p className="lede">
            Biblioteca acumulativa: cada atualização puxa os últimos 5 por fonte e só grava o que é
            novo.
          </p>
        </div>
        <div className="page-header-actions">
          <RunScrapeButton mode="library" profileCount={data.profileCount} />
        </div>
      </div>

      <section className="grid three dashboard-metrics" aria-label="Resumo">
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

      <div className="dashboard-main">
        <RankingPanel />
        <aside className="dashboard-aside-stack">
          <RepairMissingMetricsButton />
          <div className="panel dashboard-aside">
          <p className="eyebrow">Última atualização</p>
          <h2 className="dashboard-aside-title">
            {data.lastRun ? formatDate(data.lastRun.startedAt) : "sem coletas"}
          </h2>
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
          <div className="metric-strip dashboard-aside-metrics">
            <div className="mini-metric">
              <span>Perfis</span>
              <strong>{formatNumber(data.lastRun?.profilesOk)}</strong>
            </div>
            <div className="mini-metric">
              <span>Posts</span>
              <strong>{formatNumber(data.lastRun?.postsFound)}</strong>
            </div>
            <div className="mini-metric">
              <span>Registros</span>
              <strong>{formatNumber(data.lastRun?.recordsReceived)}</strong>
            </div>
            <div className="mini-metric">
              <span>Créditos est.</span>
              <strong>{formatNumber(data.lastRun?.estimatedCredits)}</strong>
            </div>
          </div>
            <div className="status dashboard-aside-footer">
              <Activity size={16} />
              <span>Atualização manual</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
