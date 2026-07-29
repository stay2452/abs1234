import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const databasePath = join(process.cwd(), "prisma", "dev.db");
const backupsPath = join(process.cwd(), "prisma", "backups");

try {
  await stat(databasePath);
  await mkdir(backupsPath, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  await copyFile(databasePath, join(backupsPath, `dev-${stamp}.db`));
  console.log("Backup local do SQLite criado antes da migration.");
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    console.log("Banco SQLite ainda nao existe; nenhuma copia foi necessaria.");
  } else {
    throw error;
  }
}
