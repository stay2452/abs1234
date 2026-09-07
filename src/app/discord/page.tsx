import { AdminGate } from "@/components/admin-gate";
import { DiscordNotifyPanel } from "@/components/discord-notify-panel";
import { listFolders } from "@/lib/folders";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DiscordPage() {
  const folders = await listFolders(await getCurrentUser());

  return (
    <AdminGate>
      <main className="page">
        <div className="page-header">
          <div>
            <p className="eyebrow">Alertas</p>
            <h1>Discord</h1>
            <p className="lede">
              Vários webhooks, vários servidores e canais. Cada um com nome, critérios e dedupe
              próprios — sem gastar crédito Apify.
            </p>
          </div>
        </div>

        <DiscordNotifyPanel folders={folders} />
      </main>
    </AdminGate>
  );
}
