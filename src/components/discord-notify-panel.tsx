"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  Send,
  TestTube2,
  Trash2,
} from "lucide-react";
import type { Platform, PostMetric, RankingPeriod } from "@/lib/constants";
import type { DiscordNotifySettings, DiscordSendResult } from "@/lib/discord-notify";
import type { FolderRecord } from "@/lib/folders";
import { formatChartDateTime } from "@/lib/format";

type Draft = {
  name: string;
  serverLabel: string;
  webhookUrl: string;
  enabled: boolean;
  topN: number;
  metric: PostMetric;
  period: RankingPeriod;
  platform: Platform | "all";
  folderId: string;
  minViews: string;
  minLikes: string;
  minEngagement: string;
  skipAlreadySent: boolean;
};

function toDraft(config: DiscordNotifySettings): Draft {
  return {
    name: config.name,
    serverLabel: config.serverLabel ?? "",
    webhookUrl: config.webhookUrl ?? "",
    enabled: config.enabled,
    topN: config.topN,
    metric: config.metric,
    period: config.period,
    platform: config.platform,
    folderId: config.folderId ?? "",
    minViews: config.minViews != null ? String(config.minViews) : "",
    minLikes: config.minLikes != null ? String(config.minLikes) : "",
    minEngagement: config.minEngagement != null ? String(config.minEngagement) : "",
    skipAlreadySent: config.skipAlreadySent,
  };
}

function emptyDraft(): Draft {
  return {
    name: "Novo webhook",
    serverLabel: "",
    webhookUrl: "",
    enabled: false,
    topN: 5,
    metric: "views",
    period: "7d",
    platform: "all",
    folderId: "",
    minViews: "",
    minLikes: "",
    minEngagement: "",
    skipAlreadySent: true,
  };
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Mínimos numéricos inválidos.");
  }
  return value;
}

function draftToBody(draft: Draft) {
  return {
    name: draft.name.trim(),
    serverLabel: draft.serverLabel.trim() || null,
    webhookUrl: draft.webhookUrl.trim() || null,
    enabled: draft.enabled,
    topN: draft.topN,
    metric: draft.metric,
    period: draft.period,
    platform: draft.platform,
    folderId: draft.folderId || null,
    minViews: parseOptionalNumber(draft.minViews),
    minLikes: parseOptionalNumber(draft.minLikes),
    minEngagement: parseOptionalNumber(draft.minEngagement),
    skipAlreadySent: draft.skipAlreadySent,
  };
}

export function DiscordNotifyPanel({ folders }: { folders: FolderRecord[] }) {
  const [webhooks, setWebhooks] = useState<DiscordNotifySettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/discord");
      if (!response.ok) {
        throw new Error("Não foi possível carregar webhooks.");
      }
      const payload = (await response.json()) as { webhooks?: DiscordNotifySettings[] };
      const list = payload.webhooks ?? [];
      setWebhooks(list);
      setDrafts(Object.fromEntries(list.map((item) => [item.id, toDraft(item)])));
      if (list.length > 0 && !expandedId) {
        setExpandedId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [expandedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  function updateDraft(id: string, key: keyof Draft, value: Draft[keyof Draft]) {
    setDrafts((prev) => {
      const base = prev[id] ?? emptyDraft();
      return { ...prev, [id]: { ...base, [key]: value } };
    });
  }

  async function saveWebhook(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }
    setBusyKey(`save:${id}`);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/discord/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToBody(draft)),
      });
      const payload = (await response.json().catch(() => null)) as
        | (DiscordNotifySettings & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao salvar.");
      }
      if (payload?.id) {
        setWebhooks((prev) => prev.map((item) => (item.id === id ? payload : item)));
        setDrafts((prev) => ({ ...prev, [id]: toDraft(payload) }));
      }
      setMessage(`Webhook “${payload?.name ?? draft.name}” salvo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusyKey(null);
    }
  }

  async function createWebhook() {
    setBusyKey("create");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToBody(createDraft)),
      });
      const payload = (await response.json().catch(() => null)) as
        | (DiscordNotifySettings & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao criar.");
      }
      if (payload?.id) {
        setWebhooks((prev) => [...prev, payload]);
        setDrafts((prev) => ({ ...prev, [payload.id]: toDraft(payload) }));
        setExpandedId(payload.id);
        setCreating(false);
        setCreateDraft(emptyDraft());
        setMessage(`Webhook “${payload.name}” criado.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar.");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeWebhook(id: string, name: string) {
    if (!window.confirm(`Remover o webhook “${name}”? O histórico de dedupe deste canal some.`)) {
      return;
    }
    setBusyKey(`del:${id}`);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/discord/${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao remover.");
      }
      setWebhooks((prev) => prev.filter((item) => item.id !== id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (expandedId === id) {
        setExpandedId(null);
      }
      setMessage(`Webhook “${name}” removido.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover.");
    } finally {
      setBusyKey(null);
    }
  }

  async function testWebhook(id: string) {
    const draft = drafts[id];
    setBusyKey(`test:${id}`);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/discord/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: draft?.webhookUrl.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha no teste.");
      }
      setMessage(payload?.message ?? "Teste enviado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no teste.");
    } finally {
      setBusyKey(null);
    }
  }

  async function sendWebhook(id: string, force = false) {
    const draft = drafts[id];
    if (draft) {
      // Salva critérios antes de enviar
      setBusyKey(`save:${id}`);
      try {
        const saveRes = await fetch(`/api/discord/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftToBody(draft)),
        });
        if (!saveRes.ok) {
          const payload = (await saveRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Falha ao salvar antes do envio.");
        }
        const saved = (await saveRes.json()) as DiscordNotifySettings;
        setWebhooks((prev) => prev.map((item) => (item.id === id ? saved : item)));
        setDrafts((prev) => ({ ...prev, [id]: toDraft(saved) }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar.");
        setBusyKey(null);
        return;
      }
    }

    setBusyKey(`send:${id}`);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/discord/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, ignoreEnabled: true }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (DiscordSendResult & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao enviar.");
      }
      if (payload) {
        setMessage(payload.message);
        setWebhooks((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  lastSentAt: payload.at,
                  lastError: null,
                  lastResult: payload,
                }
              : item,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar.");
    } finally {
      setBusyKey(null);
    }
  }

  async function sendAllEnabled() {
    setBusyKey("send-all");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/discord/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => null)) as {
        total?: number;
        results?: DiscordSendResult[];
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha no envio em massa.");
      }
      const ok = payload?.results?.filter((r) => r.ok).length ?? 0;
      const total = payload?.total ?? 0;
      setMessage(`Envio em massa: ${ok}/${total} webhook(s) com enabled.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no envio em massa.");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="eyebrow">Discord</p>
        <h2>Webhooks</h2>
        <p className="meta">
          <Loader2 size={14} className="spin" /> Carregando…
        </p>
      </section>
    );
  }

  return (
    <div className="discord-multi">
      <section className="panel">
        <div className="content-panel-toolbar">
          <div>
            <p className="eyebrow">Discord</p>
            <h2>Webhooks por canal / servidor</h2>
            <p className="meta ranking-hint">
              Cadastre quantos webhooks quiser (vários servidores e canais). Cada um tem critérios
              próprios e dedupe separado. Não gasta crédito Bright Data.
            </p>
          </div>
          <div className="discord-actions">
            <button
              className="button teal"
              type="button"
              disabled={!!busyKey}
              onClick={() => {
                setCreating(true);
                setCreateDraft(emptyDraft());
              }}
            >
              <Plus size={16} />
              Novo webhook
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!!busyKey || webhooks.every((w) => !w.enabled)}
              onClick={() => void sendAllEnabled()}
              title="Só webhooks com “Ativo” ligado"
            >
              {busyKey === "send-all" ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Send size={16} />
              )}
              Enviar ativos
            </button>
          </div>
        </div>

        {message ? <p className="message success">{message}</p> : null}
        {error ? <p className="message error">{error}</p> : null}

        {webhooks.length === 0 && !creating ? (
          <div className="empty-state ranking-empty">
            <p>Nenhum webhook ainda.</p>
            <p className="meta">Crie o primeiro para um canal de qualquer servidor Discord.</p>
          </div>
        ) : null}
      </section>

      {creating ? (
        <WebhookEditorCard
          title="Novo webhook"
          draft={createDraft}
          folders={folders}
          busy={busyKey === "create"}
          onChange={(key, value) => setCreateDraft((prev) => ({ ...prev, [key]: value }))}
          onSave={() => void createWebhook()}
          onCancel={() => setCreating(false)}
          saveLabel="Criar webhook"
        />
      ) : null}

      {webhooks.map((webhook) => {
        const draft = drafts[webhook.id] ?? toDraft(webhook);
        const open = expandedId === webhook.id;
        const busy = busyKey?.endsWith(`:${webhook.id}`) || busyKey === `save:${webhook.id}`;

        return (
          <section key={webhook.id} className="panel discord-webhook-card">
            <button
              type="button"
              className="discord-webhook-summary"
              onClick={() => setExpandedId(open ? null : webhook.id)}
            >
              <div className="discord-webhook-summary-main">
                <strong>{webhook.name}</strong>
                {webhook.serverLabel ? (
                  <span className="badge tag-badge tag-muted">{webhook.serverLabel}</span>
                ) : null}
                <span className={`badge ${webhook.enabled ? "health-good" : "tag-muted"}`}>
                  {webhook.enabled ? "ativo" : "manual"}
                </span>
                <span className="meta">
                  {webhook.platform} · {webhook.metric} · {webhook.period} · top {webhook.topN}
                </span>
                {webhook.webhookUrlMasked ? (
                  <span className="meta">URL {webhook.webhookUrlMasked}</span>
                ) : (
                  <span className="meta">sem URL</span>
                )}
              </div>
              {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {open ? (
              <div className="discord-webhook-body">
                <WebhookForm
                  draft={draft}
                  folders={folders}
                  onChange={(key, value) => updateDraft(webhook.id, key, value)}
                />

                <div className="discord-actions">
                  <button
                    className="button teal"
                    type="button"
                    disabled={!!busyKey}
                    onClick={() => void saveWebhook(webhook.id)}
                  >
                    {busyKey === `save:${webhook.id}` ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    Salvar
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!!busyKey}
                    onClick={() => void testWebhook(webhook.id)}
                  >
                    {busyKey === `test:${webhook.id}` ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <TestTube2 size={16} />
                    )}
                    Testar
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!!busyKey}
                    onClick={() => void sendWebhook(webhook.id, false)}
                  >
                    {busyKey === `send:${webhook.id}` ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    Enviar tops
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    disabled={!!busyKey}
                    onClick={() => void sendWebhook(webhook.id, true)}
                  >
                    <BellRing size={16} />
                    Forçar reenvio
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    disabled={!!busyKey || busy}
                    onClick={() => void removeWebhook(webhook.id, webhook.name)}
                  >
                    <Trash2 size={16} />
                    Remover
                  </button>
                </div>

                {webhook.lastSentAt || webhook.lastResult || webhook.lastError ? (
                  <div className="discord-last-result">
                    <p className="meta" style={{ margin: 0 }}>
                      Último envio:{" "}
                      {webhook.lastSentAt ? formatChartDateTime(webhook.lastSentAt) : "—"}
                      {webhook.lastResult
                        ? ` · enviados ${webhook.lastResult.sent} · candidatos ${webhook.lastResult.candidates}`
                        : ""}
                    </p>
                    {webhook.lastError ? (
                      <p className="message error" style={{ marginTop: 8 }}>
                        {webhook.lastError}
                      </p>
                    ) : null}
                    {webhook.lastResult?.posts && webhook.lastResult.posts.length > 0 ? (
                      <ul className="discord-sent-list">
                        {webhook.lastResult.posts.map((post) => (
                          <li key={post.id}>
                            <a href={post.url} target="_blank" rel="noreferrer">
                              {post.handle ? `@${post.handle}` : post.platform} · score{" "}
                              {post.score ?? "—"}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function WebhookForm({
  draft,
  folders,
  onChange,
}: {
  draft: Draft;
  folders: FolderRecord[];
  onChange: (key: keyof Draft, value: Draft[keyof Draft]) => void;
}) {
  return (
    <>
      <div className="discord-config-grid">
        <label className="form-stack">
          <span className="meta">Nome</span>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="Tops IG — Canal virais"
            maxLength={80}
          />
        </label>
        <label className="form-stack">
          <span className="meta">Servidor (rótulo)</span>
          <input
            className="input"
            value={draft.serverLabel}
            onChange={(e) => onChange("serverLabel", e.target.value)}
            placeholder="ex.: Comunidade Humor"
            maxLength={80}
          />
        </label>
      </div>

      <label className="form-stack">
        <span className="meta">URL do webhook</span>
        <input
          className="input"
          type="password"
          autoComplete="off"
          value={draft.webhookUrl}
          onChange={(e) => onChange("webhookUrl", e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
        />
        <span className="meta">
          Discord → canal → Integrações → Webhooks. Um webhook por canal (pode ser outro servidor).
        </span>
      </label>

      <div className="discord-config-grid">
        <label className="form-stack">
          <span className="meta">Top N</span>
          <input
            className="input"
            type="number"
            min={1}
            max={25}
            value={draft.topN}
            onChange={(e) => onChange("topN", Number(e.target.value) || 1)}
          />
        </label>
        <label className="form-stack">
          <span className="meta">Métrica</span>
          <select
            className="control"
            value={draft.metric}
            onChange={(e) => onChange("metric", e.target.value as PostMetric)}
          >
            <option value="views">Views</option>
            <option value="likes">Curtidas</option>
            <option value="comments">Comentários</option>
            <option value="shares">Compartilhamentos</option>
            <option value="engagement">Engajamento</option>
          </select>
        </label>
        <label className="form-stack">
          <span className="meta">Período</span>
          <select
            className="control"
            value={draft.period}
            onChange={(e) => onChange("period", e.target.value as RankingPeriod)}
          >
            <option value="3d">3 dias</option>
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="90d">90 dias</option>
            <option value="all">Tudo</option>
          </select>
        </label>
        <label className="form-stack">
          <span className="meta">Plataforma</span>
          <select
            className="control"
            value={draft.platform}
            onChange={(e) => onChange("platform", e.target.value as Platform | "all")}
          >
            <option value="all">Todas</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </label>
        <label className="form-stack">
          <span className="meta">Pasta</span>
          <select
            className="control"
            value={draft.folderId}
            onChange={(e) => onChange("folderId", e.target.value)}
          >
            <option value="">Todas</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-stack">
          <span className="meta">Mín. views</span>
          <input
            className="input"
            inputMode="numeric"
            value={draft.minViews}
            onChange={(e) => onChange("minViews", e.target.value)}
            placeholder="vazio = sem filtro"
          />
        </label>
        <label className="form-stack">
          <span className="meta">Mín. curtidas</span>
          <input
            className="input"
            inputMode="numeric"
            value={draft.minLikes}
            onChange={(e) => onChange("minLikes", e.target.value)}
          />
        </label>
        <label className="form-stack">
          <span className="meta">Mín. engajamento</span>
          <input
            className="input"
            inputMode="numeric"
            value={draft.minEngagement}
            onChange={(e) => onChange("minEngagement", e.target.value)}
          />
        </label>
      </div>

      <div className="discord-toggles">
        <label className="discord-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => onChange("enabled", e.target.checked)}
          />
          <span>
            Ativo para “Enviar ativos” / cron futuro
            <span className="meta"> (Enviar tops neste card funciona mesmo desligado)</span>
          </span>
        </label>
        <label className="discord-check">
          <input
            type="checkbox"
            checked={draft.skipAlreadySent}
            onChange={(e) => onChange("skipAlreadySent", e.target.checked)}
          />
          <span>Não reenviar o mesmo post neste webhook</span>
        </label>
      </div>
    </>
  );
}

function WebhookEditorCard({
  title,
  draft,
  folders,
  busy,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  title: string;
  draft: Draft;
  folders: FolderRecord[];
  busy: boolean;
  onChange: (key: keyof Draft, value: Draft[keyof Draft]) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <section className="panel discord-webhook-card">
      <p className="eyebrow">Novo</p>
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      <WebhookForm draft={draft} folders={folders} onChange={onChange} />
      <div className="discord-actions">
        <button className="button teal" type="button" disabled={busy} onClick={onSave}>
          {busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
          {saveLabel}
        </button>
        <button className="button ghost" type="button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
