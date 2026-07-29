/*
  Warnings:

  - You are about to drop the column `lastOpenedAt` on the `BrowserSession` table. All the data in the column will be lost.
  - You are about to drop the column `proxyUrl` on the `BrowserSession` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ScrapeAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scrapeRunId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "sessionId" TEXT,
    "platform" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsKept" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    CONSTRAINT "ScrapeAttempt_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScrapeAttempt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScrapeAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrowserSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BrowserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'api',
    "provider" TEXT,
    "apiKey" TEXT,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastAttemptedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_BrowserSession" ("apiKey", "createdAt", "id", "kind", "lastUsedAt", "name", "platform", "provider", "status", "storageKey", "updatedAt") SELECT "apiKey", "createdAt", "id", "kind", "lastUsedAt", "name", "platform", "provider", "status", "storageKey", "updatedAt" FROM "BrowserSession";
DROP TABLE "BrowserSession";
ALTER TABLE "new_BrowserSession" RENAME TO "BrowserSession";
CREATE UNIQUE INDEX "BrowserSession_storageKey_key" ON "BrowserSession"("storageKey");
CREATE INDEX "BrowserSession_platform_status_idx" ON "BrowserSession"("platform", "status");
CREATE INDEX "BrowserSession_platform_kind_status_idx" ON "BrowserSession"("platform", "kind", "status");
CREATE TABLE "new_ScrapeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "profilesTotal" INTEGER NOT NULL DEFAULT 0,
    "profilesAttempted" INTEGER NOT NULL DEFAULT 0,
    "profilesOk" INTEGER NOT NULL DEFAULT 0,
    "postsFound" INTEGER NOT NULL DEFAULT 0,
    "requestsMade" INTEGER NOT NULL DEFAULT 0,
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsPersisted" INTEGER NOT NULL DEFAULT 0,
    "estimatedCredits" REAL NOT NULL DEFAULT 0,
    "errorsJson" TEXT
);
INSERT INTO "new_ScrapeRun" ("errorsJson", "finishedAt", "id", "postsFound", "profilesOk", "profilesTotal", "startedAt", "status") SELECT "errorsJson", "finishedAt", "id", "postsFound", "profilesOk", "profilesTotal", "startedAt", "status" FROM "ScrapeRun";
DROP TABLE "ScrapeRun";
ALTER TABLE "new_ScrapeRun" RENAME TO "ScrapeRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ScrapeAttempt_scrapeRunId_startedAt_idx" ON "ScrapeAttempt"("scrapeRunId", "startedAt");

-- CreateIndex
CREATE INDEX "ScrapeAttempt_profileId_startedAt_idx" ON "ScrapeAttempt"("profileId", "startedAt");

-- CreateIndex
CREATE INDEX "ScrapeAttempt_sessionId_startedAt_idx" ON "ScrapeAttempt"("sessionId", "startedAt");
