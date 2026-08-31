"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

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

  const loadTracked = async () => {
    const res = await fetch(`/api/creators/${creator.id}/tracked-profiles`);
    const data = await res.json();
    setTracked(data.profiles ?? []);
  };

  const abortRef = React.useRef<AbortController | null>(null);

  const cancelScan = () => {
    abortRef.current?.abort();
    setVaultLoading(false);
    setVaultProgress(0);
    setVaultMessage("⏹️ Escaneamento cancelado pelo usuário");
  };

  const loadVault = async () => {
    // Se já está carregando, cancela
    if (vaultLoading) {
      cancelScan();
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setVaultLoading(true);
    setVaultProgress(10);
    setVaultMessage(`Escaneando ${tracked.length} perfis trackeados em busca de winners 6×6... (pode levar até 30s para 51 perfis)`);
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      timer = setInterval(() => setVaultProgress((p) => Math.min(p + 8, 90)), 400);
      const scanRes = await fetch(`/api/vault/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId: creator.id }),
        signal: controller.signal,
      });
      if (!scanRes.ok && scanRes.status !== 499) {
        const err = await scanRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha no scan");
      }
      const scanData = await scanRes.json().catch(() => ({}));
      if (timer) clearInterval(timer);
      if (scanData.aborted) {
        setVaultMessage("⏹️ Cancelado");
        return;
      }
      setVaultProgress(90);
      const res = await fetch(`/api/vault?creatorId=${creator.id}`, { signal: controller.signal });
      const data = await res.json();
      setVaultProgress(100);
      setVault(data.entries ?? []);
      if (scanData.winners > 0) {
        setVaultMessage(`✅ ${scanData.winners} novo(s) winner(s) em ${scanData.scanned} posts (${scanData.profiles} perfis). Total: ${data.entries?.length ?? 0}`);
      } else if (scanData.scanned > 0) {
        setVaultMessage(`Nenhum novo winner nos ${scanData.profiles} perfis (${scanData.scanned} posts). Total: ${data.entries?.length ?? 0}`);
      } else {
        setVaultMessage(data.entries?.length ? `✅ ${data.entries.length} winner(s) no vault` : null);
      }
      setTimeout(() => setVaultProgress(0), 1200);
    } catch (e: any) {
      if (e.name === "AbortError") {
        setVaultMessage("⏹️ Cancelado");
      } else {
        setVaultMessage(`❌ ${e.message ?? "Falha ao atualizar Vault"}`);
      }
    } finally {
      if (timer) clearInterval(timer);
      setVaultLoading(false);
      abortRef.current = null;
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

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="history-detail-header">
          <h2>Vault — {vault.length} winners</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button secondary" onClick={loadVault}>
              {vaultLoading ? "Cancelar" : "Atualizar"}
            </button>
          </div>
        </div>
        {vaultLoading && (
          <div className="audit-progress" role="progressbar" aria-valuenow={vaultProgress} aria-valuemin={0} aria-valuemax={100} style={{ marginBottom: 12 }}>
            <span style={{ width: `${vaultProgress}%`, display: "block", height: 6, background: "var(--accent)", borderRadius: 4, transition: "width 0.2s" }} />
          </div>
        )}
        {vaultMessage && <p className={`message ${vaultMessage.startsWith("✅") ? "success" : vaultMessage.startsWith("❌") ? "error" : "info"}`}>{vaultMessage}</p>}
        {vaultLoading ? null : vault.length === 0 ? (
          <p className="meta">Vault vazio. Vá na Biblioteca, clique em “Analisar outlier” em um reel e salve aqui.</p>
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
                  <th>Abrir</th>
                </tr>
              </thead>
              <tbody>
                {vault.map((v: any) => (
                  <tr key={v.id}>
                    <td>
                      <strong>@{v.sourceHandle}</strong> <small>{v.platform}</small>
                    </td>
                    <td>{v.views?.toLocaleString("pt-BR")}</td>
                    <td>{v.baselineAvg?.toLocaleString("pt-BR")}</td>
                    <td>
                      <span className={`history-status ${v.isOutlier ? "success" : ""}`}>{v.outlierRatio?.toFixed(2)}x</span>
                    </td>
                    <td>{v.commentsRatio != null ? `${v.commentsRatio.toFixed(4)}%` : "—"}</td>
                    <td>{new Date(v.createdAt).toLocaleDateString("pt-BR")}</td>
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
    </main>
  );
}
