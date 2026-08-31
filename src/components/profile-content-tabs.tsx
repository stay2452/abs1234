"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ExternalLink, Grid3X3, PlaySquare, Sparkles } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/format";
import { OutlierModal } from "@/components/research/outlier-modal";

export type ProfileContentPost = {
  id: string;
  url: string;
  caption: string | null;
  publishedAt: string | null;
  metrics: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  };
};

export type ProfileContentGroup = {
  key: string;
  label: string;
  title: string;
  posts: ProfileContentPost[];
};

type SortKey = "published" | "views" | "likes" | "comments" | "shares" | "engagement";
type SortDir = "desc" | "asc";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "published", label: "Data de publicação" },
  { value: "views", label: "Views" },
  { value: "likes", label: "Curtidas" },
  { value: "comments", label: "Comentários" },
  { value: "shares", label: "Compartilhamentos" },
  { value: "engagement", label: "Engajamento" },
];

function ContentIcon({ groupKey }: { groupKey: string }) {
  if (groupKey === "reels" || groupKey === "video") {
    return <PlaySquare size={16} />;
  }

  return <Grid3X3 size={16} />;
}

function engagementOf(post: ProfileContentPost) {
  const likes = post.metrics.likes ?? 0;
  const comments = post.metrics.comments ?? 0;
  const shares = post.metrics.shares ?? 0;
  if (
    post.metrics.likes == null &&
    post.metrics.comments == null &&
    post.metrics.shares == null
  ) {
    return null;
  }
  return likes + comments + shares;
}

function metricValue(post: ProfileContentPost, key: SortKey): number | null {
  if (key === "published") {
    if (!post.publishedAt) {
      return null;
    }
    const time = new Date(post.publishedAt).getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (key === "engagement") {
    return engagementOf(post);
  }
  return post.metrics[key];
}

function sortPosts(posts: ProfileContentPost[], sortKey: SortKey, sortDir: SortDir) {
  const mult = sortDir === "desc" ? -1 : 1;
  return [...posts].sort((a, b) => {
    const av = metricValue(a, sortKey);
    const bv = metricValue(b, sortKey);

    // Nulos sempre no fim
    if (av == null && bv == null) {
      return 0;
    }
    if (av == null) {
      return 1;
    }
    if (bv == null) {
      return -1;
    }
    if (av === bv) {
      // desempate por data (mais recente primeiro)
      const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bt - at;
    }
    return av > bv ? mult : -mult;
  });
}

export function ProfileContentTabs({ groups }: { groups: ProfileContentGroup[] }) {
  const [activeKey, setActiveKey] = useState(groups[0]?.key ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("published");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [outlierPostId, setOutlierPostId] = useState<string | null>(null);
  const [creators, setCreators] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetch("/api/creators")
      .then((r) => r.json())
      .then((d) => setCreators(d.creators ?? []))
      .catch(() => {});
  }, []);

  const activeGroup = useMemo(
    () => groups.find((group) => group.key === activeKey) ?? groups[0],
    [activeKey, groups],
  );

  const sortedPosts = useMemo(() => {
    if (!activeGroup) {
      return [];
    }
    return sortPosts(activeGroup.posts, sortKey, sortDir);
  }, [activeGroup, sortKey, sortDir]);

  if (!activeGroup) {
    return (
      <div className="empty-state">
        <p>Nenhuma colecao capturada.</p>
      </div>
    );
  }

  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortKey)?.label ?? sortKey;

  return (
    <div className="content-tabs">
      <div className="content-tabs-header">
        <div className="segmented content-tab-buttons" role="tablist" aria-label="Colecoes de conteudo">
          {groups.map((group) => (
            <button
              aria-controls={`content-panel-${group.key}`}
              aria-label={`${group.label}, ${group.posts.length} itens`}
              aria-selected={activeGroup.key === group.key}
              className={`segment content-tab-button ${activeGroup.key === group.key ? "active" : ""}`}
              id={`content-tab-${group.key}`}
              key={group.key}
              onClick={() => setActiveKey(group.key)}
              role="tab"
              type="button"
            >
              <ContentIcon groupKey={group.key} />
              <span>{group.label}</span>
              <span className="tab-count">{group.posts.length}</span>
            </button>
          ))}
        </div>
      </div>

      <section
        aria-labelledby={`content-tab-${activeGroup.key}`}
        className="content-tab-panel"
        id={`content-panel-${activeGroup.key}`}
        role="tabpanel"
      >
        <div className="content-panel-toolbar">
          <div>
            <h3>{activeGroup.title}</h3>
            <p className="meta content-sort-hint">
              Ordenado por {sortLabel.toLowerCase()} (
              {sortDir === "desc" ? "maior → menor" : "menor → maior"})
            </p>
          </div>

          <div className="content-sort-controls" role="group" aria-label="Ordenar conteúdos">
            <label className="content-sort-field">
              <span className="ranking-filter-label">
                <ArrowDownWideNarrow size={12} aria-hidden />
                Ordenar
              </span>
              <select
                className="control"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                aria-label="Métrica de ordenação"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented content-sort-dir" aria-label="Direção">
              <button
                type="button"
                className={`segment ${sortDir === "desc" ? "active" : ""}`}
                onClick={() => setSortDir("desc")}
              >
                Maior
              </button>
              <button
                type="button"
                className={`segment ${sortDir === "asc" ? "active" : ""}`}
                onClick={() => setSortDir("asc")}
              >
                Menor
              </button>
            </div>
          </div>
        </div>

        {sortedPosts.length > 0 ? (
          <div className="post-list">
            {sortedPosts.map((post, index) => {
              const eng = engagementOf(post);
              return (
                <article className="post-item" key={post.id}>
                  <div className="post-item-copy">
                    <div className="post-item-rank-row">
                      <span className="rank-index post-rank">#{index + 1}</span>
                      <a
                        className="strong-link post-caption-link"
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        title={post.caption?.trim() || post.url}
                      >
                        <span className="post-caption-text">
                          {post.caption?.trim().slice(0, 120) || "Post sem legenda"}
                        </span>
                        <ExternalLink size={13} className="ranking-ext-icon" aria-hidden />
                      </a>
                    </div>
                    <p className="meta">
                      {post.publishedAt ? formatDate(post.publishedAt) : "sem data de publicação"}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="button secondary" onClick={() => setOutlierPostId(post.id)} style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                      <Sparkles size={12} /> Vault 6×6
                    </button>
                    <a className="button secondary" href={post.url} target="_blank" rel="noreferrer" style={{ padding: "6px 10px" }}>
                      <ExternalLink size={12} /> Abrir
                    </a>
                  </div>
                  <div className="metric-strip">
                    <div
                      className={`mini-metric ${sortKey === "views" ? "is-sorted" : ""}`}
                    >
                      <span>Views</span>
                      <strong>{formatNumber(post.metrics.views)}</strong>
                    </div>
                    <div
                      className={`mini-metric ${sortKey === "likes" ? "is-sorted" : ""}`}
                    >
                      <span>Curtidas</span>
                      <strong>{formatNumber(post.metrics.likes)}</strong>
                    </div>
                    <div
                      className={`mini-metric ${sortKey === "comments" ? "is-sorted" : ""}`}
                    >
                      <span>Comentários</span>
                      <strong>{formatNumber(post.metrics.comments)}</strong>
                    </div>
                    <div
                      className={`mini-metric ${sortKey === "shares" ? "is-sorted" : ""}`}
                    >
                      <span>Compart.</span>
                      <strong>{formatNumber(post.metrics.shares)}</strong>
                    </div>
                    <div
                      className={`mini-metric ${sortKey === "engagement" ? "is-sorted" : ""}`}
                      title="Curtidas + comentários + compartilhamentos"
                    >
                      <span>Engaj.</span>
                      <strong>{formatNumber(eng)}</strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p>Nenhum item capturado.</p>
          </div>
        )}
      </section>
      {outlierPostId && <OutlierModal postId={outlierPostId} creators={creators} onClose={() => setOutlierPostId(null)} />}
    </div>
  );
}
