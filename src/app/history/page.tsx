import Link from "next/link";
import { FileSearch } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { formatDurationSeconds } from "@/lib/scrape-eta";

export const dynamic = "force-dynamic";

function duration(startedAt: Date, finishedAt: Date | null) {
  if (!finishedAt) return "em andamento";
  return formatDurationSeconds((finishedAt.getTime() - startedAt.getTime()) / 1000);
}

export default async function HistoryPage() {
  const runs = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return (
    <main className="page history-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Auditoria</p>
          <h1>Histórico de Coletas</h1>
          <p className="lede">
            Últimas 100 execuções do scraper e reparador. Acompanhe sucessos, falhas e métricas por varredura.
          </p>
        </div>
      </div>

      <section className="panel history-panel">
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Data e início</th>
                <th>Status</th>
                <th>Progresso / perfis</th>
                <th>Posts novos</th>
                <th>Recebidos</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <strong>{formatDate(run.startedAt)}</strong>
                    <small>Duração: {duration(run.startedAt, run.finishedAt)}</small>
                  </td>
                  <td><span className={`history-status ${run.status}`}>{run.status}</span></td>
                  <td>
                    <strong>{run.profilesFinished} / {run.profilesTotal} finalizados</strong>
                    <small>{run.profilesOk} sucesso, {Math.max(0, run.profilesFinished - run.profilesOk)} com erro</small>
                  </td>
                  <td className="history-number">{formatNumber(run.postsFound)}</td>
                  <td>{formatNumber(run.recordsReceived)}</td>
                  <td>
                    <Link className="button secondary history-audit-link" href={`/history/${run.id}`}>
                      <FileSearch size={15} /> Auditoria
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 ? <div className="empty-state">Nenhuma coleta registrada.</div> : null}
        </div>
      </section>
    </main>
  );
}
