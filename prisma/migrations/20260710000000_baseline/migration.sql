-- Baseline for the local database created before Prisma Migrate was introduced.
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tags" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "BrowserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'api',
    "provider" TEXT,
    "apiKey" TEXT,
    "storageKey" TEXT NOT NULL,
    "proxyUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastOpenedAt" DATETIME,
    "lastUsedAt" DATETIME
);

CREATE TABLE "ProfileSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "followers" REAL,
    "following" REAL,
    "likes" REAL,
    "postsCount" INTEGER,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileSnapshot_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'grid',
    "caption" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PostSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "views" REAL,
    "likes" REAL,
    "comments" REAL,
    "shares" REAL,
    "favorites" REAL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostSnapshot_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "profilesTotal" INTEGER NOT NULL DEFAULT 0,
    "profilesOk" INTEGER NOT NULL DEFAULT 0,
    "postsFound" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT
);

CREATE INDEX "Profile_platform_status_idx" ON "Profile"("platform", "status");
CREATE UNIQUE INDEX "Profile_platform_handle_key" ON "Profile"("platform", "handle");
CREATE UNIQUE INDEX "BrowserSession_storageKey_key" ON "BrowserSession"("storageKey");
CREATE INDEX "BrowserSession_platform_status_idx" ON "BrowserSession"("platform", "status");
CREATE INDEX "BrowserSession_platform_kind_status_idx" ON "BrowserSession"("platform", "kind", "status");
CREATE INDEX "ProfileSnapshot_profileId_capturedAt_idx" ON "ProfileSnapshot"("profileId", "capturedAt");
CREATE INDEX "Post_profileId_platform_sourceType_idx" ON "Post"("profileId", "platform", "sourceType");
CREATE UNIQUE INDEX "Post_profileId_url_sourceType_key" ON "Post"("profileId", "url", "sourceType");
CREATE INDEX "PostSnapshot_postId_capturedAt_idx" ON "PostSnapshot"("postId", "capturedAt");
