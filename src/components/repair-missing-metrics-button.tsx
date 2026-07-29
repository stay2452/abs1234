"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Wrench } from "lucide-react";

const metrics = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Curtidas" },
  { key: "comments", label: "Comentários" },
  { key: "shares", label: "Compartilhamentos" },
  { key: "favorites", label: "Favoritos" },
] as const;

type Metric = (typeof metrics)[number]["key"];

type StreamEvent =
  | { type: "status"; message: string }
  | {
      type: "progress";
      progress: { profilesTotal: number; profilesFinished: number; repaired: number; unavailable: number; handle?: string };
    }
  | { type: "complete"; result: { profilesTotal: number; targets: number; repaired: number; unavailable: number; errors: Array<{ handle: string; error: string }> } }
  | { type: "error"; error: string };

export function RepairMissingMetricsButton() {
  const [selected, setSelected] = useState<Metric[]>(["views"]);
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(metric: Metric) {
    setSelected((current) =>
      current.includes(metric) ? current.filter((item) => item !== metric) : [...current, metric],
    );
  }

  async function repair() {
    if (selected.length === 0) {
      setError("Selecione ao menos uma métrica.");
      return;
    }
    const labels = metrics.filter((metric) => selected.includes(metric.key)).map((metric) => metric.label);
    if (!window.confirm(`Reparar ${labels.join(", ")} apenas em Reels e vídeos TikTok com valor ausente?\n\nA operação consulta os últimos 5 Reels ou 10 vídeos de cada perfil afetado. Grade não entra. Ela pode consumir créditos Bright Data.`)) {
      return;
    }

    setRunning(true);
    setError(null);
    setMessage("Iniciando reparação seletiva...");
    try {
      const response = await fetch("/api/metrics/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: selected }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao iniciar reparação.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("A reparação não abriu o canal de progresso.");
      const decoder = new TextDecoder();
      let buffer = "";
      let result: Extract<StreamEvent, { type: "complete" }>["result"] | null = null;
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "status") setMessage(event.message);
          if (event.type === "progress") {
            const { profilesFinished, profilesTotal, repaired, unavailable, handle } = event.progress;
            setMessage(`${profilesFinished}/${profilesTotal}: @${handle ?? "perfil"} · ${repaired} reparado(s) · ${unavailable} ainda indisponível(is).`);
          }
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "complete") result = event.result;
        }
        if (chunk.done) break;
      }
      if (!result) throw new Error("A reparação terminou sem resultado.");
      setMessage(`Concluído: ${result.repaired}/${result.targets} vídeo(s) corrigido(s). ${result.unavailable} ainda sem métrica (fora da janela recente ou indisponível).`);
      startTransition(() => window.location.reload());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao reparar métricas.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="panel repair-metrics-panel">
      <div>
        <p className="eyebrow">Reparo seletivo</p>
        <h2>Corrigir métricas ausentes</h2>
        <p className="meta">Busca somente Reels e vídeos TikTok já catalogados com valor nulo. Grade não entra.</p>
      </div>
      <div className="repair-metrics-options" role="group" aria-label="Métricas para reparar">
        {metrics.map((metric) => (
          <label key={metric.key} className="repair-metric-option">
            <input type="checkbox" checked={selected.includes(metric.key)} onChange={() => toggle(metric.key)} disabled={running} />
            {metric.label}
          </label>
        ))}
      </div>
      <button type="button" className="button secondary" onClick={repair} disabled={running || isPending || selected.length === 0}>
        {running ? <RefreshCw size={16} className="spin" /> : <Wrench size={16} />}
        {running ? "Reparando métricas..." : "Reparar métricas ausentes"}
      </button>
      {message ? <p className="message success">{message}</p> : null}
      {error ? <p className="message error">{error}</p> : null}
    </section>
  );
}
