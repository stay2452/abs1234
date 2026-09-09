import { FoldersManager } from "@/components/folders-manager";
import { ImportProfilesForm } from "@/components/import-profiles-form";
import { ProfilesTable, type ProfileTableItem } from "@/components/profiles-table";
import { RunScrapeButton } from "@/components/run-scrape-button";
import { prisma } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { ownerWhere } from "@/lib/ownership";
import { listFolders } from "@/lib/folders";
import { toNumber } from "@/lib/format";
import { getPeriodCutoff, rankProfiles } from "@/lib/rankings";
import { getGrowthSnapshots } from "@/lib/profile-growth";

export const dynamic = "force-dynamic";

async function getProfiles(user: SessionUser | null) {
  const profiles = await prisma.profile.findMany({
    where: { ...ownerWhere(user) },
    orderBy: [{ createdAt: "desc" }],
    include: {
      profileFolders: {
        include: { folder: true },
      },
    },
  });
  // Serie completa de snapshots seria milhares de linhas por navegacao:
  // busca so os pontos necessarios ao crescimento 7d (ate 4/perfil).
  const growthMap = await getGrowthSnapshots(
    profiles.map((profile) => profile.id),
    getPeriodCutoff("7d", new Date()),
  );
  const growth = new Map(
    rankProfiles(
      profiles.map((profile) => ({
        ...profile,
        snapshots: growthMap.get(profile.id) ?? [],
      })),
      "followers_absolute",
      "7d",
      "all",
    ).map((item) => [item.id, item]),
  );

  return profiles.map<ProfileTableItem>((profile) => {
    const latest = growthMap.get(profile.id)?.at(-1);
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
  // Biblioteca pessoal: cada um ve so os proprios (admin ve todos).
  // Cadastro e coleta valem para todo logado, na propria biblioteca.
  const user = await getCurrentUser();
  const [profiles, folders] = await Promise.all([getProfiles(user), listFolders(user)]);

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
