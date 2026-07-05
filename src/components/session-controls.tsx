"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, PlugZap, Plus, RefreshCw, Shield, Trash2 } from "lucide-react";
import type { Platform } from "@/lib/constants";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type BrowserSessionView = {
  id: string;
  platform: Platform;
  name: string;
  proxyLabel: string;
  hasProxy: boolean;
  hasStorage: boolean;
  status: string;
  lastOpenedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

type SessionsResponse = {
  sessions: BrowserSessionView[];
};

type TestResult = {
  sessionId: string;
  ok: boolean;
  proxyLabel: string;
  checks: Array<{
    label: string;
    ok: boolean;
    status: number | null;
    detail: string;
  }>;
};

const platforms: Platform[] = ["instagram", "tiktok"];

export function SessionControls() {
  const [sessions, setSessions] = useState<BrowserSessionView[]>([]);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [name, setName] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const grouped = useMemo(
    () =>
      platforms.map((item) => ({
        platform: item,
        sessions: sessions.filter((session) => session.platform === item),
      })),
    [sessions],
  );

  async function load() {
    const response = await fetch("/api/scrape/session");
    const payload = (await response.json()) as SessionsResponse;
    setSessions(payload.sessions);
  }

  useEffect(() => {
    load().catch(() => setError("Nao foi possivel ler as sessoes."));
  }, []);

  async function callSessionApi(body: Record<string, unknown>) {
    const response = await fetch("/api/scrape/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Falha ao atualizar sessao.");
    }

    await load();
  }

  async function createSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      await callSessionApi({
        action: "create",
        platform,
        name,
        proxyUrl: proxyUrl.trim() || null,
      });
      setName("");
      setProxyUrl("");
      setMessage("Sessao isolada criada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar sessao.");
    } finally {
      setCreating(false);
    }
  }

  async function openSession(session: BrowserSessionView) {
    setBusyId(session.id);
    setError(null);
    setMessage(null);

    try {
      await callSessionApi({ action: "open", id: session.id });
      setMessage(`Navegador aberto: ${session.name}. Todas as abas usam o proxy dessa sessao.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir navegador.");
    } finally {
      setBusyId(null);
    }
  }

  async function testSession(session: BrowserSessionView) {
    setBusyId(session.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/scrape/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id: session.id }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao testar sessao.");
      }

      const result = (await response.json()) as TestResult;
      setTestResults((current) => ({ ...current, [session.id]: result }));
      setMessage(result.ok ? "Conexao testada com sucesso." : "Teste falhou nessa sessao.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar sessao.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(session: BrowserSessionView) {
    setBusyId(session.id);
    setError(null);
    setMessage(null);

    try {
      await callSessionApi({
        action: "update",
        id: session.id,
        status: session.status === "active" ? "paused" : "active",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar status.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSession(session: BrowserSessionView) {
    const confirmed = window.confirm(
      `Excluir a sessao "${session.name}"? Isso apaga o storage/cookies desse navegador isolado.`,
    );

    if (!confirmed) {
      return;
    }

    setBusyId(session.id);
    setError(null);
    setMessage(null);

    try {
      await callSessionApi({ action: "delete", id: session.id });
      setTestResults((current) => {
        const next = { ...current };
        delete next[session.id];
        return next;
      });
      setMessage(`Sessao excluida: ${session.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir sessao.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid two">
      <section className="panel">
        <p className="eyebrow">Nova sessao</p>
        <h2>Navegador isolado</h2>
        <form className="form-stack" onSubmit={createSession}>
          <label className="form-stack">
            <span className="meta">Plataforma</span>
            <select
              className="control"
              value={platform}
              onChange={(event) => setPlatform(event.target.value as Platform)}
            >
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </label>
          <label className="form-stack">
            <span className="meta">Nome</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Conta teste 01"
              required
            />
          </label>
          <label className="form-stack">
            <span className="meta">Proxy</span>
            <input
              className="input"
              value={proxyUrl}
              onChange={(event) => setProxyUrl(event.target.value)}
              placeholder="45.38.101.31:5964:usuario:senha"
            />
          </label>
          <button className="button teal" type="submit" disabled={creating}>
            {creating ? <RefreshCw size={16} className="spin" /> : <Plus size={16} />}
            Criar sessao
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="toolbar spaced">
          <div>
            <p className="eyebrow">Sessoes</p>
            <h2>Pool de navegadores</h2>
          </div>
          <span className="icon-box">
            <Shield size={20} />
          </span>
        </div>

        <div className="session-list">
          {grouped.map((group) => (
            <div className="session-group" key={group.platform}>
              <h3>{PLATFORM_LABELS[group.platform]}</h3>
              {group.sessions.length === 0 ? (
                <p className="message">Nenhuma sessao.</p>
              ) : (
                group.sessions.map((session) => (
                  <div className="session-row" key={session.id}>
                    <div className="session-main">
                      <div className="toolbar">
                        <strong>{session.name}</strong>
                        <span className="badge">
                          {session.status === "active" ? "No pool" : "Fora do pool"}
                        </span>
                        <span className={`badge ${session.hasProxy ? "proxy-on" : ""}`}>
                          {session.proxyLabel}
                        </span>
                      </div>
                      <div className="session-meta">
                        <span className="status">
                          <span
                            className={`status-dot ${
                              session.status === "active" ? "success" : "warning"
                            }`}
                          />
                          {session.status === "active" ? "ativa" : "pausada"}
                        </span>
                        <span>{session.hasStorage ? "storage detectado" : "sem login salvo"}</span>
                        <span>aberta {formatDate(session.lastOpenedAt)}</span>
                      </div>
                    </div>
                    <div className="session-actions">
                      <button
                        className="button teal"
                        type="button"
                        onClick={() => openSession(session)}
                        disabled={busyId !== null || session.status !== "active"}
                      >
                        {busyId === session.id ? (
                          <RefreshCw size={16} className="spin" />
                        ) : (
                          <ExternalLink size={16} />
                        )}
                        Abrir login
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => testSession(session)}
                        disabled={busyId !== null || session.status !== "active"}
                      >
                        {busyId === session.id ? (
                          <RefreshCw size={16} className="spin" />
                        ) : (
                          <PlugZap size={16} />
                        )}
                        Testar proxy
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => toggleStatus(session)}
                        disabled={busyId !== null}
                      >
                        {session.status === "active" ? "Pausar" : "Ativar"}
                      </button>
                      <button
                        className="button danger"
                        type="button"
                        onClick={() => deleteSession(session)}
                        disabled={busyId !== null}
                      >
                        <Trash2 size={16} />
                        Excluir
                      </button>
                    </div>
                    {testResults[session.id] ? (
                      <div className="session-test">
                        {testResults[session.id].checks.map((check) => (
                          <p
                            className={`message ${check.ok ? "success" : "error"}`}
                            key={`${session.id}-${check.label}`}
                          >
                            {check.label}: {check.ok ? "ok" : "falhou"}
                            {check.status ? ` (${check.status})` : ""} - {check.detail}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>

        {message ? <p className="message success">{message}</p> : null}
        {error ? <p className="message error">{error}</p> : null}
      </section>
    </div>
  );
}
