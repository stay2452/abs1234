"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import type { FolderRecord } from "@/lib/folders";
import { FOLDER_COLORS, type FolderColor } from "@/lib/folders";

const COLOR_LABELS: Record<FolderColor, string> = {
  teal: "Verde",
  rose: "Rosa",
  amber: "Âmbar",
  blue: "Azul",
  pink: "Pink",
  purple: "Roxo",
  muted: "Neutro",
};

export function FoldersManager({ initialFolders }: { initialFolders: FolderRecord[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [folders, setFolders] = useState(initialFolders);
  const [name, setName] = useState("");
  const [color, setColor] = useState<FolderColor>("teal");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [folders],
  );

  async function createFolder(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da pasta.");
      return;
    }

    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (FolderRecord & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao criar pasta.");
      }
      if (payload?.id) {
        setFolders((prev) => {
          if (prev.some((folder) => folder.id === payload.id)) {
            return prev;
          }
          return [...prev, { ...payload, profileCount: payload.profileCount ?? 0 }];
        });
        setName("");
        setMessage(`Pasta “${payload.name}” criada.`);
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar pasta.");
    }
  }

  async function removeFolder(folder: FolderRecord) {
    if (
      !window.confirm(
        `Remover a pasta “${folder.name}”? Os perfis continuam na biblioteca; só saem desta pasta.`,
      )
    ) {
      return;
    }

    setBusyId(folder.id);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao remover pasta.");
      }
      setFolders((prev) => prev.filter((item) => item.id !== folder.id));
      setMessage(`Pasta “${folder.name}” removida.`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover pasta.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel folders-section">
      <div>
        <p className="eyebrow">Organização</p>
        <h2>Pastas</h2>
        <p className="meta ranking-hint">
          Crie pastas, coloque perfis e compare crescimento e métricas dentro de cada pasta.
        </p>
      </div>

      <form className="tag-create-form" onSubmit={createFolder}>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nova pasta (ex.: Humor BR)"
          maxLength={60}
          disabled={isPending}
        />
        <select
          className="control"
          value={color}
          onChange={(event) => setColor(event.target.value as FolderColor)}
          aria-label="Cor da pasta"
          disabled={isPending}
        >
          {FOLDER_COLORS.map((item) => (
            <option key={item} value={item}>
              {COLOR_LABELS[item]}
            </option>
          ))}
        </select>
        <button className="button teal" type="submit" disabled={isPending}>
          <Plus size={16} />
          Criar
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="meta" style={{ margin: 0 }}>
          Nenhuma pasta ainda. Crie a primeira acima.
        </p>
      ) : (
        <div className="tag-catalog-list">
          {sorted.map((folder) => (
            <div key={folder.id} className="tag-catalog-row">
              <Link
                href={`/folders/${folder.id}`}
                className={`badge tag-badge tag-${folder.color}`}
                style={{ textDecoration: "none" }}
              >
                <FolderOpen size={12} aria-hidden />
                {folder.name}
                <span className="tag-default-mark">
                  {folder.profileCount ?? 0} perfil(is)
                </span>
              </Link>
              <button
                type="button"
                className="button ghost tag-delete-btn"
                onClick={() => void removeFolder(folder)}
                disabled={busyId === folder.id || isPending}
                title="Remover pasta"
                aria-label={`Remover pasta ${folder.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {message ? <p className="message success">{message}</p> : null}
      {error ? <p className="message error">{error}</p> : null}
    </section>
  );
}
