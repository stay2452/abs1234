-- CreateTable Creator (Vault por Creator)
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Creator_name_idx" ON "Creator"("name");

-- CreateTable CreatorProfile (perfis trackeados por creator)
CREATE TABLE "CreatorProfile" (
    "creatorId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("creatorId","profileId")
);
CREATE INDEX "CreatorProfile_profileId_idx" ON "CreatorProfile"("profileId");
CREATE INDEX "CreatorProfile_creatorId_idx" ON "CreatorProfile"("creatorId");

-- CreateTable CreatorFolder (pastas trackeadas por creator)
CREATE TABLE "CreatorFolder" (
    "creatorId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorFolder_pkey" PRIMARY KEY ("creatorId","folderId")
);
CREATE INDEX "CreatorFolder_folderId_idx" ON "CreatorFolder"("folderId");
CREATE INDEX "CreatorFolder_creatorId_idx" ON "CreatorFolder"("creatorId");

-- CreateTable PatternVaultEntry (Vault)
CREATE TABLE "PatternVaultEntry" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "sourceProfileId" TEXT,
    "sourcePostId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceHandle" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "views" DOUBLE PRECISION,
    "likes" DOUBLE PRECISION,
    "comments" DOUBLE PRECISION,
    "shares" DOUBLE PRECISION,
    "caption" TEXT,
    "baselineAvg" DOUBLE PRECISION,
    "outlierRatio" DOUBLE PRECISION,
    "isOutlier" BOOLEAN NOT NULL DEFAULT false,
    "commentsRatio" DOUBLE PRECISION,
    "pattern" TEXT,
    "tags" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatternVaultEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PatternVaultEntry_sourcePostId_creatorId_key" ON "PatternVaultEntry"("sourcePostId", "creatorId");
CREATE INDEX "PatternVaultEntry_creatorId_isOutlier_idx" ON "PatternVaultEntry"("creatorId", "isOutlier");
CREATE INDEX "PatternVaultEntry_createdAt_idx" ON "PatternVaultEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorFolder" ADD CONSTRAINT "CreatorFolder_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorFolder" ADD CONSTRAINT "CreatorFolder_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatternVaultEntry" ADD CONSTRAINT "PatternVaultEntry_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatternVaultEntry" ADD CONSTRAINT "PatternVaultEntry_sourceProfileId_fkey" FOREIGN KEY ("sourceProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatternVaultEntry" ADD CONSTRAINT "PatternVaultEntry_sourcePostId_fkey" FOREIGN KEY ("sourcePostId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
