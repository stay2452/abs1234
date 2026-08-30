"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckSquare, ExternalLink, Square, Trash2 } from "lucide-react";

type ErrorProfile = {
  profileId: string;
  handle: string;
  platform: string;
  url: string;
  status: string;
  lastError: string;
  errorCode: string;
  lastFailedAt: string;
  failedCount: number;
  failedInRuns: string[];
};

export function ErrorProfilesPanel() {
  const [profiles, setProfiles] = useState<ErrorProfile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchErrors = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/audits/errors?lastRuns=5");
      const data = await res.json();
      setProfiles(data.profiles ?? []);
    } catch {
      setMessage("Falha ao carregar perfis com erro.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchErrors();
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === profiles.length) setSelected(new Set());
    else setSelected(new Set(profiles.map((p) => p.profileId)));
  };

  const handleDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    const label = ids.length === profiles.length ? `todos os ${ids.length} perfis com erro` : `${ids.length} perfil(is)`;
    if (!confirm(`Remover ${label}? Os posts e histórico desses perfis serão apagados (auditoria preservada).`)) return;
    if (!confirm(`Confirma mesmo? Essa ação não pode ser desfeita.`)) return;

    setDeleting(true);
    setMessage(null);
    try {
      // chunk de 100 (limite da API)
      let deleted = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const res = await fetch("/api/profiles/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileIds: chunk }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha ao remover");
        deleted += data.deleted ?? chunk.length;
      }
      setMessage(`✅ ${deleted} perfil(is) removido(s).`);
      setSelected(new Set());
      await fetchErrors();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="panel"><p className="meta">Analisando últimas 5 auditorias...</p></div>;
  }

  if (profiles.length === 0) {
    return (
      <div className="panel">
        <p className="meta">✅ Nenhum perfil com erro de @ mudado/banido nas últimas 5 coletas.</p>
        <p className="hint">Erros de rede ou sem crédito não entram aqui.</p>
      </div>
    );
  }

  const allSelected = selected.size === profiles.length && profiles.length > 0;

  return (
    <div className="panel history-panel">
      <div className="history-detail-header">
        <h2><AlertTriangle size={18} /> Perfis com erro — últimas 5 coletas</h2>
        <span className="history-status not_found">{profiles.length} com erro</span>
      </div>
      <p className="meta">Perfis que falharam com “conta não existe / página indisponível” ( @ mudado ou banido). Marque e remova.</p>

      <div className="page-header-actions" style={{ marginBottom: 12, gap: 8, display: "flex", flexWrap: "wrap" }}>
        <button className="button secondary" onClick={toggleAll} disabled={deleting}>
          {allSelected ? <CheckSquare size={16} /> : <Square size={16} />} {allSelected ? "Desmarcar todos" : "Selecionar todos"}
        </button>
        <button className="button secondary" onClick={() => handleDelete(Array.from(selected))} disabled={selected.size === 0 || deleting}>
          <Trash2 size={16} /> Remover selecionados ({selected.size})
        </button>
        <button className="button" onClick={() => handleDelete(profiles.map((p) => p.profileId))} disabled={deleting}>
          <Trash2 size={16} /> Remover tudo ({profiles.length})
        </button>
      </div>

      {message && <p className={`message ${message.startsWith("✅") ? "success" : "error"}`}>{message}</p>}

      <div className="table-scroll">
        <table className="history-table">
          <thead>
            <tr>
              <th></th>
              <th>Perfil</th>
              <th>Último erro</th>
              <th>Falhou em</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.profileId}>
                <td>
                  <input type="checkbox" checked={selected.has(p.profileId)} onChange={() => toggle(p.profileId)} aria-label={`Selecionar @${p.handle}`} />
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <strong>@{p.handle}</strong> <small>{p.platform}</small><br />
                      <a href={p.url} target="_blank" rel="noreferrer" className="hint">{p.url}</a>
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="button secondary"
                      aria-label={`Abrir perfil @${p.handle}`}
                      title="Abrir perfil no Instagram/TikTok"
                      style={{ padding: "6px 10px", whiteSpace: "nowrap" }}
                    >
                      <ExternalLink size={14} /> Abrir
                    </a>
                  </div>
                </td>
                <td>
                  <span className={`history-status ${p.errorCode}`}>{p.errorCode}</span>
                  <small className="history-error" title={p.lastError}>{p.lastError.slice(0, 120)}</small>
                </td>
                <td>
                  <strong>{p.failedCount}/5</strong><br />
                  <small>{new Date(p.lastFailedAt).toLocaleDateString("pt-BR")}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        Dica: perfis removidos mantêm a auditoria (tentativas viram “perfil removido”), mas perdem posts. Prefira conferir antes.
      </p>
    </div>
  );
}
