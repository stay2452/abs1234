"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Filter, RefreshCw } from "lucide-react";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants";
import {
  formatChartDateTime,
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/format";
import { cleanInstagramCaption } from "@/lib/instagram-caption";
import type { PostRankingItem, ProfileRankingItem, RankingFolderRef } from "@/lib/rankings";
import type { FolderRecord } from "@/lib/folders";

type RankingType = "posts" | "profiles";
type PlatformFilter = Platform | "all";

type RankingResponse =
  | {
      type: "posts";
      items: PostRankingItem[];
    }
  | {
      type: "profiles";
      items: ProfileRankingItem[];
    };

/** URL pública do perfil no Instagram/TikTok. */
function externalProfileUrl(platform: string, handle: string, url?: string | null) {
  const cleaned = (url || "").trim();
  if (cleaned.startsWith("http")) return cleaned;
  const h = handle.replace(/^@/, "").trim();
  if (!h) return null;
  if (platform === "tiktok") return `https://www.tiktok.com/@${h}`;
  return `https://www.instagram.com/${h}/`;
}

function OpenOnPlatformButton({
  platform,
  handle,
  url,
}: {
  platform: string;
  handle: string;
  url?: string | null;
}) {
  const href = externalProfileUrl(platform, handle, url);
  if (!href) return null;
  const label =
    platform === "tiktok" ? "Abrir no TikTok" : "Abrir no Instagram";

  return (
    <a
      className="ranking-open-social"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={`${label}: @${handle.replace(/^@/, "")}`}
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink size={14} aria-hidden />
    </a>
  );
}

function normalizeFolders(
  folders?: RankingFolderRef[] | RankingFolderRef | null,
): RankingFolderRef[] {
  if (!folders) return [];
  if (Array.isArray(folders)) return folders;
  // PowerShell/alguns clients às vezes colapsam array de 1 item em objeto
  if (typeof folders === "object" && "id" in folders && "name" in folders) {
    return [folders as RankingFolderRef];
  }
  return [];
}

function FolderBadges({ folders }: { folders?: RankingFolderRef[] | RankingFolderRef | null }) {
  const list = normalizeFolders(folders);
  if (list.length === 0) {
    return <span className="meta ranking-no-folder">—</span>;
  }

  return (
    <div className="badge-row ranking-folder-row">
      {list.slice(0, 4).map((folder) => (
        <Link
          key={folder.id}
          href={`/folders/${folder.id}`}
          className={`badge tag-badge tag-${folder.color || "muted"}`}
          title={`Abrir pasta ${folder.name}`}
        >
          {folder.name}
        </Link>
      ))}
      {list.length > 4 ? (
        <span className="meta" title={list.map((f) => f.name).join(", ")}>
          +{list.length - 4}
        </span>
      ) : null}
    </div>
  );
}

const periodOptions = [
  { value: "3d", label: "3 dias" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
];

const postMetricOptions = [
  { value: "views", label: "Views" },
  { value: "likes", label: "Curtidas" },
  { value: "comments", label: "Comentários" },
  { value: "shares", label: "Compart." },
  { value: "engagement", label: "Engajamento" },
];

const profileMetricOptions = [
  { value: "followers_absolute", label: "Cresc. absoluto" },
  { value: "followers_percent", label: "Cresc. %" },
];

/** Célula numérica compacta: null vira traço, não "não disponível". */
/** Placeholder ASCII — evita mojibake de em-dash em arquivos com encoding errado. */
const EMPTY = "-";

function cellNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return EMPTY;
  }
  return formatNumber(value);
}

function cellSigned(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return EMPTY;
  }
  return formatSigned(value);
}

function cellPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return EMPTY;
  }
  return formatPercent(value);
}

function cellDate(value: Date | string | null | undefined) {
  if (!value) {
    return EMPTY;
  }
  return formatChartDateTime(value);
}

function cellGrowthSigned(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "sem hist.";
  }
  return formatSigned(value);
}

function cellGrowthPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "sem hist.";
  }
  return formatPercent(value);
}

function metricLabel(type: RankingType, metric: string) {
  const options = type === "posts" ? postMetricOptions : profileMetricOptions;
  return options.find((option) => option.value === metric)?.label ?? metric;
}

export function RankingPanel() {
  const [type, setType] = useState<RankingType>("posts");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [period, setPeriod] = useState("7d");
  const [folderId, setFolderId] = useState("all");
  const [catalog, setCatalog] = useState<FolderRecord[]>([]);
  const [postMetric, setPostMetric] = useState("views");
  const [profileMetric, setProfileMetric] = useState("followers_absolute");
  const [data, setData] = useState<RankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const metric = type === "posts" ? postMetric : profileMetric;
  const currentData = data?.type === type ? data : null;
  const metricOptions = useMemo(
    () => (type === "posts" ? postMetricOptions : profileMetricOptions),
    [type],
  );
  const scoreLabel = metricLabel(type, metric);
  const isInitialLoad = loading && !currentData;
  const isRefreshing = loading && !!currentData;

  useEffect(() => {
    const controller = new AbortController();
    async function loadTags() {
      try {
        const response = await fetch("/api/folders", { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { folders?: FolderRecord[] };
        setCatalog(payload.folders ?? []);
      } catch {
        // catalogo opcional no ranking
      }
    }
    void loadTags();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          type,
          platform,
          period,
          metric,
          limit: "100",
        });
        if (folderId !== "all") {
          params.set("folderId", folderId);
        }
        const response = await fetch(`/api/rankings?${params}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Não foi possível carregar o ranking.");
        }

        setData((await response.json()) as RankingResponse);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Erro ao carregar ranking.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, [type, platform, period, metric, folderId]);

  return (
    <section className="panel ranking-panel">
      <div className="ranking-header">
        <div className="ranking-header-copy">
          <p className="eyebrow">Ranking</p>
          <h2>{type === "posts" ? "Posts recentes" : "Perfis em crescimento"}</h2>
          <p className="meta ranking-hint">
            {type === "posts"
              ? "Período = data real de publicação do reel/vídeo (não a data do scrape). Vídeos fixados antigos não entram em 3/7/30/90 dias."
              : "Período = janela de crescimento medida entre snapshots de seguidores."}
          </p>
        </div>

        <div className="ranking-filters" role="group" aria-label="Filtros do ranking">
          <div className="segmented ranking-type-toggle" aria-label="Tipo de ranking">
            <button
              className={`segment ${type === "posts" ? "active" : ""}`}
              type="button"
              onClick={() => setType("posts")}
            >
              Posts
            </button>
            <button
              className={`segment ${type === "profiles" ? "active" : ""}`}
              type="button"
              onClick={() => setType("profiles")}
            >
              Perfis
            </button>
          </div>
          <label className="ranking-filter-field">
            <span className="ranking-filter-label">Plataforma</span>
            <select
              className="control"
              aria-label="Plataforma"
              value={platform}
              onChange={(event) => setPlatform(event.target.value as PlatformFilter)}
            >
              <option value="all">Todas</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </label>
          <label className="ranking-filter-field">
            <span className="ranking-filter-label">Período</span>
            <select
              className="control"
              aria-label="Período"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ranking-filter-field">
            <span className="ranking-filter-label">Métrica</span>
            <select
              className="control"
              aria-label="Métrica"
              value={metric}
              onChange={(event) =>
                type === "posts"
                  ? setPostMetric(event.target.value)
                  : setProfileMetric(event.target.value)
              }
            >
              {metricOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ranking-filter-field">
            <span className="ranking-filter-label">Pasta</span>
            <select
              className="control"
              aria-label="Pasta"
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
            >
              <option value="all">Todas</option>
              {catalog.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          {isRefreshing ? (
            <span className="ranking-refresh-hint meta" aria-live="polite">
              <RefreshCw size={14} className="spin" />
              Atualizando…
            </span>
          ) : null}
        </div>
      </div>

      {isInitialLoad ? (
        <div className="empty-state ranking-empty">
          <RefreshCw size={18} className="spin" />
          <p>Carregando ranking</p>
        </div>
      ) : error && !currentData ? (
        <div className="empty-state ranking-empty">
          <p className="message error">{error}</p>
        </div>
      ) : currentData && currentData.items.length > 0 ? (
        <div
          className={`table-panel flat ranking-table-wrap${isRefreshing ? " is-refreshing" : ""}`}
        >
          {error ? <p className="message error ranking-inline-error">{error}</p> : null}
          {currentData.type === "posts" ? (
            <PostRankingTable items={currentData.items} metric={metric} scoreLabel={scoreLabel} />
          ) : (
            <ProfileRankingTable
              items={currentData.items}
              metric={metric}
              scoreLabel={scoreLabel}
            />
          )}
        </div>
      ) : (
        <div className="empty-state ranking-empty">
          <Filter size={18} />
          <p>Nenhum item encontrado para {scoreLabel.toLowerCase()}.</p>
        </div>
      )}
    </section>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const label =
    platform === "instagram" || platform === "tiktok" ? PLATFORM_LABELS[platform] : platform;
  return <span className={`badge ${platform}`}>{label}</span>;
}



const postRankingColumns = [
  { key: "views", label: "Views", value: (item: PostRankingItem) => item.views },
  { key: "likes", label: "Curtidas", value: (item: PostRankingItem) => item.likes },
  { key: "comments", label: "Coment.", value: (item: PostRankingItem) => item.comments },
  { key: "shares", label: "Compart.", value: (item: PostRankingItem) => item.shares },
  { key: "engagement", label: "Engaj.", value: (item: PostRankingItem) => item.engagement },
] as const;

function PostRankingTable({
  items,
  metric,
  scoreLabel,
}: {
  items: PostRankingItem[];
  metric: string;
  scoreLabel: string;
}) {
  const secondaryColumns = postRankingColumns.filter((column) => column.key !== metric).slice(0, 3);

  return (
    <div className="table-scroll ranking-scroll">
      <table className="ranking-table ranking-table-posts">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th className="col-post">Post</th>
            <th className="col-profile">Perfil</th>
            <th className="col-folder">Pasta</th>
            <th className="col-score">{scoreLabel}</th>
            {secondaryColumns.map((column) => (
              <th key={column.key} className="col-metric">
                {column.label}
              </th>
            ))}
            <th className="col-date">Publicado</th>
            <th className="col-date">Coletado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const profile = item.profile;
            const profilePlatform = profile?.platform ?? item.platform;
            const caption =
              profilePlatform === "instagram"
                ? cleanInstagramCaption(item.caption)
                : item.caption;
            const captionText = (caption?.trim() || "Post sem legenda").slice(0, 72);
            const postLabel =
              profilePlatform === "instagram" && /\/reel\//i.test(item.url)
                ? "Abrir Reel"
                : profilePlatform === "tiktok"
                  ? "Abrir vídeo"
                  : "Abrir post";

            return (
              <tr key={item.id}>
                <td className="rank-index col-rank">{index + 1}</td>
                <td className="col-post">
                  <a
                    className="strong-link ranking-post-link"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`${postLabel}: ${caption?.trim() || item.url}`}
                    aria-label={`${postLabel}: ${captionText}`}
                  >
                    <span className="ranking-caption">{captionText}</span>
                    <ExternalLink size={13} className="ranking-ext-icon" aria-hidden />
                  </a>
                </td>
                <td className="col-profile">
                  <div className="profile-cell ranking-profile-row">
                    <div className="ranking-profile-main">
                      <div className="ranking-handle-row">
                        {profile?.id ? (
                          <Link
                            className="strong-link ranking-handle"
                            href={`/profiles/${profile.id}`}
                          >
                            @{profile.handle}
                          </Link>
                        ) : (
                          <span className="meta">@indisponível</span>
                        )}
                      </div>
                      <div className="badge-row ranking-badge-row">
                        <PlatformBadge platform={profilePlatform} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="col-folder">
                  <FolderBadges folders={profile?.folders} />
                </td>
                <td className="col-score metric-score">{cellNumber(item.score)}</td>
                {secondaryColumns.map((column) => (
                  <td key={column.key} className="col-metric metric-cell">
                    {cellNumber(column.value(item))}
                  </td>
                ))}
                <td className="meta col-date" title={item.publishedAt ?? undefined}>
                  {item.publishedAt ? cellDate(item.publishedAt) : EMPTY}
                </td>
                <td className="meta col-date" title={item.capturedAt ?? undefined}>
                  {cellDate(item.capturedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProfileRankingTable({
  items,
  metric,
  scoreLabel,
}: {
  items: ProfileRankingItem[];
  metric: string;
  scoreLabel: string;
}) {
  const showAbsoluteGrowth = metric === "followers_percent";

  return (
    <div className="table-scroll ranking-scroll">
      <table className="ranking-table ranking-table-profiles">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th className="col-profile">Perfil</th>
            <th className="col-folder">Pasta</th>
            <th className="col-score">{scoreLabel}</th>
            <th className="col-metric">Seguidores</th>
            <th className="col-metric">{showAbsoluteGrowth ? "Cresc. abs." : "Cresc. %"}</th>
            <th className="col-date">Coleta</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id}>
              <td className="rank-index col-rank">{index + 1}</td>
              <td className="col-profile">
                <div className="profile-cell ranking-profile-row">
                  <div className="ranking-profile-main">
                    <div className="ranking-handle-row">
                      <Link className="strong-link ranking-handle" href={`/profiles/${item.id}`}>
                        @{item.handle}
                      </Link>
                      <OpenOnPlatformButton
                        platform={item.platform}
                        handle={item.handle}
                        url={item.url}
                      />
                    </div>
                    <div className="badge-row ranking-badge-row">
                      <PlatformBadge platform={item.platform} />
                    </div>
                  </div>
                </div>
              </td>
              <td className="col-folder">
                <FolderBadges folders={item.folders} />
              </td>
              <td className="col-score metric-score">
                {metric === "followers_percent"
                  ? cellGrowthPercent(item.score)
                  : cellGrowthSigned(item.score)}
              </td>
              <td className="col-metric metric-cell">{cellNumber(item.followers)}</td>
              <td className="col-metric metric-cell">
                {showAbsoluteGrowth
                  ? cellGrowthSigned(item.growthAbsolute)
                  : cellGrowthPercent(item.growthPercent)}
              </td>
              <td className="meta col-date" title={item.capturedAt ?? undefined}>
                {cellDate(item.capturedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

