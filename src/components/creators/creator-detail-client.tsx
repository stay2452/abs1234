"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatShortDate, formatExactNumber } from "@/lib/format";

export function CreatorDetailClient({ creator, allProfiles, allFolders, initialVault }: any) {
  const [tracked, setTracked] = useState<any[]>([]);
  const [vault, setVault] = useState<any[]>(initialVault);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultProgress, setVaultProgress] = useState(0);
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"profiles" | "folders" | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadTracked = async () => {
    const res = await fetch(`/api/creators/${creator.id}/tracked-profiles`);
    const data = await res.json();
    setTracked(data.profiles ?? []);
  };

  const refreshVault = async () => {
    const res = await fetch(`/api/vault?creatorId=${creator.id}`);
    const data = await res.json();
    setVault(data.entries ?? []);
  };

  const abortRef = React.useRef<AbortController | null>(null);
  const aiAbortRef = React.useRef<AbortController | null>(null);

  const cancelScan = () => {
    abortRef.current?.abort();
    setVaultLoading(false);
    setVaultProgress(0);
    setVaultMessage("⏹️ Escaneamento cancelado pelo usuário");
  };

  const cancelAI = () => {
    aiAbortRef.current?.abort();
    setAiLoading(false);
    setAiProgress(0);
    setAiMessage("⏹️ Análise IA cancelada");
  };

  const scanPotentials = async () => {
    if (vaultLoading) {
      cancelScan();
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setVaultLoading(true);
    setVaultProgress(0);
    setVaultMessage(`Preparando escaneamento de ${tracked.length} perfis...`);
    try {
      const res = await fetch(`/api/vault/scan?stream=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId: creator.id, limit: 3 }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        let detail = txt.slice(0,300);
        try { const j = JSON.parse(txt); detail = j.error || detail; } catch {}
        throw new Error(detail || "Falha no scan");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let winnersFound = 0;
      let total = tracked.length;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "progress") {
              total = evt.total ?? total;
              winnersFound = evt.winners ?? winnersFound;
              const pct = Math.round((evt.current / evt.total) * 100);
              setVaultProgress(pct);
              setVaultMessage(`Analisando @${evt.handle} (${evt.current}/${evt.total}) — ${evt.scanned ?? 0} posts • ${winnersFound} potenciais`);
            } else if (evt.type === "found") {
              winnersFound = evt.winners ?? winnersFound;
              setVaultMessage(`🎯 Potencial @${evt.handle} ${evt.ratio}x — ${winnersFound} novo(s)`);
            } else if (evt.type === "complete") {
              setVaultProgress(100);
              await refreshVault();
              const vaultRes = await fetch(`/api/vault?creatorId=${creator.id}`);
              const vaultData = await vaultRes.json();
              setVault(vaultData.entries ?? []);
              if (evt.winners > 0) {
                setVaultMessage(`✅ ${evt.winners} novo(s) potencial(is) em ${evt.scanned} posts (${evt.profiles} perfis).`);
              } else {
                setVaultMessage(`Nenhum novo potencial em ${evt.profiles} perfis (${evt.scanned} posts).`);
              }
            } else if (evt.type === "aborted") {
              setVaultMessage("⏹️ Cancelado");
              setVaultProgress(0);
              return;
            } else if (evt.type === "error") {
              throw new Error(evt.error);
            }
          } catch {}
        }
      }
      setTimeout(() => setVaultProgress(0), 1200);
    } catch (e: any) {
      if (e.name === "AbortError") {
        setVaultMessage("⏹️ Cancelado");
        setVaultProgress(0);
      } else {
        setVaultMessage(`❌ ${e.message ?? "Falha ao buscar potenciais"}`);
      }
    } finally {
      setVaultLoading(false);
      abortRef.current = null;
      await refreshVault();
    }
  };

  const analyzeWithAI = async () => {
    if (aiLoading) {
      cancelAI();
      return;
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiLoading(true);
    setAiProgress(0);
    try {
      let totalApproved = 0;
      let totalRejected = 0;
      let batches = 0;
      // loop automático: processa de 3 em 3 até acabar, sem precisar clicar toda hora
      while (!controller.signal.aborted) {
        const pendingNow = vault.filter((v: any) => v.aiStatus === "pending").length;
        // recalcula via fresh vault após cada lote
        const freshRes = await fetch(`/api/vault?creatorId=${creator.id}`, { signal: controller.signal });
        const freshData = await freshRes.json().catch(() => ({ entries: [] }));
        const freshVault = freshData.entries ?? [];
        setVault(freshVault);
        const pendingFresh = freshVault.filter((v: any) => v.aiStatus === "pending").length;
        if (pendingFresh === 0) {
          if (batches === 0) setAiMessage("Nenhum potencial pendente");
          else setAiMessage(`✅ Finalizado: ${totalApproved} aprovado(s), ${totalRejected} reprovado(s) em ${batches} lote(s)`);
          break;
        }
        batches += 1;
        setAiMessage(`Lote ${batches}: analisando 3 de ${pendingFresh} pendentes...`);
        const res = await fetch(`/api/vault/analyze-ai?stream=1&limit=3`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorId: creator.id, limit: 3 }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          let detail = txt.slice(0, 300);
          try { const j = JSON.parse(txt); detail = j.error || detail; } catch {}
          throw new Error(detail || "Falha na IA");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let batchDone = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.type === "progress") {
                const pct = Math.round((evt.current / evt.total) * 100);
                setAiProgress(pct);
                setAiMessage(`Lote ${batches} — IA analisando @${evt.handle} (${evt.current}/${evt.total})`);
              } else if (evt.type === "classified") {
                setAiMessage(`${evt.veredict === "APROVADO" ? "✅" : "❌"} @${evt.handle}: ${evt.veredict} — ${evt.motivo}`);
              } else if (evt.type === "complete") {
                totalApproved += evt.approved ?? 0;
                totalRejected += evt.rejected ?? 0;
                setAiProgress(100);
                batchDone = true;
              } else if (evt.type === "aborted") {
                setAiMessage("⏹️ IA cancelada");
                return;
              } else if (evt.type === "error") {
                throw new Error(evt.error);
              }
            } catch {}
          }
        }
        if (!batchDone) await new Promise((r) => setTimeout(r, 300));
        // atualiza vault para próximo loop
        const afterRes = await fetch(`/api/vault?creatorId=${creator.id}`, { signal: controller.signal });
        const afterData = await afterRes.json().catch(() => ({ entries: [] }));
        setVault(afterData.entries ?? []);
        const stillPending = (afterData.entries ?? []).filter((v: any) => v.aiStatus === "pending").length;
        setAiMessage(`Lote ${batches} OK: ${totalApproved} aprov / ${totalRejected} reprov — faltam ${stillPending}`);
        if (stillPending === 0) {
          setAiMessage(`✅ Finalizado: ${totalApproved} aprovado(s), ${totalRejected} reprovado(s) em ${batches} lote(s)`);
          break;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      setTimeout(() => setAiProgress(0), 1200);
    } catch (e: any) {
      if (e.name === "AbortError") setAiMessage("⏹️ Cancelado");
      else setAiMessage(`❌ ${e.message ?? "Falha IA"}`);
    } finally {
      setAiLoading(false);
      aiAbortRef.current = null;
      await refreshVault();
    }
  };

  useEffect(() => {
    loadTracked();
  }, []);

  const addProfiles = async () => {
    if (selectedProfiles.length === 0) return;
    setActionLoading("profiles");
    setActionMessage(`Adicionando ${selectedProfiles.length} perfil(is)...`);
    await fetch(`/api/creators/${creator.id}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileIds: selectedProfiles }),
    });
    setSelectedProfiles([]);
    await loadTracked();
    setActionMessage(`✅ ${selectedProfiles.length} perfil(is) adicionado(s)`);
    setActionLoading(null);
    setTimeout(() => setActionMessage(null), 3000);
  };

  const addFolders = async () => {
    if (selectedFolders.length === 0) return;
    setActionLoading("folders");
    setActionMessage(`Associando ${selectedFolders.length} pasta(s)...`);
    await fetch(`/api/creators/${creator.id}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderIds: selectedFolders }),
    });
    setSelectedFolders([]);
    await loadTracked();
    setActionMessage(`✅ ${selectedFolders.length} pasta(s) associada(s)`);
    setActionLoading(null);
    setTimeout(() => setActionMessage(null), 3000);
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Vault</p>
          <h1>{creator.name}</h1>
          <p className="lede">Selecione quais perfis e pastas esta Creator trackeia. Biblioteca continua intacta.</p>
        </div>
        <Link className="button secondary" href="/creators">Voltar</Link>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Trackeamento</h2>
        <p className="meta">{tracked.length} perfis trackeados (união de perfis avulsos + pastas)</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {tracked.map((p: any) => (
            <span key={p.id} className="history-status success" style={{ padding: "4px 8px" }}>
              @{p.handle} <small>{p.platform}</small>
            </span>
          ))}
          {tracked.length === 0 && <small className="hint">Nenhum perfil trackeado ainda.</small>}
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <h3>Adicionar Perfis</h3>
          <select multiple value={selectedProfiles} onChange={(e) => setSelectedProfiles(Array.from(e.target.selectedOptions, (o) => o.value))} style={{ width: "100%", height: 200 }}>
            {allProfiles.map((p: any) => (
              <option key={p.id} value={p.id}>
                @{p.handle} ({p.platform})
              </option>
            ))}
          </select>
          <button className="button" onClick={addProfiles} disabled={actionLoading === "profiles" || selectedProfiles.length === 0} style={{ marginTop: 8 }}>
            {actionLoading === "profiles" ? "Adicionando..." : "Adicionar selecionados"}
          </button>
        </section>

        <section className="panel">
          <h3>Associar Pastas</h3>
          <select multiple value={selectedFolders} onChange={(e) => setSelectedFolders(Array.from(e.target.selectedOptions, (o) => o.value))} style={{ width: "100%", height: 200 }}>
            {allFolders.map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button className="button" onClick={addFolders} disabled={actionLoading === "folders" || selectedFolders.length === 0} style={{ marginTop: 8 }}>
            {actionLoading === "folders" ? "Associando..." : "Associar pastas"}
          </button>
        </section>
      </div>
      {actionMessage && <p className={`message ${actionMessage.startsWith("✅") ? "success" : "info"}`} style={{ marginTop: 8 }}>{actionMessage}</p>}

      {(() => {
        const potentials = vault;
        const pending = vault.filter((v: any) => v.aiStatus === "pending" || !v.aiStatus);
        const winners = vault.filter((v: any) => v.aiStatus === "approved");
        const rejected = vault.filter((v: any) => v.aiStatus === "rejected");
        return (
          <>
            <section className="panel" style={{ marginTop: 16 }}>
              <div className="history-detail-header">
                <h2>Potenciais winners — {potentials.length} <small style={{ fontWeight: 400 }}>{pending.length} pendentes</small></h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="button" onClick={scanPotentials} disabled={aiLoading || vaultLoading}>
                    {vaultLoading ? "Cancelar escaneamento" : "Procurar potenciais winner"}
                  </button>
                  {vaultLoading && <span className="meta" style={{ alignSelf: "center" }}>clique em Cancelar para parar</span>}
                </div>
              </div>
              {vaultLoading && (
                <div className="audit-progress" role="progressbar" aria-valuenow={vaultProgress} aria-valuemin={0} aria-valuemax={100} style={{ marginBottom: 12 }}>
                  <span style={{ width: `${vaultProgress}%`, display: "block", height: 6, background: "var(--accent)", borderRadius: 4, transition: "width 0.2s" }} />
                </div>
              )}
              {vaultMessage && <p className={`message ${vaultMessage.startsWith("✅") ? "success" : vaultMessage.startsWith("❌") ? "error" : "info"}`}>{vaultMessage}</p>}
              {vaultLoading ? null : potentials.length === 0 ? (
                <p className="meta">Nenhum potencial. Clique em “Procurar potenciais winner” para escanear os {tracked.length} perfis.</p>
              ) : (
                <div className="table-scroll">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>@</th>
                        <th>Views</th>
                        <th>Baseline 6+6</th>
                        <th>Ratio</th>
                        <th>Comentários/Views</th>
                        <th>Data</th>
                        <th>IA</th>
                        <th>Abrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {potentials.map((v: any) => (
                        <tr key={v.id}>
                          <td>
                            <strong>@{v.sourceHandle}</strong> <small>{v.platform}</small>
                          </td>
                          <td suppressHydrationWarning>{formatExactNumber(v.views)}</td>
                          <td suppressHydrationWarning>{formatExactNumber(v.baselineAvg)}</td>
                          <td>
                            <span className={`history-status ${v.isOutlier ? "success" : ""}`}>{v.outlierRatio?.toFixed(2)}x</span>
                          </td>
                          <td>{v.commentsRatio != null ? `${v.commentsRatio.toFixed(4)}%` : "—"}</td>
                          <td suppressHydrationWarning>{formatShortDate(v.createdAt)}</td>
                          <td>
                            {v.aiStatus === "approved" ? <span className="history-status success">APROVADO</span> : v.aiStatus === "rejected" ? <span className="history-status failed">REPROVADO</span> : <span className="history-status">pendente</span>}
                          </td>
                          <td>
                            <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="button secondary">
                              Abrir
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel" style={{ marginTop: 16 }}>
              <div className="history-detail-header">
                <h2>Winners — {winners.length} <small style={{ fontWeight: 400 }}>({rejected.length} reprovados)</small></h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="button" onClick={analyzeWithAI} disabled={vaultLoading || (!aiLoading && pending.length === 0)} title={aiLoading ? "Clique para cancelar" : "Roda sozinho de 3 em 3 até acabar"}>
                    {aiLoading ? "Cancelar IA" : `Análise com IA (todos ${pending.length})`}
                  </button>
                  {rejected.length > 0 && !aiLoading && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {rejected.some((v: any) => v.aiMotivo?.includes("Sem comentários") || v.aiMotivo?.includes("Customer is not active") || v.aiMotivo?.includes("Timeout")) && (
                        <button
                          className="button secondary"
                          onClick={async () => {
                            const n = rejected.filter((v: any) => v.aiMotivo?.includes("Sem comentários") || v.aiMotivo?.includes("Customer") || v.aiMotivo?.includes("Timeout")).length;
                            if (!confirm(`Resetar ${n} reprovados com erro para tentar de novo?`)) return;
                            const r = await fetch("/api/vault/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorId: creator.id }) });
                            const j = await r.json().catch(() => ({}));
                            await refreshVault();
                            setAiMessage(j.reset ? `🔄 ${j.reset} com erro resetados` : "Nada para resetar");
                            setTimeout(() => setAiMessage(null), 4000);
                          }}
                          title="Volta os Sem comentários / Customer is not active para pendente"
                        >
                          Resetar erros ({rejected.filter((v: any) => v.aiMotivo?.includes("Sem comentários") || v.aiMotivo?.includes("Customer") || v.aiMotivo?.includes("Timeout")).length})
                        </button>
                      )}
                      <button
                        className="button secondary"
                        onClick={async () => {
                          if (!confirm(`Resetar TODOS os ${rejected.length} reprovados para pendente?`)) return;
                          const r = await fetch("/api/vault/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorId: creator.id, mode: "all" }) });
                          const j = await r.json().catch(() => ({}));
                          await refreshVault();
                          setAiMessage(j.reset ? `🔄 ${j.reset} reprovados resetados` : "Nada para resetar");
                          setTimeout(() => setAiMessage(null), 4000);
                        }}
                        title="Volta todos os reprovados para pendente"
                      >
                        Resetar reprovados ({rejected.length})
                      </button>
                    </div>
                  )}
                  {aiLoading && <span className="meta">rodando lote automático — clique em Cancelar para parar</span>}
                </div>
              </div>
              {aiLoading && (
                <div className="audit-progress" role="progressbar" aria-valuenow={aiProgress} aria-valuemin={0} aria-valuemax={100} style={{ marginBottom: 12 }}>
                  <span style={{ width: `${aiProgress}%`, display: "block", height: 6, background: "#f59e0b", borderRadius: 4, transition: "width 0.2s" }} />
                </div>
              )}
              {aiMessage && <p className={`message ${aiMessage.startsWith("✅") ? "success" : aiMessage.startsWith("❌") ? "error" : "info"}`}>{aiMessage}</p>}
              {winners.length === 0 && rejected.length === 0 ? (
                <p className="meta">Nenhum winner ainda. A IA analisará apenas os potenciais acima.</p>
              ) : (
                <>
                  {winners.length > 0 && (
                    <div className="table-scroll" style={{ marginBottom: 16 }}>
                      <h3 style={{ marginBottom: 8 }}>✅ Aprovados pela IA</h3>
                      <table className="history-table">
                        <thead>
                          <tr>
                            <th>@</th>
                            <th>Views</th>
                            <th>Ratio</th>
                            <th>IA</th>
                            <th>Abrir</th>
                          </tr>
                        </thead>
                        <tbody>
                          {winners.map((v: any) => (
                            <tr key={v.id}>
                              <td>
                                <strong>@{v.sourceHandle}</strong>
                              </td>
                              <td suppressHydrationWarning>{formatExactNumber(v.views)}</td>
                              <td>{v.outlierRatio?.toFixed(2)}x</td>
                              <td>
                                <span className="history-status success">{v.aiVeredict}</span> <small>{v.aiMotivo}</small><br />
                                <small>
                                  {v.aiRealPct}% real, {v.aiGringoPct}% gringo
                                </small>
                              </td>
                              <td>
                                <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="button secondary">
                                  Abrir
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {rejected.length > 0 && (
                    <div className="table-scroll">
                      <h3 style={{ marginBottom: 8 }}>❌ Reprovados pela IA</h3>
                      <table className="history-table">
                        <thead>
                          <tr>
                            <th>@</th>
                            <th>Ratio</th>
                            <th>Motivo IA</th>
                            <th>Abrir</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rejected.map((v: any) => (
                            <tr key={v.id}>
                              <td>@{v.sourceHandle}</td>
                              <td>{v.outlierRatio?.toFixed(2)}x</td>
                              <td>
                                <span className="history-status failed">REPROVADO</span> {v.aiMotivo}
                              </td>
                              <td>
                                <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="button secondary">
                                  Abrir
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        );
      })()}
    </main>
  );
}
