"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function CreatorDetailClient({ creator, allProfiles, allFolders, initialVault }: any) {
  const [tracked, setTracked] = useState<any[]>([]);
  const [vault, setVault] = useState<any[]>(initialVault);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);

  const loadTracked = async () => {
    const res = await fetch(`/api/creators/${creator.id}/tracked-profiles`);
    const data = await res.json();
    setTracked(data.profiles ?? []);
  };

  const loadVault = async () => {
    const res = await fetch(`/api/vault?creatorId=${creator.id}`);
    const data = await res.json();
    setVault(data.entries ?? []);
  };

  useEffect(() => {
    loadTracked();
  }, []);

  const addProfiles = async () => {
    if (selectedProfiles.length === 0) return;
    await fetch(`/api/creators/${creator.id}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileIds: selectedProfiles }),
    });
    setSelectedProfiles([]);
    loadTracked();
  };

  const addFolders = async () => {
    if (selectedFolders.length === 0) return;
    await fetch(`/api/creators/${creator.id}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderIds: selectedFolders }),
    });
    setSelectedFolders([]);
    loadTracked();
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
          <button className="button" onClick={addProfiles} style={{ marginTop: 8 }}>
            Adicionar selecionados
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
          <button className="button" onClick={addFolders} style={{ marginTop: 8 }}>
            Associar pastas
          </button>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="history-detail-header">
          <h2>Vault — {vault.length} winners</h2>
          <button className="button secondary" onClick={loadVault}>Atualizar</button>
        </div>
        {vault.length === 0 ? (
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
