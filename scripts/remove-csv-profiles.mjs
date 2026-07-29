import fs from "fs";
import { PrismaClient } from "@prisma/client";

const CSV_PATH =
  process.argv[2] ||
  "C:\\Users\\192436\\Downloads\\instagram-following-matt.ardz.csv";

const p = new PrismaClient();

function parseCsvUsernames(raw) {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const first = lines[0].toLowerCase();
  const hasHeader =
    first.includes("username") ||
    first.includes("handle") ||
    first.startsWith("user");

  const start = hasHeader ? 1 : 0;
  const handles = [];

  for (let i = start; i < lines.length; i += 1) {
    // username is first column; may be quoted
    let cell = lines[i].split(",")[0] ?? "";
    cell = cell.replace(/^"|"$/g, "").trim().replace(/^@/, "").toLowerCase();
    if (cell && /^[a-z0-9._]{2,30}$/.test(cell)) {
      handles.push(cell);
    }
  }

  return [...new Set(handles)];
}

const raw = fs.readFileSync(CSV_PATH, "utf8");
const handles = parseCsvUsernames(raw);

console.log("CSV:", CSV_PATH);
console.log("Handles no CSV:", handles.length);

const found = await p.profile.findMany({
  where: {
    platform: "instagram",
    handle: { in: handles },
  },
  select: { id: true, handle: true, status: true },
});

console.log("Encontrados no tracker:", found.length);

const foundSet = new Set(found.map((f) => f.handle.toLowerCase()));
const missing = handles.filter((h) => !foundSet.has(h));
console.log("No CSV mas nao no tracker:", missing.length);
if (missing.length > 0 && missing.length <= 30) {
  console.log("  ", missing.map((h) => `@${h}`).join(", "));
}

if (found.length === 0) {
  console.log("Nada a remover.");
  await p.$disconnect();
  process.exit(0);
}

const ids = found.map((f) => f.id);
const CHUNK = 40;
let deleted = 0;
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  const result = await p.profile.deleteMany({
    where: { id: { in: slice } },
  });
  deleted += result.count;
  console.log(`Removidos ${deleted}/${ids.length}...`);
}

const remaining = await p.profile.count({
  where: { platform: "instagram", handle: { in: handles } },
});

console.log("\n=== CONCLUIDO ===");
console.log({
  csvHandles: handles.length,
  deleted,
  stillInTracker: remaining,
  notInTrackerBefore: missing.length,
});

const listPath = new URL("../tmp/removidos-csv-following.txt", import.meta.url);
fs.mkdirSync(new URL("../tmp", import.meta.url), { recursive: true });
fs.writeFileSync(
  listPath,
  found
    .map((f) => `@${f.handle}`)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .join("\n") + "\n",
  "utf8",
);
console.log("Lista salva em tmp/removidos-csv-following.txt");

await p.$disconnect();
