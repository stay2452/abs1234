"use client";

import { useEffect, useState } from "react";

type ListedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export function UsersPanel() {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function fetchUsers(): Promise<ListedUser[]> {
    const response = await fetch("/api/users");
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.users) {
      throw new Error(payload?.error ?? "Nao foi possivel carregar.");
    }
    return payload.users as ListedUser[];
  }

  async function load() {
    try {
      setUsers(await fetchUsers());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro de rede.");
    }
  }

  useEffect(() => {
    let current = true;
    void fetchUsers()
      .then((list) => {
        if (current) {
          setUsers(list);
        }
      })
      .catch(() => {
        if (current) {
          setMessage("Nao foi possivel carregar.");
        }
      });

    return () => {
      current = false;
    };
  }, []);

  async function patch(id: string, body: { isActive?: boolean; role?: string }) {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.error ?? "Falha ao salvar.");
        return;
      }
      await load();
    } catch {
      setMessage("Erro de rede.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = users.filter((user) => !user.isActive);

  return (
    <div>
      {message ? <p className="auth-error">{message}</p> : null}
      {pending.length > 0 ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Aguardando aprovacao ({pending.length})</p>
          {pending.map((user) => (
            <div className="session-row" key={user.id}>
              <div className="session-main">
                <strong>{user.name}</strong>
                <div className="session-meta">
                  <span>{user.email}</span>
                </div>
              </div>
              <div className="session-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busyId === user.id}
                  onClick={() => void patch(user.id, { isActive: true })}
                >
                  Aprovar
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="panel">
        <p className="eyebrow">Todas as contas ({users.length})</p>
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Papel</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                  </td>
                  <td>{user.email}</td>
                  <td>{user.role === "admin" ? "admin" : "usuário"}</td>
                  <td>{user.isActive ? "ativa" : "pendente"}</td>
                  <td>
                    <div className="toolbar">
                      {!user.isActive ? (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busyId === user.id}
                          onClick={() => void patch(user.id, { isActive: true })}
                        >
                          Aprovar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busyId === user.id}
                          onClick={() => void patch(user.id, { isActive: false })}
                        >
                          Desativar
                        </button>
                      )}
                      {user.role === "admin" ? (
                        <button
                          type="button"
                          className="button ghost"
                          disabled={busyId === user.id}
                          onClick={() => void patch(user.id, { role: "user" })}
                        >
                          Virar usuário
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button ghost"
                          disabled={busyId === user.id}
                          onClick={() => void patch(user.id, { role: "admin" })}
                        >
                          Virar admin
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 ? <div className="empty-state">Nenhuma conta.</div> : null}
        </div>
      </section>
    </div>
  );
}
