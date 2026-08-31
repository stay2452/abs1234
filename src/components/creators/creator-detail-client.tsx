"use client";

import { useEffect, useState } from "react";
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

  const loadVault = async () => {
    setVaultLoading(true);
    setVaultProgress(20);
    setVaultMessage("Buscando winners no Supabase...");
    try {
      const timer = setInterval(() => setVaultProgress((p) => Math.min(p + 15, 85)), 200);
      const res = await fetch(`/api/vault?creatorId=${creator.id}`);
      const data = await res.json();
      clearInterval(timer);
      setVaultProgress(100);
      setVault(data.entries ?? []);
      setVaultMessage(data.entries?.length ? `✅ ${data.entries.length} winner(s) carregado(s)` : "Vault ainda vazio — salve o primeiro outlier da Biblioteca");
      setTimeout(() => setVaultProgress(0), 800);
    } catch {
      setVaultMessage("❌ Falha ao atualizar Vault");
    } finally {
      setVaultLoading(false);
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
          <button className="button secondary" onClick={loadVault} disabled={vaultLoading}>
            {vaultLoading ? "Atualizando..." : "Atualizar"}
          </button>
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
