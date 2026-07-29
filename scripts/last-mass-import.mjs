import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const p = new PrismaClient();

const recent = await p.profile.findMany({
  where: { createdAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) } },
  orderBy: { createdAt: "asc" },
  select: {
    handle: true,
    platform: true,
    createdAt: true,
    url: true,
  },
});

// cluster por janela de 3 min
const clusters = [];
let current = null;
for (const row of recent) {
  const t = new Date(row.createdAt).getTime();
  if (!current || t - current.end > 3 * 60 * 1000) {
    current = { start: t, end: t, items: [row] };
    clusters.push(current);
  } else {
    current.end = t;
    current.items.push(row);
  }
}

const large = clusters.filter((c) => c.items.length >= 10);
const bySize = [...large].sort((a, b) => b.items.length - a.items.length);
const byTime = [...large].sort((a, b) => b.end - a.end);

function writeCluster(label, cluster, basename) {
  const handles = [...cluster.items]
    .map((i) => `@${i.handle}`)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const outDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const txt = path.join(outDir, `${basename}.txt`);
  const csv = path.join(outDir, `${basename}.csv`);
  fs.writeFileSync(txt, handles.join("\n") + "\n", "utf8");
  fs.writeFileSync(
    csv,
    "platform,handle,url,createdAt\n" +
      [...cluster.items]
        .sort((a, b) => a.handle.localeCompare(b.handle, "pt-BR"))
        .map(
          (i) =>
            `${i.platform},${i.handle},${i.url},${new Date(i.createdAt).toISOString()}`,
        )
        .join("\n") +
      "\n",
    "utf8",
  );
  return {
    label,
    count: cluster.items.length,
    from: new Date(cluster.start).toLocaleString("pt-BR"),
    to: new Date(cluster.end).toLocaleString("pt-BR"),
    byPlatform: cluster.items.reduce((acc, i) => {
      acc[i.platform] = (acc[i.platform] || 0) + 1;
      return acc;
    }, {}),
    txt,
    csv,
    handles,
  };
}

const biggest = writeCluster("Maior importacao em massa", bySize[0], "maior-importacao-massa");
const latest = writeCluster("Ultima importacao (>=10)", byTime[0], "ultima-importacao-massa");

// copy biggest as default "ultima em massa" if user expects the CSV batch
fs.copyFileSync(biggest.txt, path.join(process.cwd(), "tmp", "importacao-massa-handles.txt"));
fs.copyFileSync(biggest.csv, path.join(process.cwd(), "tmp", "importacao-massa-handles.csv"));

console.log(JSON.stringify({ biggest: { ...biggest, handles: undefined }, latest: { ...latest, handles: undefined } }, null, 2));
console.log("\n=== MAIOR (provavel CSV following) —", biggest.count, "@ ===\n");
console.log(biggest.handles.join("\n"));
console.log("\n=== MAIS RECENTE (>=10) —", latest.count, "@ ===\n");
console.log(latest.handles.join("\n"));

await p.$disconnect();
