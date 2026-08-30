import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ErrorProfilesPanel } from "@/components/error-profiles-panel";

export const dynamic = "force-dynamic";

export default function ErrorsPage() {
  return (
    <main className="page history-page">
      <div className="page-header">
        <div>
          <Link className="back-link" href="/history"><ArrowLeft size={15} /> Histórico</Link>
          <p className="eyebrow">Auditoria — limpeza</p>
          <h1>Perfis com erro</h1>
          <p className="lede">Últimas 5 coletas com erro de @ mudado ou banido. Selecione e remova em massa.</p>
        </div>
      </div>
      <ErrorProfilesPanel />
    </main>
  );
}
