"use client";

import { useState } from "react";

export function OutlierModal({ postId, onClose, creators }: { postId: string; onClose: () => void; creators: Array<{ id: string; name: string }> }) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState(creators[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/research/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    });
    const data = await res.json();
    setAnalysis(data);
    setLoading(false);
    if (!res.ok) setMessage(data.error ?? "Erro");
  };

  const save = async () => {
    if (!selectedCreator) return;
    setSaving(true);
    const res = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId: selectedCreator, sourcePostId: postId }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setMessage("✅ Salvo no Vault!");
    } else {
      setMessage(data.error ?? "Falha ao salvar");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div className="panel" style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2>Analisar outlier — 6-before / 6-after</h2>
        <p className="meta">Calcula se é 2x a média dos 12 vizinhos. Só winner entra no Vault.</p>

        {!analysis && (
          <button className="button" onClick={analyze} disabled={loading}>
            {loading ? "Analisando..." : "Calcular"}
          </button>
        )}

        {analysis && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div className="metric-card" style={{ flex: 1 }}>
                <p className="label">Views candidato</p>
                <p className="value">{analysis.candidateViews?.toLocaleString("pt-BR") ?? "—"}</p>
              </div>
              <div className="metric-card" style={{ flex: 1 }}>
                <p className="label">Baseline 6+6</p>
                <p className="value">{analysis.baselineAvg?.toLocaleString("pt-BR") ?? "—"}</p>
              </div>
              <div className="metric-card" style={{ flex: 1 }}>
                <p className="label">Ratio</p>
                <p className={`value ${analysis.isOutlier ? "success" : "error"}`}>{analysis.outlierRatio != null ? `${analysis.outlierRatio}x` : "—"}</p>
                <small>{analysis.isOutlier ? "OUTLIER ✅" : "NÃO É OUTLIER ❌"}</small>
              </div>
            </div>
            <p className="meta">Vizinhos: {analysis.neighborsCount}/12 {analysis.sampleWarning && <span>— {analysis.sampleWarning}</span>}</p>
            <p className="meta">Comentários/Views: {analysis.commentsRatio != null ? `${analysis.commentsRatio.toFixed(4)}%` : "—"}</p>

            <div style={{ marginTop: 12 }}>
              <label>Salvar no Vault de:</label>
              <select value={selectedCreator} onChange={(e) => setSelectedCreator(e.target.value)} style={{ width: "100%", marginTop: 4 }}>
                {creators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button className="button" onClick={save} disabled={!analysis.isOutlier || saving} style={{ marginTop: 12, width: "100%" }} title={!analysis.isOutlier ? "Só outlier >=2x entra no Vault" : ""}>
              {saving ? "Salvando..." : "Salvar no Vault"}
            </button>
            {!analysis.isOutlier && <p className="hint">Só outlier com ratio ≥2.0 pode ser salvo.</p>}
          </div>
        )}

        {message && <p className={`message ${message.startsWith("✅") ? "success" : "error"}`} style={{ marginTop: 12 }}>{message}</p>}

        <button className="button secondary" onClick={onClose} style={{ marginTop: 12, width: "100%" }}>
          Fechar
        </button>
      </div>
    </div>
  );
}
