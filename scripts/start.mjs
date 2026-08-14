import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASELINE_MIGRATION = "20260710000000_baseline";
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

function loadAndNormalizeEnv() {
  const envPath = resolve(process.cwd(), ".env");
  let normalized = false;

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    const lines = content.split("\n");
    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return line;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key === "DATABASE_URL" && !value.startsWith("file:")) {
        normalized = true;
        return `DATABASE_URL="file:${value}"`;
      }
      return line;
    });

    if (normalized) {
      writeFileSync(envPath, newLines.join("\n"), "utf8");
      console.log("Normalized DATABASE_URL in .env file.");
    }
  }

  // Also set in current process env
  const raw = process.env.DATABASE_URL;
  if (raw && !raw.startsWith("file:")) {
    process.env.DATABASE_URL = `file:${raw}`;
  }
}

function runPrisma(args) {
  execFileSync(process.execPath, [prismaCli, ...args], {
    env: process.env,
    stdio: "inherit",
  });
}

function prepareDatabase() {
  // Try to register baseline for pre-existing databases
  try {
    runPrisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
    console.log("Baseline migration registered.");
  } catch {
    // Already recorded or no existing database
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
      process.exit(1);
    }
  }
}

function startNext() {
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start"], {
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (err) => {
    console.error("Failed to start Next.js:", err);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

// Main
loadAndNormalizeEnv();
prepareDatabase();
startNext();
