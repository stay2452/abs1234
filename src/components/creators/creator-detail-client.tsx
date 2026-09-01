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
  const [actionLoading, setActionLoading] = useState<"profiles" | "folders" | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [potSort, setPotSort] = useState<{ key: "views" | "baseline" | "ratio" | "comments" | "date"; dir: "asc" | "desc" }>({ key: "ratio", dir: "desc" });

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

  const cancelScan = () => {
    abortRef.current?.abort();
    setVaultLoading(false);
    setVaultProgress(0);
    setVaultMessage("⏹️ Escaneamento cancelado pelo usuário");
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
              setVaultMessage(`Analisando @${evt.handle} (${evt.current}/${evt.total}) — ${evt.scanned ?? 0} posts • ${winnersFound} winners`);
            } else if (evt.type === "found") {
              winnersFound = evt.winners ?? winnersFound;
              setVaultMessage(`🎯 Winner @${evt.handle} ${evt.ratio}x — ${winnersFound} novo(s)`);
            } else if (evt.type === "complete") {
              setVaultProgress(100);
              await refreshVault();
              const vaultRes = await fetch(`/api/vault?creatorId=${creator.id}`);
              const vaultData = await vaultRes.json();
              setVault(vaultData.entries ?? []);
              if (evt.winners > 0) {
                setVaultMessage(`✅ ${evt.winners} novo(s) winner(s) em ${evt.scanned} posts (${evt.profiles} perfis).`);
              } else {
                setVaultMessage(`Nenhum novo winner em ${evt.profiles} perfis (${evt.scanned} posts).`);
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
        setVaultMessage(`❌ ${e.message ?? "Falha ao buscar winners"}`);
      }
    } finally {
      setVaultLoading(false);
      abortRef.current = null;
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
        const winners = [...vault].sort((a: any, b: any) => {
          const dir = potSort.dir === "asc" ? 1 : -1;
          const get = (v: any) => {
            if (potSort.key === "views") return v.views ?? -1;
            if (potSort.key === "baseline") return v.baselineAvg ?? -1;
            if (potSort.key === "ratio") return v.outlierRatio ?? -1;
            if (potSort.key === "comments") return v.commentsRatio ?? -1;
            if (potSort.key === "date") return new Date(v.createdAt).getTime();
            return 0;
          };
          return (get(a) - get(b)) * dir;
        });
        const toggleSort = (key: typeof potSort.key) => setPotSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
        const arrow = (key: typeof potSort.key) => (potSort.key === key ? (potSort.dir === "asc" ? " ▲" : " ▼") : "");
        return (
          <>
            <section className="panel" style={{ marginTop: 16 }}>
              <div className="history-detail-header">
                <h2>Winners — {winners.length}</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="button" onClick={scanPotentials} disabled={vaultLoading}>
                    {vaultLoading ? "Cancelar escaneamento" : "Procurar winners"}
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
              {vaultLoading ? null : winners.length === 0 ? (
                <p className="meta">Nenhum winner. Clique em “Procurar winners” para escanear os {tracked.length} perfis.</p>
              ) : (
                <div className="table-scroll">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>@</th>
                        <th onClick={() => toggleSort("views")} style={{ cursor: "pointer", userSelect: "none" }}>Views{arrow("views")}</th>
                        <th onClick={() => toggleSort("baseline")} style={{ cursor: "pointer", userSelect: "none" }}>Baseline 6+6{arrow("baseline")}</th>
                        <th onClick={() => toggleSort("ratio")} style={{ cursor: "pointer", userSelect: "none" }}>Ratio{arrow("ratio")}</th>
                        <th onClick={() => toggleSort("comments")} style={{ cursor: "pointer", userSelect: "none" }}>Comentários/Views{arrow("comments")}</th>
                        <th onClick={() => toggleSort("date")} style={{ cursor: "pointer", userSelect: "none" }}>Data{arrow("date")}</th>
                        <th>Abrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {winners.map((v: any) => (
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
          </>
        );
      })()}
    </main>
  );
}
