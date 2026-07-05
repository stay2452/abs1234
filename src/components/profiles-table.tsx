"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatDate, formatNumber, formatPercent, formatSigned, splitTags } from "@/lib/format";

export type ProfileTableItem = {
  id: string;
  platform: "instagram" | "tiktok";
  handle: string;
  url: string;
  tags: string | null;
  notes: string | null;
  status: string;
  followers: number | null;
  growthAbsolute: number | null;
  growthPercent: number | null;
  lastCapturedAt: string | null;
};

export function ProfilesTable({ profiles }: { profiles: ProfileTableItem[] }) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesPlatform = platform === "all" || profile.platform === platform;
      const matchesQuery =
        !normalized ||
        profile.handle.includes(normalized) ||
        (profile.tags ?? "").toLowerCase().includes(normalized) ||
        (profile.notes ?? "").toLowerCase().includes(normalized);

      return matchesPlatform && matchesQuery;
    });
  }, [platform, profiles, query]);

  if (profiles.length === 0) {
    return (
      <div className="empty-state">
        <p>Nenhum perfil cadastrado.</p>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="toolbar spaced">
        <div>
          <p className="eyebrow">Biblioteca</p>
          <h2>Perfis catalogados</h2>
        </div>
        <div className="toolbar">
          <label className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
            />
          </label>
          <select
            className="control"
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            aria-label="Plataforma"
          >
            <option value="all">Todas</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>
      </div>

      <div className="table-panel flat">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Tags</th>
                <th>Seguidores</th>
                <th>7 dias</th>
                <th>Status</th>
                <th>Coleta</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile) => (
                <tr key={profile.id}>
                  <td>
                    <div className="profile-cell">
                      <Link className="strong-link" href={`/profiles/${profile.id}`}>
                        @{profile.handle}
                      </Link>
                      <span className={`badge ${profile.platform}`}>
                        {PLATFORM_LABELS[profile.platform]}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="badge-row">
                      {splitTags(profile.tags).map((tag) => (
                        <span className="badge" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{formatNumber(profile.followers)}</td>
                  <td>
                    <strong>{formatSigned(profile.growthAbsolute)}</strong>
                    <div className="meta">{formatPercent(profile.growthPercent)}</div>
                  </td>
                  <td>
                    <span className="status">
                      <span
                        className={`status-dot ${
                          profile.status === "active"
                            ? "success"
                            : profile.status === "error"
                              ? "error"
                              : "warning"
                        }`}
                      />
                      {profile.status === "active"
                        ? "ativo"
                        : profile.status === "paused"
                          ? "pausado"
                          : "erro"}
                    </span>
                  </td>
                  <td className="meta">{formatDate(profile.lastCapturedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
