import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const BASELINE_MIGRATION = "20260710000000_baseline";
const prisma = new PrismaClient();

function runPrisma(args) {
  const command = process.platform === "win32" ? "prisma.cmd" : "prisma";
  execFileSync(command, args, { env: process.env, stdio: "inherit" });
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

  if (markBaseline) {
    console.log(`Registering existing database baseline: ${BASELINE_MIGRATION}`);
    runPrisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
  }

  runPrisma(["migrate", "deploy"]);
}

main().catch((error) => {
  console.error("Database preparation failed.", error);
  process.exitCode = 1;
});
