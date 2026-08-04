"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileSearch, RefreshCw, XCircle } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/format";

type Attempt = {
  id: string;
  profileId: string | null;
  platform: string;
  datasetId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  recordsReceived: number;
  recordsKept: number;
  recordsDiscarded: number;
  errorCode: string | null;
  errorMessage: string | null;
  profile: { handle: string } | null;
  session: { name: string } | null;
};

type Run = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  profilesTotal: number;
  profilesAttempted: number;
  profilesFinished: number;
  profilesOk: number;
  postsFound: number;
  recordsReceived: number;
  recordsPersisted: number;
  estimatedCredits: number;
  currentActivity: string | null;
  errorsJson: string | null;
  attempts: Attempt[];
};

function datasetLabel(id: string) {
  const labels: Record<string, string> = {
    gd_l1vikfch901nx3by4: "Instagram perfil",
    gd_lk5ns7kz21pck8jpis: "Instagram Grade",
    gd_lyclm20il4r5helnj: "Instagram Reels",
    gd_l1villgoiiidt09ci: "TikTok perfil",
    gd_m7n5v2gq296pex2f5m: "TikTok vídeos",
  };
  return labels[id] ?? id;
}

export function HistoryDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(value + 4, 88));
    }, 180);

    fetch(`/api/history/${encodeURIComponent(runId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a auditoria.");
        return (await response.json()) as { run: Run };
      })
      .then((payload) => {
        if (!cancelled) {
          setRun(payload.run);
          setProgress(100);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha ao carregar auditoria.");
      })
      .finally(() => window.clearInterval(timer));

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runId]);

  const summary = useMemo(() => {
    if (!run) return null;
    const failed = run.attempts.filter((attempt) => attempt.status === "failed").length;
    const success = run.attempts.length - failed;
    return { failed, success };
  }, [run]);

  if (error) {
    return <main className="page"><div className="empty-state"><p className="message error">{error}</p><Link href="/history">Voltar ao histórico</Link></div></main>;
  }

  if (!run) {
    return (
      <main className="page history-loading">
        <FileSearch size={28} />
        <h1>Carregando auditoria…</h1>
        <p className="meta">Buscando tentativas, datasets e erros desta coleta.</p>
        <div className="audit-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <strong>{progress}%</strong>
      </main>
    );
  }

  return (
    <main className="page history-page">
      <div className="page-header">
        <div>
          <Link className="back-link" href="/history"><ArrowLeft size={15} /> Histórico</Link>
          <p className="eyebrow">Auditoria da coleta</p>
          <h1>{formatDate(run.startedAt)}</h1>
          <p className="lede">Execução {run.id} · {run.currentActivity ?? "Coleta finalizada"}</p>
        </div>
      </div>
      <section className="grid four history-summary">
        <div className="metric-card"><span>Perfis</span><strong>{run.profilesFinished}/{run.profilesTotal}</strong></div>
        <div className="metric-card"><span>Posts encontrados</span><strong>{formatNumber(run.postsFound)}</strong></div>
        <div className="metric-card"><span>Registros</span><strong>{formatNumber(run.recordsReceived)}</strong></div>
        <div className="metric-card"><span>Créditos estimados</span><strong>{formatNumber(run.estimatedCredits)}</strong></div>
      </section>
      <section className="panel history-panel">
        <div className="history-detail-header"><h2>Tentativas por dataset</h2><span className={`history-status ${run.status}`}>{run.status}</span></div>
        <p className="meta"><CheckCircle2 size={14} /> {summary?.success} concluídas · <XCircle size={14} /> {summary?.failed} com falha · {run.attempts.length} registros</p>
        <div className="table-scroll">
          <table className="history-table history-attempts-table">
            <thead><tr><th>Perfil</th><th>Dataset</th><th>Status</th><th>Registros</th><th>Chave</th><th>Erro</th></tr></thead>
            <tbody>{run.attempts.map((attempt) => <tr key={attempt.id}>
              <td>@{attempt.profile?.handle ?? "perfil removido"}</td>
              <td>{datasetLabel(attempt.datasetId)}</td>
              <td><span className={`history-status ${attempt.status}`}>{attempt.status}</span></td>
              <td>{attempt.recordsReceived} recebidos / {attempt.recordsKept} mantidos</td>
              <td>{attempt.session?.name ?? "sem chave"}</td>
              <td className="history-error">{attempt.errorMessage ?? attempt.errorCode ?? "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
