"use client";

import { useMemo, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import type { FolderRecord } from "@/lib/folders";

type Props = {
  available: FolderRecord[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  onCreate?: (name: string) => Promise<FolderRecord | null>;
  disabled?: boolean;
};

export function FolderPicker({
  available,
  selectedIds,
  onChange,
  onCreate,
  disabled,
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => {
    const map = new Map(available.map((folder) => [folder.id, folder]));
    return selectedIds
      .map((id) => map.get(id))
      .filter((folder): folder is FolderRecord => Boolean(folder));
  }, [available, selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available
      .filter((folder) => !selectedIds.includes(folder.id))
      .filter((folder) => !q || folder.name.toLowerCase().includes(q))
      .slice(0, 24);
  }, [available, query, selectedIds]);

  const canCreate =
    Boolean(onCreate) &&
    query.trim().length > 0 &&
    !available.some((folder) => folder.name.toLowerCase() === query.trim().toLowerCase());

  function toggle(id: string) {
    if (disabled) {
      return;
    }
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  async function handleCreate() {
    if (!onCreate || !canCreate || creating) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate(query.trim());
      if (created) {
        onChange([...selectedIds, created.id]);
        setQuery("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar pasta.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="tag-picker">
      {selected.length > 0 ? (
        <div className="badge-row tag-selected-row">
          {selected.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={`badge tag-badge tag-${folder.color} tag-chip-selected`}
              onClick={() => toggle(folder.id)}
              disabled={disabled}
              title="Remover da pasta"
            >
              {folder.name}
              <X size={12} aria-hidden />
            </button>
          ))}
        </div>
      ) : (
        <p className="meta tag-picker-empty">Nenhuma pasta neste perfil.</p>
      )}

      <div className="tag-picker-search">
        <input
          className="input"
          value={query}
          disabled={disabled}
          placeholder="Buscar ou criar pasta…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canCreate) {
                void handleCreate();
              } else if (filtered[0]) {
                toggle(filtered[0].id);
                setQuery("");
              }
            }
          }}
        />
        {canCreate ? (
          <button
            type="button"
            className="button secondary tag-create-btn"
            disabled={disabled || creating}
            onClick={() => void handleCreate()}
          >
            <FolderPlus size={14} />
            Criar
          </button>
        ) : null}
      </div>

      {filtered.length > 0 ? (
        <div className="badge-row tag-options-row">
          {filtered.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={`badge tag-badge tag-${folder.color} tag-chip-option`}
              onClick={() => {
                toggle(folder.id);
                setQuery("");
              }}
              disabled={disabled}
            >
              {folder.name}
            </button>
          ))}
        </div>
      ) : query.trim() && !canCreate ? (
        <p className="meta">Nenhuma pasta encontrada.</p>
      ) : !query.trim() && available.length === 0 ? (
        <p className="meta">Nenhuma pasta — digite um nome e clique em Criar.</p>
      ) : null}

      {error ? <p className="message error">{error}</p> : null}
    </div>
  );
}
