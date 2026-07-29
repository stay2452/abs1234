-- Multi webhook Discord: name, serverLabel, cuid ids

CREATE TABLE "new_DiscordNotifyConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Webhook Discord',
    "serverLabel" TEXT,
    "webhookUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "topN" INTEGER NOT NULL DEFAULT 5,
    "metric" TEXT NOT NULL DEFAULT 'views',
    "period" TEXT NOT NULL DEFAULT '7d',
    "platform" TEXT NOT NULL DEFAULT 'all',
    "folderId" TEXT,
    "minViews" REAL,
    "minLikes" REAL,
    "minEngagement" REAL,
    "skipAlreadySent" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" DATETIME,
    "lastError" TEXT,
    "lastResultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_DiscordNotifyConfig" (
  "id", "name", "serverLabel", "webhookUrl", "enabled", "topN", "metric", "period",
  "platform", "folderId", "minViews", "minLikes", "minEngagement", "skipAlreadySent",
  "lastSentAt", "lastError", "lastResultJson", "createdAt", "updatedAt"
)
SELECT
  CASE WHEN "id" = 'default' THEN 'default' ELSE "id" END,
  CASE WHEN "id" = 'default' THEN 'Webhook principal' ELSE 'Webhook Discord' END,
  NULL,
  "webhookUrl", "enabled", "topN", "metric", "period",
  "platform", "folderId", "minViews", "minLikes", "minEngagement", "skipAlreadySent",
  "lastSentAt", "lastError", "lastResultJson", "createdAt", "updatedAt"
FROM "DiscordNotifyConfig";

DROP TABLE "DiscordNotifyConfig";
ALTER TABLE "new_DiscordNotifyConfig" RENAME TO "DiscordNotifyConfig";

CREATE INDEX "DiscordNotifyConfig_enabled_idx" ON "DiscordNotifyConfig"("enabled");
CREATE INDEX "DiscordNotifyConfig_name_idx" ON "DiscordNotifyConfig"("name");

CREATE TABLE "new_DiscordDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "metric" TEXT,
    "score" REAL,
    "period" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_DiscordDelivery" ("id", "postId", "configId", "metric", "score", "period", "sentAt")
SELECT "id", "postId", "configId", "metric", "score", "period", "sentAt" FROM "DiscordDelivery";

DROP TABLE "DiscordDelivery";
ALTER TABLE "new_DiscordDelivery" RENAME TO "DiscordDelivery";

CREATE UNIQUE INDEX "DiscordDelivery_postId_configId_key" ON "DiscordDelivery"("postId", "configId");
CREATE INDEX "DiscordDelivery_configId_sentAt_idx" ON "DiscordDelivery"("configId", "sentAt");
CREATE INDEX "DiscordDelivery_sentAt_idx" ON "DiscordDelivery"("sentAt");
