"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, ExternalLink } from "lucide-react";
import {
  formatChartDateTime,
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/format";

export type FolderCompareRow = {
  id: string;
  handle: string;
  platform: "instagram" | "tiktok";
  platformLabel: string;
  url: string;
  status: string;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
  catalogedPosts: number;
  growthAbsolute: number | null;
  growthPercent: number | null;
  bestPostViews: number | null;
  bestPostUrl: string | null;
  bestPostCaption: string | null;
  lastCapturedAt: string | null;
};

type SortKey =
  | "growthAbsolute"
  | "growthPercent"
  | "followers"
  | "bestPostViews"
  | "catalogedPosts"
  | "handle";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "growthAbsolute", label: "Cresc. absoluto (7d)" },
  { value: "growthPercent", label: "Cresc. % (7d)" },
  { value: "followers", label: "Seguidores" },
  { value: "bestPostViews", label: "Melhor post (views)" },
  { value: "catalogedPosts", label: "Posts catalogados" },
  { value: "handle", label: "Handle (A–Z)" },
];

function cellNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return formatNumber(value);
}

function cellSigned(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return formatSigned(value);
}

function cellPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return formatPercent(value);
}

function sortValue(row: FolderCompareRow, key: SortKey): number | string | null {
  if (key === "handle") {
    return row.handle.toLowerCase();
  }
  return row[key];
}

export function FolderCompare({
  folderName,
  rows,
}: {
  folderId: string;
  folderName: string;
  rows: FolderCompareRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("growthAbsolute");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const sorted = useMemo(() => {
    const mult = sortDir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) {
        return 0;
      }
      if (av == null) {
        return 1;
      }
      if (bv == null) {
        return -1;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv, "pt-BR") * (sortDir === "asc" ? 1 : -1);
      }
      if (av === bv) {
        return a.handle.localeCompare(b.handle, "pt-BR");
      }
      return (av as number) > (bv as number) ? mult : -mult;
    });
  }, [rows, sortDir, sortKey]);

  const leaders = useMemo(() => {
    if (rows.length === 0) {
      return null;
    }
    const byFollowers = [...rows].sort(
      (a, b) => (b.followers ?? -1) - (a.followers ?? -1),
    )[0];
    const byGrowth = [...rows].sort(
      (a, b) => (b.growthAbsolute ?? -Infinity) - (a.growthAbsolute ?? -Infinity),
    )[0];
    const byPost = [...rows].sort(
      (a, b) => (b.bestPostViews ?? -1) - (a.bestPostViews ?? -1),
    )[0];
    return { byFollowers, byGrowth, byPost };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <section className="panel">
        <div className="empty-state ranking-empty">
          <p>Esta pasta está vazia.</p>
          <p className="meta">
            Abra um perfil em Perfis → Pastas e notas, e marque “{folderName}”.
          </p>
          <Link className="button secondary" href="/profiles" style={{ marginTop: 12 }}>
            Ir para perfis
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="folder-compare">
      {leaders ? (
        <section className="grid three dashboard-metrics" aria-label="Destaques da pasta">
          <div className="metric-card">
            <div>
              <p className="label">Mais seguidores</p>
              <p className="value">@{leaders.byFollowers.handle}</p>
              <p className="hint">{cellNumber(leaders.byFollowers.followers)}</p>
            </div>
          </div>
          <div className="metric-card">
            <div>
              <p className="label">Maior crescimento (7d)</p>
              <p className="value">@{leaders.byGrowth.handle}</p>
              <p className="hint">{cellSigned(leaders.byGrowth.growthAbsolute)}</p>
            </div>
          </div>
          <div className="metric-card">
            <div>
              <p className="label">Melhor post (views)</p>
              <p className="value">@{leaders.byPost.handle}</p>
              <p className="hint">{cellNumber(leaders.byPost.bestPostViews)}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="content-panel-toolbar">
          <div>
            <p className="eyebrow">Comparação</p>
            <h2>Perfis em {folderName}</h2>
            <p className="meta content-sort-hint">
              Ordene por métrica para ver quem lidera na pasta.
            </p>
          </div>
          <div className="content-sort-controls">
            <label className="content-sort-field">
              <span className="ranking-filter-label">
                <ArrowDownWideNarrow size={12} aria-hidden />
                Ordenar
              </span>
              <select
                className="control"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented content-sort-dir">
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

        <div className="table-scroll ranking-scroll">
          <table className="ranking-table ranking-table-profiles">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-profile">Perfil</th>
                <th className="col-metric">Seguidores</th>
                <th className="col-metric">Cresc. 7d</th>
                <th className="col-metric">Cresc. %</th>
                <th className="col-metric">Posts</th>
                <th className="col-metric">Melhor post</th>
                <th className="col-date">Coleta</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => (
                <tr key={row.id}>
                  <td className="rank-index col-rank">{index + 1}</td>
                  <td className="col-profile">
                    <div className="profile-cell">
                      <Link className="strong-link" href={`/profiles/${row.id}`}>
                        @{row.handle}
                      </Link>
                      <div className="badge-row">
                        <span className={`badge ${row.platform}`}>{row.platformLabel}</span>
                        <a
                          className="meta"
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          abrir <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  </td>
                  <td className="col-metric metric-cell">{cellNumber(row.followers)}</td>
                  <td
                    className={`col-metric metric-cell ${
                      sortKey === "growthAbsolute" ? "metric-score" : ""
                    }`}
                  >
                    {cellSigned(row.growthAbsolute)}
                  </td>
                  <td className="col-metric metric-cell">{cellPercent(row.growthPercent)}</td>
                  <td className="col-metric metric-cell">
                    {cellNumber(row.catalogedPosts)}
                    <div className="meta">snap {cellNumber(row.postsCount)}</div>
                  </td>
                  <td className="col-metric metric-cell">
                    {row.bestPostUrl ? (
                      <a
                        className="strong-link"
                        href={row.bestPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={row.bestPostCaption ?? row.bestPostUrl}
                      >
                        {cellNumber(row.bestPostViews)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="meta col-date">
                    {row.lastCapturedAt ? formatChartDateTime(row.lastCapturedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
