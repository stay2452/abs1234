import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const BASELINE_MIGRATION = "20260710000000_baseline";
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const prisma = new PrismaClient();

function runPrisma(args) {
  execFileSync(process.execPath, [prismaCli, ...args], {
    env: process.env,
    stdio: "inherit",
  });
}

async function tableExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    name,
  );
  return rows.length > 0;
}

async function baselineIsRecorded() {
  if (!(await tableExists("_prisma_migrations"))) {
    return false;
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ? LIMIT 1`,
    BASELINE_MIGRATION,
  );
  return rows.length > 0;
}

async function main() {
  let markBaseline = false;

  try {
    // Render may already have a pre-migration SQLite file without migration metadata.
    markBaseline = (await tableExists("Profile")) && !(await baselineIsRecorded());
  } finally {
    await prisma.$disconnect();
  }

  try {
    if (markBaseline) {
      console.log(`Registering existing database baseline: ${BASELINE_MIGRATION}`);
      runPrisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
    }
    runPrisma(["migrate", "deploy"]);
  } catch (error) {
    console.warn("Migration deploy failed; synchronizing the current SQLite schema.", error);
    runPrisma(["db", "push", "--accept-data-loss"]);
  }
}

main().catch((error) => {
  console.error("Database preparation failed.", error);
  process.exitCode = 1;
});
