"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CadastroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Nao foi possivel criar a conta.");
        return;
      }
      // Conta pendente: mostra aviso em vez de entrar.
      if (payload?.pending) {
        setDone(payload?.message ?? "Conta criada. Aguarde a aprovacao.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Erro de rede. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page auth-page">
      <div className="panel auth-card">
        <p className="eyebrow">Biblioteca de Perfis</p>
        <h1>Criar conta</h1>
        <p className="hint">A primeira conta vira admin. As demais aguardam aprovação.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Nome
            <input
              className="input"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Email
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Senha (minimo 8 caracteres)
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          {done ? <p className="hint">{done}</p> : null}
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Criando..." : "Criar conta"}
          </button>
        </form>
        <p className="hint">
          Ja tem conta? <Link href="/login">Entrar</Link>
        </p>
      </div>
    </main>
  );
}
