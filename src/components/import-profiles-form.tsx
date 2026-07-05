"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

type ImportResponse = {
  created: number;
  updated: number;
  totalValid: number;
  profileIds: string[];
  invalid: Array<{ input: string; reason: string }>;
};

type ScrapeResponse =
  | {
      status: string;
      profilesTotal: number;
      profilesOk: number;
      postsFound: number;
      errors: Array<{ handle: string; error: string }>;
    }
  | {
      error: string;
    };

export function ImportProfilesForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<ImportResponse["invalid"]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setInvalid([]);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/profiles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as ImportResponse | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Falha ao importar perfis.");
      }

      const result = payload as ImportResponse;
      setInvalid(result.invalid);

      if (result.profileIds.length === 0) {
        setMessage(`${result.created} criados, ${result.updated} reativados/atualizados.`);
        setText("");
        startTransition(() => router.refresh());
        return;
      }

      setMessage(
        `${result.created} criados, ${result.updated} reativados/atualizados. Coletando dados...`,
      );

      const scrapeResponse = await fetch("/api/scrape/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileIds: result.profileIds }),
      });
      const scrapePayload = (await scrapeResponse.json()) as ScrapeResponse;

      if (!scrapeResponse.ok) {
        throw new Error(
          "error" in scrapePayload
            ? `Perfil cadastrado, mas a coleta falhou: ${scrapePayload.error}`
            : "Perfil cadastrado, mas a coleta falhou.",
        );
      }

      if ("error" in scrapePayload) {
        throw new Error(`Perfil cadastrado, mas a coleta falhou: ${scrapePayload.error}`);
      }

      const failed = scrapePayload.errors.length;
      setMessage(
        `${result.created} criados, ${result.updated} reativados/atualizados. Coleta: ${scrapePayload.profilesOk}/${scrapePayload.profilesTotal} perfis, ${scrapePayload.postsFound} posts encontrados${failed ? `, ${failed} erro(s)` : ""}.`,
      );
      setText("");
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : "Falha ao importar perfis.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <textarea
        className="textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="https://www.instagram.com/perfil/
https://www.tiktok.com/@perfil"
      />
      <button className="button teal" type="submit" disabled={!text.trim() || isPending || isSubmitting}>
        <Upload size={16} />
        {isSubmitting ? "Importando..." : "Importar"}
      </button>
      {message ? <p className="message success">{message}</p> : null}
      {error ? <p className="message error">{error}</p> : null}
      {invalid.length > 0 ? (
        <div className="message error">
          {invalid.map((item) => (
            <div key={`${item.input}-${item.reason}`}>
              {item.input}: {item.reason}
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
