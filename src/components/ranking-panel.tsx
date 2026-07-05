"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Filter, RefreshCw } from "lucide-react";
import { PLATFORM_LABELS, type Platform } from "@/lib/constants";
import { formatDate, formatNumber, formatPercent, formatSigned, splitTags } from "@/lib/format";
import { cleanInstagramCaption } from "@/lib/instagram-caption";
import type { PostRankingItem, ProfileRankingItem } from "@/lib/rankings";

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

const periodOptions = [
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

function metricLabel(type: RankingType, metric: string) {
  const options = type === "posts" ? postMetricOptions : profileMetricOptions;
  return options.find((option) => option.value === metric)?.label ?? metric;
}

export function RankingPanel() {
  const [type, setType] = useState<RankingType>("posts");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [period, setPeriod] = useState("7d");
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
          limit: "25",
        });
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
  }, [type, platform, period, metric]);

  return (
    <section className="panel">
      <div className="toolbar spaced">
        <div>
          <p className="eyebrow">Ranking</p>
          <h2>{type === "posts" ? "Posts recentes" : "Perfis em crescimento"}</h2>
        </div>
        <div className="toolbar">
          <div className="segmented" aria-label="Tipo de ranking">
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
        </div>
      </div>

      {loading || (!error && !currentData) ? (
        <div className="empty-state">
          <RefreshCw size={18} className="spin" />
          <p>Carregando ranking</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <p className="message error">{error}</p>
        </div>
      ) : currentData && currentData.items.length > 0 ? (
        <div className="table-panel flat">
          {currentData.type === "posts" ? (
            <PostRankingTable items={currentData.items} metric={metric} />
          ) : (
            <ProfileRankingTable
              items={currentData.items}
              metric={metric}
            />
          )}
        </div>
      ) : (
        <div className="empty-state">
          <Filter size={18} />
          <p>Nenhum item encontrado para {metricLabel(type, metric).toLowerCase()}.</p>
        </div>
      )}
    </section>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const label = platform === "instagram" || platform === "tiktok" ? PLATFORM_LABELS[platform] : platform;
  return <span className={`badge ${platform}`}>{label}</span>;
}

function TagBadges({ tags }: { tags: string | null }) {
  const parsed = splitTags(tags);
  if (parsed.length === 0) {
    return null;
  }

  return (
    <span className="badge-row">
      {parsed.slice(0, 3).map((tag) => (
        <span className="badge" key={tag}>
          {tag}
        </span>
      ))}
    </span>
  );
}

function PostRankingTable({ items, metric }: { items: PostRankingItem[]; metric: string }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Post</th>
            <th>Perfil</th>
            <th>{metricLabel("posts", metric)}</th>
            <th>Views</th>
            <th>Curtidas</th>
            <th>Comentários</th>
            <th>Coleta</th>
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

            return (
              <tr key={item.id}>
                <td className="rank-index">{index + 1}</td>
                <td>
                  <a className="strong-link" href={item.url} target="_blank" rel="noreferrer">
                    {caption?.slice(0, 76) || "Post sem legenda"}
                    <ExternalLink size={13} />
                  </a>
                  <div className="meta">{item.publishedAt ? formatDate(item.publishedAt) : "sem data"}</div>
                </td>
                <td>
                  <div className="profile-cell">
                    {profile?.id ? (
                      <Link className="strong-link" href={`/profiles/${profile.id}`}>
                        @{profile.handle}
                      </Link>
                    ) : (
                      <span className="strong-link">@perfil indisponivel</span>
                    )}
                    <div className="badge-row">
                      <PlatformBadge platform={profilePlatform} />
                      <TagBadges tags={profile?.tags ?? null} />
                    </div>
                  </div>
                </td>
                <td className="strong-link">{formatNumber(item.score)}</td>
                <td>{formatNumber(item.views)}</td>
                <td>{formatNumber(item.likes)}</td>
                <td>{formatNumber(item.comments)}</td>
                <td className="meta">{formatDate(item.capturedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProfileRankingTable({ items, metric }: { items: ProfileRankingItem[]; metric: string }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Perfil</th>
            <th>{metricLabel("profiles", metric)}</th>
            <th>Seguidores</th>
            <th>Cresc. absoluto</th>
            <th>Cresc. %</th>
            <th>Coleta</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id}>
              <td className="rank-index">{index + 1}</td>
              <td>
                <div className="profile-cell">
                  <Link className="strong-link" href={`/profiles/${item.id}`}>
                    @{item.handle}
                  </Link>
                  <div className="badge-row">
                    <PlatformBadge platform={item.platform} />
                    <TagBadges tags={item.tags} />
                  </div>
                </div>
              </td>
              <td className="strong-link">
                {metric === "followers_percent" ? formatPercent(item.score) : formatSigned(item.score)}
              </td>
              <td>{formatNumber(item.followers)}</td>
              <td>{formatSigned(item.growthAbsolute)}</td>
              <td>{formatPercent(item.growthPercent)}</td>
              <td className="meta">{formatDate(item.capturedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
