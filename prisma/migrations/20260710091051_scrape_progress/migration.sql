-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScrapeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "profilesTotal" INTEGER NOT NULL DEFAULT 0,
    "profilesAttempted" INTEGER NOT NULL DEFAULT 0,
    "profilesFinished" INTEGER NOT NULL DEFAULT 0,
    "profilesOk" INTEGER NOT NULL DEFAULT 0,
    "postsFound" INTEGER NOT NULL DEFAULT 0,
    "requestsMade" INTEGER NOT NULL DEFAULT 0,
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsPersisted" INTEGER NOT NULL DEFAULT 0,
    "estimatedCredits" REAL NOT NULL DEFAULT 0,
    "currentActivity" TEXT,
    "errorsJson" TEXT
);
INSERT INTO "new_ScrapeRun" ("errorsJson", "estimatedCredits", "finishedAt", "id", "postsFound", "profilesAttempted", "profilesOk", "profilesTotal", "recordsPersisted", "recordsReceived", "requestsMade", "startedAt", "status") SELECT "errorsJson", "estimatedCredits", "finishedAt", "id", "postsFound", "profilesAttempted", "profilesOk", "profilesTotal", "recordsPersisted", "recordsReceived", "requestsMade", "startedAt", "status" FROM "ScrapeRun";
DROP TABLE "ScrapeRun";
ALTER TABLE "new_ScrapeRun" RENAME TO "ScrapeRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
