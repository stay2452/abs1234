-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'teal',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProfileFolder" (
    "profileId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("profileId", "folderId"),
    CONSTRAINT "ProfileFolder_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileFolder_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Folder_name_idx" ON "Folder"("name");

-- CreateIndex
CREATE INDEX "ProfileFolder_folderId_idx" ON "ProfileFolder"("folderId");

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "ProfileTag";
DROP TABLE IF EXISTS "Tag";
PRAGMA foreign_keys=on;

-- Discord: tagId -> folderId (SQLite 3.25+)
-- Recreate DiscordNotifyConfig to rename column safely
CREATE TABLE "new_DiscordNotifyConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
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
  "id", "webhookUrl", "enabled", "topN", "metric", "period", "platform",
  "folderId", "minViews", "minLikes", "minEngagement", "skipAlreadySent",
  "lastSentAt", "lastError", "lastResultJson", "createdAt", "updatedAt"
)
SELECT
  "id", "webhookUrl", "enabled", "topN", "metric", "period", "platform",
  NULL, "minViews", "minLikes", "minEngagement", "skipAlreadySent",
  "lastSentAt", "lastError", "lastResultJson", "createdAt", "updatedAt"
FROM "DiscordNotifyConfig";

DROP TABLE "DiscordNotifyConfig";
ALTER TABLE "new_DiscordNotifyConfig" RENAME TO "DiscordNotifyConfig";
