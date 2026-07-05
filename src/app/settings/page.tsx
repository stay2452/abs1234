import { SessionControls } from "@/components/session-controls";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Coletores</p>
          <h1>Sessoes isoladas</h1>
          <p className="lede">Sessoes ativas entram no pool que processa as coletas.</p>
        </div>
      </div>

      <SessionControls />
    </main>
  );
}
