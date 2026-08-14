import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASELINE_MIGRATION = "20260710000000_baseline";
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function normalizeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!raw.startsWith("file:")) {
    process.env.DATABASE_URL = `file:${raw}`;
    console.log(`Normalized DATABASE_URL to start with file: prefix.`);
  }
}

function runPrisma(args) {
  execFileSync(process.execPath, [prismaCli, ...args], {
    env: process.env,
    stdio: "inherit",
  });
}

function main() {
  loadEnv();
  normalizeDatabaseUrl();

  // Try to register baseline for pre-existing databases (e.g. Render persistent disk)
  try {
    runPrisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
    console.log("Baseline migration registered.");
  } catch {
    // Baseline already recorded or no existing database; this is fine.
  }

  // Apply pending migrations
  try {
    runPrisma(["migrate", "deploy"]);
  } catch (error) {
    console.warn("Migration deploy failed; falling back to db push.", error?.message || error);
    try {
      runPrisma(["db", "push", "--accept-data-loss"]);
    } catch (pushError) {
      console.error("db push also failed.", pushError?.message || pushError);
      process.exitCode = 1;
    }
  }
}

main();
