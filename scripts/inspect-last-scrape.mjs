import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const r = await p.scrapeRun.findFirst({ orderBy: { startedAt: "desc" } });
if (!r) {
  console.log("Nenhum scrape run.");
  await p.$disconnect();
  process.exit(0);
}

const durationMs =
  r.finishedAt && r.startedAt
    ? new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()
    : null;
const durationMin = durationMs != null ? Math.round(durationMs / 60000) : null;

console.log("=== ULTIMA PUXADA ===");
console.log({
  id: r.id,
  status: r.status,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  durationMin,
  profilesTotal: r.profilesTotal,
  profilesAttempted: r.profilesAttempted,
  profilesFinished: r.profilesFinished,
  profilesOk: r.profilesOk,
  postsFound: r.postsFound,
  requestsMade: r.requestsMade,
  recordsReceived: r.recordsReceived,
  recordsPersisted: r.recordsPersisted,
  activity: r.currentActivity,
});

const errs = r.errorsJson ? JSON.parse(r.errorsJson) : [];
console.log("\n=== ERROS (agrupados) ===");
console.log("total erros no resumo:", errs.length);
const byCode = {};
const bySession = {};
const byMsg = {};
for (const e of errs) {
  const code = e.errorCode || "unknown";
  byCode[code] = (byCode[code] || 0) + 1;
  const sn = e.sessionName || e.sessionId || "(sem sessao)";
  bySession[sn] = (bySession[sn] || 0) + 1;
  const msg = String(e.error || "").slice(0, 120);
  byMsg[msg] = (byMsg[msg] || 0) + 1;
}
console.log("por errorCode:", byCode);
console.log(
  "por chave (session):",
  Object.entries(bySession)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25),
);
console.log(
  "por mensagem:",
  Object.entries(byMsg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10),
);

const attempts = await p.scrapeAttempt.findMany({
  where: { scrapeRunId: r.id },
});
console.log("\n=== ATTEMPTS (datasets) ===");
console.log("total attempts:", attempts.length);
const attByStatus = {};
const attByCode = {};
const attByDataset = {};
let successAttempts = 0;
for (const a of attempts) {
  attByStatus[a.status] = (attByStatus[a.status] || 0) + 1;
  const c = a.errorCode || (a.status === "success" ? "ok" : "none");
  attByCode[c] = (attByCode[c] || 0) + 1;
  attByDataset[a.datasetId] = (attByDataset[a.datasetId] || 0) + 1;
  if (a.status === "success" || a.status === "no_data") successAttempts += 1;
}
console.log("por status:", attByStatus);
console.log("por errorCode:", attByCode);
console.log("por dataset:", attByDataset);
console.log("attempts ok/no_data:", successAttempts);

// quantas chaves distintas foram usadas
const sessionIds = new Set(attempts.map((a) => a.sessionId).filter(Boolean));
console.log("chaves distintas nos attempts:", sessionIds.size);

// sample of unique error messages from attempts
const msgSet = {};
for (const a of attempts) {
  if (!a.errorMessage) continue;
  const m = a.errorMessage.slice(0, 140);
  msgSet[m] = (msgSet[m] || 0) + 1;
}
console.log(
  "\nmensagens de attempt (top):",
  Object.entries(msgSet)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12),
);

console.log("\n=== AMOSTRA DE ERROS (10) ===");
console.log(JSON.stringify(errs.slice(0, 10), null, 2));

await p.$disconnect();
