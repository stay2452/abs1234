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
            Sem divisão Instagram/TikTok: cada chave Bright Data serve as duas plataformas.
            Veja boas e ruins e deixe só as boas ativas nos workers.
          </p>
        </div>
      </div>

      <SessionControls />
    </main>
  );
}
