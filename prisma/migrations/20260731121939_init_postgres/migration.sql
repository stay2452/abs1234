-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastPostsScrapeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'teal',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileFolder" (
    "profileId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileFolder_pkey" PRIMARY KEY ("profileId","folderId")
);

-- CreateTable
CREATE TABLE "BrowserSession" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'api',
    "provider" TEXT,
    "apiKey" TEXT,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAttemptedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "creditStatus" TEXT NOT NULL DEFAULT 'unknown',
    "balanceUsd" DOUBLE PRECISION,
    "pendingBalanceUsd" DOUBLE PRECISION,
    "creditsRemaining" DOUBLE PRECISION,
    "creditsSource" TEXT,
    "balanceCheckedAt" TIMESTAMP(3),
    "balanceError" TEXT,

    CONSTRAINT "BrowserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSnapshot" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "followers" DOUBLE PRECISION,
    "following" DOUBLE PRECISION,
    "likes" DOUBLE PRECISION,
    "postsCount" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'grid',
    "caption" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostSnapshot" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "views" DOUBLE PRECISION,
    "likes" DOUBLE PRECISION,
    "comments" DOUBLE PRECISION,
    "shares" DOUBLE PRECISION,
    "favorites" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "profilesTotal" INTEGER NOT NULL DEFAULT 0,
    "profilesAttempted" INTEGER NOT NULL DEFAULT 0,
    "profilesFinished" INTEGER NOT NULL DEFAULT 0,
    "profilesOk" INTEGER NOT NULL DEFAULT 0,
    "postsFound" INTEGER NOT NULL DEFAULT 0,
    "requestsMade" INTEGER NOT NULL DEFAULT 0,
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsPersisted" INTEGER NOT NULL DEFAULT 0,
    "estimatedCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentActivity" TEXT,
    "errorsJson" TEXT,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeAttempt" (
    "id" TEXT NOT NULL,
    "scrapeRunId" TEXT NOT NULL,
    "profileId" TEXT,
    "sessionId" TEXT,
    "platform" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsKept" INTEGER NOT NULL DEFAULT 0,
    "recordsDiscarded" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "ScrapeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordNotifyConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Webhook Discord',
    "serverLabel" TEXT,
    "webhookUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "topN" INTEGER NOT NULL DEFAULT 5,
    "metric" TEXT NOT NULL DEFAULT 'views',
    "period" TEXT NOT NULL DEFAULT '7d',
    "platform" TEXT NOT NULL DEFAULT 'all',
    "folderId" TEXT,
    "minViews" DOUBLE PRECISION,
    "minLikes" DOUBLE PRECISION,
    "minEngagement" DOUBLE PRECISION,
    "skipAlreadySent" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastResultJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordNotifyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordDelivery" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "metric" TEXT,
    "score" DOUBLE PRECISION,
    "period" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Profile_platform_status_idx" ON "Profile"("platform", "status");
CREATE UNIQUE INDEX "Profile_platform_handle_key" ON "Profile"("platform", "handle");
CREATE INDEX "Folder_name_idx" ON "Folder"("name");
CREATE INDEX "ProfileFolder_folderId_idx" ON "ProfileFolder"("folderId");
CREATE UNIQUE INDEX "BrowserSession_storageKey_key" ON "BrowserSession"("storageKey");
CREATE INDEX "BrowserSession_platform_status_idx" ON "BrowserSession"("platform", "status");
CREATE INDEX "BrowserSession_platform_kind_status_idx" ON "BrowserSession"("platform", "kind", "status");
CREATE INDEX "BrowserSession_status_creditStatus_idx" ON "BrowserSession"("status", "creditStatus");
CREATE INDEX "ProfileSnapshot_profileId_capturedAt_idx" ON "ProfileSnapshot"("profileId", "capturedAt");
CREATE INDEX "Post_profileId_platform_sourceType_idx" ON "Post"("profileId", "platform", "sourceType");
CREATE UNIQUE INDEX "Post_profileId_url_sourceType_key" ON "Post"("profileId", "url", "sourceType");
CREATE INDEX "PostSnapshot_postId_capturedAt_idx" ON "PostSnapshot"("postId", "capturedAt");
CREATE INDEX "ScrapeAttempt_scrapeRunId_startedAt_idx" ON "ScrapeAttempt"("scrapeRunId", "startedAt");
CREATE INDEX "ScrapeAttempt_profileId_startedAt_idx" ON "ScrapeAttempt"("profileId", "startedAt");
CREATE INDEX "ScrapeAttempt_sessionId_startedAt_idx" ON "ScrapeAttempt"("sessionId", "startedAt");
CREATE INDEX "DiscordNotifyConfig_enabled_idx" ON "DiscordNotifyConfig"("enabled");
CREATE INDEX "DiscordNotifyConfig_name_idx" ON "DiscordNotifyConfig"("name");
CREATE INDEX "DiscordDelivery_postId_idx" ON "DiscordDelivery"("postId");
CREATE INDEX "DiscordDelivery_configId_sentAt_idx" ON "DiscordDelivery"("configId", "sentAt");
CREATE INDEX "DiscordDelivery_sentAt_idx" ON "DiscordDelivery"("sentAt");
CREATE UNIQUE INDEX "DiscordDelivery_postId_configId_key" ON "DiscordDelivery"("postId", "configId");

-- AddForeignKey
ALTER TABLE "ProfileFolder" ADD CONSTRAINT "ProfileFolder_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileFolder" ADD CONSTRAINT "ProfileFolder_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileSnapshot" ADD CONSTRAINT "ProfileSnapshot_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostSnapshot" ADD CONSTRAINT "PostSnapshot_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrapeAttempt" ADD CONSTRAINT "ScrapeAttempt_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrapeAttempt" ADD CONSTRAINT "ScrapeAttempt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id");
ALTER TABLE "ScrapeAttempt" ADD CONSTRAINT "ScrapeAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrowserSession"("id");
ALTER TABLE "DiscordDelivery" ADD CONSTRAINT "DiscordDelivery_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordDelivery" ADD CONSTRAINT "DiscordDelivery_configId_fkey" FOREIGN KEY ("configId") REFERENCES "DiscordNotifyConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
