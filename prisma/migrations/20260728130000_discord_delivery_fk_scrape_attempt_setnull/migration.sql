-- Bug #3: DiscordDelivery ganha FK + cascade para Post e DiscordNotifyConfig.
-- Bug #33: ScrapeAttempt.profileId muda de Cascade para SetNull (preserva telemetria
-- quando um perfil e deletado).
--
-- SQLite antigo nao suporta ALTER TABLE ADD CONSTRAINT nem ALTER COLUMN,
-- entao recriamos as tabelas envolvidas.

PRAGMA foreign_keys=OFF;

-- =========================================================
-- 1) ScrapeAttempt: profileId de NOT NULL CASCADE -> NULL SET NULL
-- =========================================================

CREATE TABLE "_ScrapeAttempt_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scrapeRunId" TEXT NOT NULL,
    "profileId" TEXT,
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
    FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE,
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL,
    FOREIGN KEY ("sessionId") REFERENCES "BrowserSession"("id") ON DELETE SET NULL
);

INSERT INTO "_ScrapeAttempt_new" ("id","scrapeRunId","profileId","sessionId","platform","datasetId","status","startedAt","finishedAt","recordsReceived","recordsKept","recordsDiscarded","errorCode","errorMessage")
SELECT "id","scrapeRunId","profileId","sessionId","platform","datasetId","status","startedAt","finishedAt","recordsReceived","recordsKept","recordsDiscarded","errorCode","errorMessage" FROM "ScrapeAttempt";

DROP TABLE "ScrapeAttempt";

ALTER TABLE "_ScrapeAttempt_new" RENAME TO "ScrapeAttempt";

CREATE INDEX "ScrapeAttempt_scrapeRunId_startedAt_idx" ON "ScrapeAttempt"("scrapeRunId","startedAt");
CREATE INDEX "ScrapeAttempt_profileId_startedAt_idx" ON "ScrapeAttempt"("profileId","startedAt");
CREATE INDEX "ScrapeAttempt_sessionId_startedAt_idx" ON "ScrapeAttempt"("sessionId","startedAt");

-- =========================================================
-- 2) DiscordDelivery: recria com FK + cascade para Post e DiscordNotifyConfig
-- =========================================================
--
-- Antes as linhas ficavam orfas quando um Post (via Profile cascade) ou um
-- DiscordNotifyConfig era deletado. Agora o BD limpa automaticamente.

CREATE TABLE "_DiscordDelivery_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "metric" TEXT,
    "score" REAL,
    "period" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE,
    FOREIGN KEY ("configId") REFERENCES "DiscordNotifyConfig"("id") ON DELETE CASCADE
);

-- Copia so entregas cujo Post e Config ainda existem (descarta orfaos legados).
INSERT INTO "_DiscordDelivery_new" ("id","postId","configId","metric","score","period","sentAt")
SELECT d."id", d."postId", d."configId", d."metric", d."score", d."period", d."sentAt"
FROM "DiscordDelivery" d
WHERE EXISTS (SELECT 1 FROM "Post" p WHERE p."id" = d."postId")
  AND EXISTS (SELECT 1 FROM "DiscordNotifyConfig" c WHERE c."id" = d."configId");

DROP TABLE "DiscordDelivery";

ALTER TABLE "_DiscordDelivery_new" RENAME TO "DiscordDelivery";

CREATE UNIQUE INDEX "DiscordDelivery_postId_configId_key" ON "DiscordDelivery"("postId","configId");
CREATE INDEX "DiscordDelivery_postId_idx" ON "DiscordDelivery"("postId");
CREATE INDEX "DiscordDelivery_configId_sentAt_idx" ON "DiscordDelivery"("configId","sentAt");
CREATE INDEX "DiscordDelivery_sentAt_idx" ON "DiscordDelivery"("sentAt");

PRAGMA foreign_key_check;

PRAGMA foreign_keys=ON;