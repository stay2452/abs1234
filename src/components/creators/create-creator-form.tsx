"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateCreatorForm() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setLoading(false);
    if (res.ok) {
      setName("");
      router.refresh();
    } else {
      alert("Erro ao criar Creator");
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da Creator (ex: J - Techno girl)" style={{ flex: 1 }} />
      <button className="button" disabled={loading || !name.trim()} type="submit">
        Criar Vault
      </button>
    </form>
  );
}
