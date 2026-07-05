"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

type ScrapeResult = {
  status: string;
  profilesTotal: number;
  profilesOk: number;
  postsFound: number;
  errors?: Array<{ handle: string; error: string }>;
};

export function RunScrapeButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScrape() {
    setIsRunning(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/scrape/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 12 }),
      });
      const payload = (await response.json()) as ScrapeResult | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Falha ao atualizar.");
      }

      const result = payload as ScrapeResult;
      const suffix =
        result.errors && result.errors.length > 0
          ? ` ${result.errors.length} perfil(is) com erro.`
          : "";
      setMessage(
        `${result.profilesOk}/${result.profilesTotal} perfis atualizados, ${result.postsFound} posts encontrados.${suffix}`,
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="form-stack">
      <button
        className={`button teal ${compact ? "secondary" : ""}`}
        type="button"
        onClick={runScrape}
        disabled={isRunning || isPending}
      >
        <RefreshCw size={16} className={isRunning ? "spin" : ""} />
        {isRunning ? "Atualizando" : "Atualizar"}
      </button>
      {message ? <p className="message success">{message}</p> : null}
      {error ? <p className="message error">{error}</p> : null}
    </div>
  );
}
