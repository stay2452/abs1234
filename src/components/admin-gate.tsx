import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

/**
 * Porteira visual das paginas admin (chaves, auditoria, Discord).
 * A protecao REAL esta nas API routes (apiGuard); aqui e UX:
 * quem nao e admin ve aviso em vez de botoes que dariam 403.
 */
export async function AdminGate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <main className="page">
        <div className="panel">
          <p className="eyebrow">Restrito</p>
          <h1>So o admin acessa aqui</h1>
          <p className="lede">
            Essa area mexe com chaves Apify, coletas e credito. Fale com o administrador.
          </p>
          <Link className="button secondary" href="/">
            Voltar ao ranking
          </Link>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
