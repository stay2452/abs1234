"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Grid3X3, PlaySquare } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/format";

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

function ContentIcon({ groupKey }: { groupKey: string }) {
  if (groupKey === "reels" || groupKey === "video") {
    return <PlaySquare size={16} />;
  }

  return <Grid3X3 size={16} />;
}

export function ProfileContentTabs({ groups }: { groups: ProfileContentGroup[] }) {
  const [activeKey, setActiveKey] = useState(groups[0]?.key ?? "");
  const activeGroup = useMemo(
    () => groups.find((group) => group.key === activeKey) ?? groups[0],
    [activeKey, groups],
  );

  if (!activeGroup) {
    return (
      <div className="empty-state">
        <p>Nenhuma colecao capturada.</p>
      </div>
    );
  }

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
        <h3>{activeGroup.title}</h3>
        {activeGroup.posts.length > 0 ? (
          <div className="post-list">
            {activeGroup.posts.map((post) => (
              <article className="post-item" key={post.id}>
                <div>
                  <a className="strong-link" href={post.url} target="_blank" rel="noreferrer">
                    {post.caption?.slice(0, 120) || "Post sem legenda"}
                    <ExternalLink size={13} />
                  </a>
                  <p className="meta">
                    {post.publishedAt ? formatDate(post.publishedAt) : "sem data de publicacao"}
                  </p>
                </div>
                <div className="metric-strip">
                  <div className="mini-metric">
                    <span>Views</span>
                    <strong>{formatNumber(post.metrics.views)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>Curtidas</span>
                    <strong>{formatNumber(post.metrics.likes)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>Comentarios</span>
                    <strong>{formatNumber(post.metrics.comments)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>Compart.</span>
                    <strong>{formatNumber(post.metrics.shares)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Nenhum item capturado.</p>
          </div>
        )}
      </section>
    </div>
  );
}
