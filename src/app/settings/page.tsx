import { SessionControls } from "@/components/session-controls";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Coletores</p>
          <h1>Chaves globais</h1>
          <p className="lede">
            IG-only Apify: cada token Apify roda os 3 actors (profile + 5 grade + 5 reels).
            Pool por crédito — só entram nos workers as chaves com crédito.
          </p>
        </div>
      </div>

      <SessionControls />
    </main>
  );
}
