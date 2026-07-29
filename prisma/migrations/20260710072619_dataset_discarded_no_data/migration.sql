-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScrapeAttempt" (
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
    "recordsDiscarded" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    CONSTRAINT "ScrapeAttempt_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScrapeAttempt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScrapeAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrowserSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ScrapeAttempt" ("datasetId", "errorCode", "errorMessage", "finishedAt", "id", "platform", "profileId", "recordsKept", "recordsReceived", "scrapeRunId", "sessionId", "startedAt", "status") SELECT "datasetId", "errorCode", "errorMessage", "finishedAt", "id", "platform", "profileId", "recordsKept", "recordsReceived", "scrapeRunId", "sessionId", "startedAt", "status" FROM "ScrapeAttempt";
DROP TABLE "ScrapeAttempt";
ALTER TABLE "new_ScrapeAttempt" RENAME TO "ScrapeAttempt";
CREATE INDEX "ScrapeAttempt_scrapeRunId_startedAt_idx" ON "ScrapeAttempt"("scrapeRunId", "startedAt");
CREATE INDEX "ScrapeAttempt_profileId_startedAt_idx" ON "ScrapeAttempt"("profileId", "startedAt");
CREATE INDEX "ScrapeAttempt_sessionId_startedAt_idx" ON "ScrapeAttempt"("sessionId", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
