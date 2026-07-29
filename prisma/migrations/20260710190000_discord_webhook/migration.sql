-- CreateTable
CREATE TABLE "DiscordNotifyConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "webhookUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "topN" INTEGER NOT NULL DEFAULT 5,
    "metric" TEXT NOT NULL DEFAULT 'views',
    "period" TEXT NOT NULL DEFAULT '7d',
    "platform" TEXT NOT NULL DEFAULT 'all',
    "tagId" TEXT,
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

-- CreateTable
CREATE TABLE "DiscordDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "configId" TEXT NOT NULL DEFAULT 'default',
    "metric" TEXT,
    "score" REAL,
    "period" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordDelivery_postId_configId_key" ON "DiscordDelivery"("postId", "configId");

-- CreateIndex
CREATE INDEX "DiscordDelivery_sentAt_idx" ON "DiscordDelivery"("sentAt");
