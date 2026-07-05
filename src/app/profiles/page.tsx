import { ImportProfilesForm } from "@/components/import-profiles-form";
import { ProfilesTable, type ProfileTableItem } from "@/components/profiles-table";
import { RunScrapeButton } from "@/components/run-scrape-button";
import { prisma } from "@/lib/db";
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
    },
  });
  const growth = new Map(
    rankProfiles(profiles, "followers_absolute", "7d", "all").map((item) => [item.id, item]),
  );

  return profiles.map<ProfileTableItem>((profile) => {
    const latest = profile.snapshots.at(-1);
    const growthItem = growth.get(profile.id);

    return {
      id: profile.id,
      platform: profile.platform as "instagram" | "tiktok",
      handle: profile.handle,
      url: profile.url,
      tags: profile.tags,
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
  const profiles = await getProfiles();

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Biblioteca</p>
          <h1>Perfis modelados</h1>
          <p className="lede">Perfis de referência, tags, notas e histórico.</p>
        </div>
        <RunScrapeButton compact />
      </div>

      <div className="grid two">
        <ProfilesTable profiles={profiles} />
        <aside className="panel">
          <p className="eyebrow">Cadastro</p>
          <h2>Importar URLs</h2>
          <ImportProfilesForm />
        </aside>
      </div>
    </main>
  );
}
