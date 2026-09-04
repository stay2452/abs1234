"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListOrdered,
  PlugZap,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Wallet,
} from "lucide-react";
import { formatDate } from "@/lib/format";

type SessionHealth = "has_credit" | "no_credit" | "unknown" | "paused";

type CollectorSessionView = {
  id: string;
  scope: "global";
  name: string;
  provider: "brightdata" | null;
  providerLabel: string | null;
  hasApiKey: boolean;
  credentialLabel: string;
  status: string;
  health: SessionHealth;
  healthLabel: string;
  queuePosition: number | null;
  creditStatus: string;
  balanceUsd: number | null;
  pendingBalanceUsd: number | null;
  creditsRemaining: number | null;
  creditsSource: string | null;
  creditsLabel: string;
  balanceCheckedAt: string | null;
  balanceError: string | null;
  monthRecordsUsed: number;
  lastAttemptedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  createdAt: string;
};

type SessionPoolSummary = {
  total: number;
  hasCredit: number;
  noCredit: number;
  unknown: number;
  paused: number;
  activeInQueue: number;
};

type SessionsResponse = {
  sessions: CollectorSessionView[];
  summary: SessionPoolSummary;
  refreshed?: number;
};

type TestResult = {
  sessionId: string;
  ok: boolean;
  checks: Array<{
    label: string;
    ok: boolean;
    status: number | null;
    detail: string;
  }>;
};

function healthBadgeClass(health: SessionHealth) {
  if (health === "has_credit") {
    return "badge health-good";
  }
  if (health === "no_credit") {
    return "badge health-bad";
  }
  if (health === "paused") {
    return "badge health-paused";
  }
  return "badge";
}

export function SessionControls() {
  const [sessions, setSessions] = useState<CollectorSessionView[]>([]);
  const [summary, setSummary] = useState<SessionPoolSummary>({
    total: 0,
    hasCredit: 0,
    noCredit: 0,
    unknown: 0,
    paused: 0,
    activeInQueue: 0,
  });
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshingBalances, setRefreshingBalances] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const orderedSessions = useMemo(
    () =>
      sessions.slice().sort((left, right) => {
        if (left.queuePosition !== null && right.queuePosition !== null) {
          return left.queuePosition - right.queuePosition;
        }
        if (left.queuePosition !== null) {
          return -1;
        }
        if (right.queuePosition !== null) {
          return 1;
        }
        return left.createdAt.localeCompare(right.createdAt);
      }),
    [sessions],
  );

  async function fetchSessions() {
    const response = await fetch("/api/scrape/session");
    const payload = (await response.json()) as SessionsResponse;
    if (!response.ok) {
      throw new Error("Nao foi possivel ler as sessoes.");
    }
    return payload;
  }

  function applyList(payload: SessionsResponse) {
    setSessions(payload.sessions);
    setSummary(
      payload.summary ?? {
        total: payload.sessions.length,
        hasCredit: 0,
        noCredit: 0,
        unknown: 0,
        paused: 0,
        activeInQueue: 0,
      },
    );
  }

  async function load() {
    applyList(await fetchSessions());
  }

  useEffect(() => {
    let current = true;
    void fetchSessions()
      .then((payload) => {
        if (current) {
          applyList(payload);
        }
      })
      .catch(() => {
        if (current) {
          setError("Nao foi possivel ler as sessoes.");
        }
      });

    return () => {
      current = false;
    };
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

    return response.json();
  }

  async function createSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      await callSessionApi({
        action: "create",
        name,
        provider: "apify",
        apiKey: apiKey.trim(),
      });
      setName("");
      setApiKey("");
      await load();
      setMessage("Token Apify cadastrado. Pool por crédito atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar sessao.");
    } finally {
      setCreating(false);
    }
  }

  async function refreshBalances() {
    setRefreshingBalances(true);
    setError(null);
    setMessage(null);

    try {
      const payload = (await callSessionApi({ action: "refresh_balances" })) as SessionsResponse;
      applyList(payload);
      setMessage(
        `Saldos atualizados (${payload.refreshed ?? payload.sessions.length} chave(s)). Apify: estimado local (1k free) quando sem permissão oficial.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar saldos.");
    } finally {
      setRefreshingBalances(false);
    }
  }

  async function testSession(session: CollectorSessionView) {
    setBusyId(session.id);
    setError(null);
    setMessage(null);

    try {
      const result = (await callSessionApi({
        action: "test",
        id: session.id,
      })) as TestResult;
      setTestResults((current) => ({ ...current, [session.id]: result }));
      await load();
      setMessage(`Verificacao de @${session.name}: cadastro + saldo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar sessao.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(session: CollectorSessionView) {
    setBusyId(session.id);
    setError(null);
    setMessage(null);

    try {
      await callSessionApi({
        action: "update",
        id: session.id,
        status: session.status === "active" ? "paused" : "active",
      });
      await load();
      setMessage(
        session.status === "active"
          ? `"${session.name}" pausada.`
          : `"${session.name}" reativada no pool.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar status.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSession(session: CollectorSessionView) {
    const confirmed = window.confirm(
      `Excluir a chave "${session.name}"? Isso remove a chave salva localmente.`,
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
      await load();
      setMessage(`Chave excluida: ${session.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir sessao.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid two">
      <section className="panel">
        <p className="eyebrow">Nova chave</p>
        <h2>Token Apify</h2>
        <p className="lede" style={{ marginTop: 0 }}>
          Pool IG-only Apify: workers escolhem tokens <strong>com credito</strong>.
          <code>apify_api_...</code> roda profile (1) + post 5 + reel 5.
        </p>
        <form className="form-stack" onSubmit={createSession}>
          <label className="form-stack">
            <span className="meta">Provedor</span>
            <select className="control" value="apify" disabled>
              <option value="apify">Apify (IG 3 actors)</option>
            </select>
          </label>
          <label className="form-stack">
            <span className="meta">Nome</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: apify free 1"
              required
            />
          </label>
          <label className="form-stack">
            <span className="meta">Token Apify</span>
            <input
              className="input"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Cole o apify_api_..."
              required
              type="password"
            />
          </label>
          <button className="button teal" type="submit" disabled={creating}>
            {creating ? <RefreshCw size={16} className="spin" /> : <Plus size={16} />}
            Cadastrar token Apify
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="toolbar spaced">
          <div>
            <p className="eyebrow">Pool por credito</p>
            <h2>Workers de coleta</h2>
          </div>
          <div className="toolbar">
            <button
              className="button secondary"
              type="button"
              onClick={() => void refreshBalances()}
              disabled={refreshingBalances || busyId !== null}
            >
              {refreshingBalances ? (
                <RefreshCw size={16} className="spin" />
              ) : (
                <Wallet size={16} />
              )}
              Atualizar saldos
            </button>
            <span className="icon-box">
              <Shield size={20} />
            </span>
          </div>
        </div>

        <div className="pool-summary" aria-label="Resumo por credito">
          <div className="pool-summary-card good">
            <p className="label">Com credito</p>
            <p className="value">{summary.hasCredit}</p>
            <p className="hint">entram nos workers</p>
          </div>
          <div className="pool-summary-card bad">
            <p className="label">Sem credito</p>
            <p className="value">{summary.noCredit}</p>
            <p className="hint">fora da coleta</p>
          </div>
          <div className="pool-summary-card paused">
            <p className="label">Pausadas</p>
            <p className="value">{summary.paused}</p>
            <p className="hint">manual</p>
          </div>
          <div className="pool-summary-card">
            <p className="label">Na fila</p>
            <p className="value">{summary.activeInQueue}</p>
            <p className="hint">{summary.unknown} desconhec.</p>
          </div>
        </div>

        <div className="import-callout" style={{ marginBottom: 16 }}>
          <div className="import-callout-title">
            <ListOrdered size={16} aria-hidden />
            <strong>Como o crédito Apify é lido</strong>
          </div>
          <ol className="import-steps">
            <li>
              <strong>Estimativa local:</strong> 1.000 − resultados no mês por este token (free $5).
            </li>
            <li>
              Tokens <strong>sem crédito</strong> não entram nos workers. Falha de saldo marca como sem crédito.
            </li>
            <li>Prioridade: mais crédito restante primeiro. Pool já está ativo — seu token atual está em <strong>COM CRÉDITO (1)</strong>.</li>
          </ol>
        </div>

        <div className="session-list">
          <div className="session-group">
            <div className="toolbar spaced">
              <h3>Chaves</h3>
              <span className="meta">
                {summary.hasCredit} com credito · {summary.noCredit} sem · {summary.paused}{" "}
                pausada(s)
              </span>
            </div>
            {orderedSessions.length === 0 ? (
              <p className="message">Nenhuma chave. Cadastre a primeira ao lado.</p>
            ) : (
              orderedSessions.map((session) => (
                <div className="session-row" key={session.id}>
                  <div className="session-main">
                    <div className="toolbar">
                      <strong>{session.name}</strong>
                      {session.queuePosition !== null ? (
                        <span className="badge queue-pos">Fila #{session.queuePosition}</span>
                      ) : (
                        <span className="badge">Fora da fila</span>
                      )}
                      <span className={healthBadgeClass(session.health)}>
                        {session.healthLabel}
                      </span>
                      <span className="badge api-on">Global</span>
                    </div>
                    <div className="session-meta">
                      <span className="status">
                        <span
                          className={`status-dot ${
                            session.health === "has_credit"
                              ? "success"
                              : session.health === "no_credit"
                                ? "danger"
                                : session.health === "paused"
                                  ? "warning"
                                  : "warning"
                          }`}
                        />
                        {session.creditsLabel}
                      </span>
                      {session.balanceUsd !== null ? (
                        <span>US$ {session.balanceUsd.toFixed(2)} (API)</span>
                      ) : null}
                      {session.balanceCheckedAt ? (
                        <span>checado {formatDate(session.balanceCheckedAt)}</span>
                      ) : null}
                      <span>uso mes: {session.monthRecordsUsed} reg.</span>
                      <span>tentativa {formatDate(session.lastAttemptedAt)}</span>
                      {session.balanceError ? (
                        <span>saldo: {session.balanceError}</span>
                      ) : null}
                      {session.lastError ? <span>ultimo erro: {session.lastError}</span> : null}
                    </div>
                  </div>
                  <div className="session-actions">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => testSession(session)}
                      disabled={busyId !== null || refreshingBalances}
                    >
                      {busyId === session.id ? (
                        <RefreshCw size={16} className="spin" />
                      ) : (
                        <PlugZap size={16} />
                      )}
                      Verificar + saldo
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => toggleStatus(session)}
                      disabled={busyId !== null || refreshingBalances}
                    >
                      {session.status === "active" ? "Pausar" : "Ativar"}
                    </button>
                    <button
                      className="button danger"
                      type="button"
                      onClick={() => deleteSession(session)}
                      disabled={busyId !== null || refreshingBalances}
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
                          {check.label}: {check.ok ? "ok" : "falhou"} — {check.detail}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        {message ? <p className="message success">{message}</p> : null}
        {error ? <p className="message error">{error}</p> : null}
      </section>
    </div>
  );
}
