import { FoldersManager } from "@/components/folders-manager";
import { ImportProfilesForm } from "@/components/import-profiles-form";
import { ProfilesTable, type ProfileTableItem } from "@/components/profiles-table";
import { RunScrapeButton } from "@/components/run-scrape-button";
import { prisma } from "@/lib/db";
import { listFolders } from "@/lib/folders";
import { toNumber } from "@/lib/format";
import { rankProfiles } from "@/lib/rankings";

export const dynamic = "force-dynamic";

async function getProfiles() {
  const profiles = await prisma.profile.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      snapshots: {
        orderBy: { capturedAt: "asc" },
      },
      profileFolders: {
        include: { folder: true },
      },
    },
  });
  const growth = new Map(
    rankProfiles(profiles, "followers_absolute", "7d", "all").map((item) => [item.id, item]),
  );

  return profiles.map<ProfileTableItem>((profile) => {
    const latest = profile.snapshots.at(-1);
    const growthItem = growth.get(profile.id);
    const folderList = profile.profileFolders
      .map((row) => row.folder)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return {
      id: profile.id,
      platform: profile.platform as "instagram" | "tiktok",
      handle: profile.handle,
      url: profile.url,
      folderIds: folderList.map((folder) => folder.id),
      folderList: folderList.map((folder) => ({
        id: folder.id,
        name: folder.name,
        color: folder.color,
      })),
      notes: profile.notes,
      status: profile.status,
      followers: toNumber(latest?.followers),
      growthAbsolute: growthItem?.growthAbsolute ?? null,
      growthPercent: growthItem?.growthPercent ?? null,
      lastCapturedAt: latest?.capturedAt.toISOString() ?? null,
    };
  });
}

export default async function ProfilesPage() {
  const [profiles, folders] = await Promise.all([getProfiles(), listFolders()]);

  return (
    <main className="page">
      <div className="page-header page-header-dashboard">
        <div className="page-header-copy">
          <p className="eyebrow">Biblioteca</p>
          <h1>Perfis modelados</h1>
          <p className="lede">
            Cadastre perfis, organize em pastas e compare crescimento e métricas entre quem está
            na mesma pasta.
          </p>
        </div>
        <div className="page-header-actions">
          <RunScrapeButton mode="library" profileCount={profiles.length} />
        </div>
      </div>

      <div className="profiles-layout">
        <ProfilesTable profiles={profiles} folders={folders} />
        <div className="profiles-sidebar">
          <aside className="panel">
            <p className="eyebrow">Cadastro</p>
            <h2>Importar perfis</h2>
            <p className="lede" style={{ marginTop: 0 }}>
              Cadastro local + coleta limitada. Depois, abra o perfil e coloque-o nas pastas.
            </p>
            <ImportProfilesForm />
          </aside>
          <FoldersManager initialFolders={folders} />
        </div>
      </div>
    </main>
  );
}
