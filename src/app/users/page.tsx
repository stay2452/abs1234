import { AdminGate } from "@/components/admin-gate";
import { UsersPanel } from "@/components/users-panel";

export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <AdminGate>
      <main className="page">
        <div className="page-header">
          <div>
            <p className="eyebrow">Acesso</p>
            <h1>Usuários</h1>
            <p className="lede">
              Conta nova entra pendente e so loga depois da sua aprovação. Desativar tira o
              acesso na hora.
            </p>
          </div>
        </div>

        <UsersPanel />
      </main>
    </AdminGate>
  );
}
