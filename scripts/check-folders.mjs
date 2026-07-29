import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const handles = [
  "_geovana.celia",
  "geovana.celia",
  "gabivaleriorj",
  "dolliclarinha",
  "vic.dantasss",
];

for (const h of handles) {
  const prof = await p.profile.findFirst({
    where: { handle: h },
    include: { profileFolders: { include: { folder: true } } },
  });
  console.log(
    h,
    prof
      ? {
          id: prof.id,
          folders: prof.profileFolders.map((pf) => pf.folder.name),
        }
      : "NOT FOUND",
  );
}

const total = await p.profile.count({ where: { status: "active" } });
const withFolder = await p.profileFolder.findMany({
  distinct: ["profileId"],
  select: { profileId: true },
});
const folders = await p.folder.findMany({
  include: { _count: { select: { profiles: true } } },
  orderBy: { name: "asc" },
});
console.log({
  activeProfiles: total,
  profilesWithFolder: withFolder.length,
  folderCounts: folders.map((f) => ({ name: f.name, n: f._count.profiles })),
});

await p.$disconnect();
