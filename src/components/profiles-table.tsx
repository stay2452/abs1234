"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderOpen, Search } from "lucide-react";
import { DeleteProfileButton } from "@/components/delete-profile-button";
import { PLATFORM_LABELS } from "@/lib/constants";
import {
  formatChartDateTime,
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/format";
import type { FolderRecord } from "@/lib/folders";

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

export type ProfileTableItem = {
  id: string;
  platform: "instagram" | "tiktok";
  handle: string;
  url: string;
  folderIds: string[];
  folderList: Array<{ id: string; name: string; color: string }>;
  notes: string | null;
  status: string;
  followers: number | null;
  growthAbsolute: number | null;
  growthPercent: number | null;
  lastCapturedAt: string | null;
};

export function ProfilesTable({
  profiles,
  folders,
}: {
  profiles: ProfileTableItem[];
  folders: FolderRecord[];
}) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesPlatform = platform === "all" || profile.platform === platform;
      const matchesFolder =
        folderFilter === "all" ||
        (folderFilter === "__none__"
          ? profile.folderIds.length === 0
          : profile.folderIds.includes(folderFilter));
      const matchesQuery =
        !normalized ||
        profile.handle.toLowerCase().includes(normalized) ||
        profile.folderList.some((folder) => folder.name.toLowerCase().includes(normalized)) ||
        (profile.notes ?? "").toLowerCase().includes(normalized);

      return matchesPlatform && matchesFolder && matchesQuery;
    });
  }, [folderFilter, platform, profiles, query]);

  if (profiles.length === 0) {
    return (
      <div className="empty-state">
        <p>Nenhum perfil cadastrado.</p>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="toolbar spaced profiles-table-toolbar">
        <div>
          <p className="eyebrow">Biblioteca</p>
          <h2>Perfis catalogados</h2>
          <p className="meta" style={{ margin: 0 }}>
            {filtered.length} de {profiles.length}
            {folderFilter !== "all" ? " · filtro de pasta ativo" : ""}
          </p>
        </div>
        <div className="toolbar profiles-filters">
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
          <label className="tag-filter-field">
            <FolderOpen size={14} aria-hidden />
            <select
              className="control"
              value={folderFilter}
              onChange={(event) => setFolderFilter(event.target.value)}
              aria-label="Filtrar por pasta"
            >
              <option value="all">Todas as pastas</option>
              <option value="__none__">Sem pasta</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {folders.length > 0 ? (
        <div className="badge-row tag-filter-chips" role="group" aria-label="Atalhos de pasta">
          <button
            type="button"
            className={`badge tag-chip-filter ${folderFilter === "all" ? "active" : ""}`}
            onClick={() => setFolderFilter("all")}
          >
            Todas
          </button>
          <button
            type="button"
            className={`badge tag-chip-filter ${folderFilter === "__none__" ? "active" : ""}`}
            onClick={() => setFolderFilter("__none__")}
          >
            Sem pasta
          </button>
          {folders.slice(0, 12).map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={`badge tag-badge tag-${folder.color} tag-chip-filter ${
                folderFilter === folder.id ? "active" : ""
              }`}
              onClick={() => setFolderFilter(folder.id === folderFilter ? "all" : folder.id)}
            >
              {folder.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="table-panel flat">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Pastas</th>
                <th>Seguidores</th>
                <th>7 dias</th>
                <th>Status</th>
                <th>Coleta</th>
                <th className="col-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state ranking-empty">
                      <p>Nenhum perfil com esse filtro.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((profile) => (
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
                        {profile.folderList.length > 0 ? (
                          profile.folderList.slice(0, 4).map((folder) => (
                            <Link
                              key={folder.id}
                              href={`/folders/${folder.id}`}
                              className={`badge tag-badge tag-${folder.color}`}
                              title={`Abrir pasta ${folder.name}`}
                            >
                              {folder.name}
                            </Link>
                          ))
                        ) : (
                          <span className="meta">—</span>
                        )}
                      </div>
                    </td>
                    <td className="metric-cell">{cellNumber(profile.followers)}</td>
                    <td className="metric-cell">
                      <strong>{cellSigned(profile.growthAbsolute)}</strong>
                      <div className="meta">{cellPercent(profile.growthPercent)}</div>
                    </td>
                    <td>
                      <span className="status">
                        <span
                          className={`status-dot ${
                            profile.status === "active" ? "success" : "warning"
                          }`}
                        />
                        {profile.status === "active" ? "ativo" : "pausado"}
                      </span>
                    </td>
                    <td className="meta" title={profile.lastCapturedAt ?? undefined}>
                      {profile.lastCapturedAt
                        ? formatChartDateTime(profile.lastCapturedAt)
                        : "—"}
                    </td>
                    <td className="col-actions">
                      <div className="table-actions">
                        <DeleteProfileButton id={profile.id} handle={profile.handle} compact />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
