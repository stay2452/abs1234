import { DiscordNotifyPanel } from "@/components/discord-notify-panel";
import { listFolders } from "@/lib/folders";

export const dynamic = "force-dynamic";

export default async function DiscordPage() {
  const folders = await listFolders();

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Alertas</p>
          <h1>Discord</h1>
          <p className="lede">
            Vários webhooks, vários servidores e canais. Cada um com nome, critérios e dedupe
            próprios — sem gastar crédito Bright Data.
          </p>
        </div>
      </div>

      <DiscordNotifyPanel folders={folders} />
    </main>
  );
}
