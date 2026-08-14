import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const nextBin = require.resolve("next/dist/bin/next");

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireDatabaseEnvironment() {
  const missing = ["DATABASE_URL", "DIRECT_URL"].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required database environment variable(s): ${missing.join(", ")}`);
  }
}

function runPrisma(args) {
  execFileSync(process.execPath, [prismaCli, ...args], {
    env: process.env,
    stdio: "inherit",
  });
}

function migrateDatabase() {
  console.log("Applying PostgreSQL migrations...");
  runPrisma(["migrate", "deploy"]);
}

function startNext() {
  const child = spawn(process.execPath, [nextBin, "start", ...process.argv.slice(2)], {
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error("Failed to start Next.js:", error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

try {
  loadLocalEnv();
  requireDatabaseEnvironment();
  migrateDatabase();
  startNext();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
