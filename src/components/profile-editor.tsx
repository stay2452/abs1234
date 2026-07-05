"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

export function ProfileEditor({
  id,
  tags,
  notes,
  status,
}: {
  id: string;
  tags: string | null;
  notes: string | null;
  status: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draftTags, setDraftTags] = useState(tags ?? "");
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [draftStatus, setDraftStatus] = useState(status);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/profiles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: draftTags,
          notes: draftNotes,
          status: draftStatus,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao salvar.");
      }

      setMessage("Perfil salvo.");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    }
  }

  return (
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
          <option value="error">Erro</option>
        </select>
      </label>
      <label className="form-stack">
        <span className="meta">Tags</span>
        <input
          className="input"
          value={draftTags}
          onChange={(event) => setDraftTags(event.target.value)}
          placeholder="gancho, formato, tema"
        />
      </label>
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
  );
}
