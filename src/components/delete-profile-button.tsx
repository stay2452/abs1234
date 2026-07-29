"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteProfileButton({
  id,
  handle,
  compact = false,
  redirectTo,
}: {
  id: string;
  handle: string;
  compact?: boolean;
  /** Se definido, navega apos excluir (ex.: lista de perfis). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeProfile() {
    const confirmed = window.confirm(
      `Excluir @${handle}?\n\nIsso remove o perfil, o historico de crescimento, posts e metricas salvos localmente. Nao gasta credito Bright Data.`,
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; deleted?: boolean }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao excluir perfil.");
      }

      startTransition(() => {
        if (redirectTo) {
          router.push(redirectTo);
        }
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir perfil.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="form-stack">
      <button
        className="button danger"
        type="button"
        onClick={() => void removeProfile()}
        disabled={isDeleting || isPending}
        title={`Excluir @${handle}`}
      >
        <Trash2 size={16} />
        {isDeleting || isPending ? "Excluindo..." : compact ? "Excluir" : "Excluir perfil"}
      </button>
      {error ? <p className="message error">{error}</p> : null}
    </div>
  );
}
