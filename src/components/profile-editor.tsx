"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { DeleteProfileButton } from "@/components/delete-profile-button";
import { FolderPicker } from "@/components/folder-picker";
import type { FolderRecord } from "@/lib/folders";

export function ProfileEditor({
  id,
  handle,
  folderIds,
  notes,
  status,
  availableFolders,
}: {
  id: string;
  handle: string;
  folderIds: string[];
  notes: string | null;
  status: string;
  availableFolders: FolderRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createdFolders, setCreatedFolders] = useState<FolderRecord[]>([]);
  const catalog = useMemo(() => {
    const map = new Map(availableFolders.map((folder) => [folder.id, folder]));
    for (const folder of createdFolders) {
      map.set(folder.id, folder);
    }
    return Array.from(map.values());
  }, [availableFolders, createdFolders]);

  const [selectedIds, setSelectedIds] = useState(folderIds);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [draftStatus, setDraftStatus] = useState(status);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createFolder(name: string): Promise<FolderRecord | null> {
    const response = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (FolderRecord & { error?: string })
      | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? "Falha ao criar pasta.");
    }
    if (!payload?.id) {
      return null;
    }
    setCreatedFolders((prev) =>
      prev.some((folder) => folder.id === payload.id) ? prev : [...prev, payload],
    );
    return payload;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/profiles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderIds: selectedIds,
          notes: draftNotes,
          status: draftStatus,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao salvar.");
      }

      const payload = (await response.json()) as {
        folderList?: FolderRecord[];
      };
      if (payload.folderList) {
        setSelectedIds(payload.folderList.map((folder) => folder.id));
      }

      setMessage(
        selectedIds.length > 0
          ? `Perfil salvo em ${selectedIds.length} pasta(s).`
          : "Perfil salvo.",
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    }
  }

  return (
    <div className="form-stack">
      <form className="form-stack" onSubmit={save}>
        <label className="form-stack">
          <span className="meta">Status</span>
          <select
            className="control"
            value={draftStatus}
            onChange={(event) => setDraftStatus(event.target.value)}
          >
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
          </select>
        </label>

        <div className="form-stack">
          <span className="meta">Pastas</span>
          <p className="meta" style={{ margin: 0 }}>
            Coloque o perfil em pastas para filtrar e comparar com outros da mesma pasta.
          </p>
          <FolderPicker
            available={catalog}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            onCreate={createFolder}
            disabled={isPending}
          />
        </div>

        <label className="form-stack">
          <span className="meta">Notas</span>
          <textarea
            className="textarea"
            value={draftNotes}
            onChange={(event) => setDraftNotes(event.target.value)}
          />
        </label>
        <button className="button teal" type="submit" disabled={isPending}>
          <Save size={16} />
          Salvar
        </button>
        {message ? <p className="message success">{message}</p> : null}
        {error ? <p className="message error">{error}</p> : null}
      </form>

      <div className="import-callout" style={{ marginTop: 4 }}>
        <p className="meta" style={{ margin: "0 0 8px" }}>
          Zona de exclusao
        </p>
        <p className="message" style={{ marginBottom: 10 }}>
          Remove o cadastro local, historico e posts. Nao chama Bright Data.
        </p>
        <DeleteProfileButton id={id} handle={handle} redirectTo="/profiles" />
      </div>
    </div>
  );
}
