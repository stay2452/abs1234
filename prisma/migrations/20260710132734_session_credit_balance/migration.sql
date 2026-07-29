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
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "creditStatus" TEXT NOT NULL DEFAULT 'unknown',
    "balanceUsd" REAL,
    "pendingBalanceUsd" REAL,
    "creditsRemaining" REAL,
    "creditsSource" TEXT,
    "balanceCheckedAt" DATETIME,
    "balanceError" TEXT
);
INSERT INTO "new_BrowserSession" ("apiKey", "consecutiveFailures", "createdAt", "id", "kind", "lastAttemptedAt", "lastError", "lastUsedAt", "name", "platform", "provider", "status", "storageKey", "updatedAt") SELECT "apiKey", "consecutiveFailures", "createdAt", "id", "kind", "lastAttemptedAt", "lastError", "lastUsedAt", "name", "platform", "provider", "status", "storageKey", "updatedAt" FROM "BrowserSession";
DROP TABLE "BrowserSession";
ALTER TABLE "new_BrowserSession" RENAME TO "BrowserSession";
CREATE UNIQUE INDEX "BrowserSession_storageKey_key" ON "BrowserSession"("storageKey");
CREATE INDEX "BrowserSession_platform_status_idx" ON "BrowserSession"("platform", "status");
CREATE INDEX "BrowserSession_platform_kind_status_idx" ON "BrowserSession"("platform", "kind", "status");
CREATE INDEX "BrowserSession_status_creditStatus_idx" ON "BrowserSession"("status", "creditStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
