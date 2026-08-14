-- Merge duplicate content before enforcing one URL per profile.
CREATE TEMP TABLE "_post_dedup" ON COMMIT DROP AS
SELECT
    "id" AS "duplicateId",
    FIRST_VALUE("id") OVER (
        PARTITION BY "profileId", "url"
        ORDER BY "createdAt", "id"
    ) AS "survivorId"
FROM "Post";

DELETE FROM "_post_dedup" WHERE "duplicateId" = "survivorId";

UPDATE "PostSnapshot" AS snapshot
SET "postId" = dedup."survivorId"
FROM "_post_dedup" AS dedup
WHERE snapshot."postId" = dedup."duplicateId";

UPDATE "DiscordDelivery" AS delivery
SET "postId" = dedup."survivorId"
FROM "_post_dedup" AS dedup
WHERE delivery."postId" = dedup."duplicateId"
  AND NOT EXISTS (
      SELECT 1
      FROM "DiscordDelivery" AS existing
      WHERE existing."postId" = dedup."survivorId"
        AND existing."configId" = delivery."configId"
  );

DELETE FROM "DiscordDelivery" AS delivery
USING "_post_dedup" AS dedup
WHERE delivery."postId" = dedup."duplicateId";

DELETE FROM "Post" AS post
USING "_post_dedup" AS dedup
WHERE post."id" = dedup."duplicateId";

DROP INDEX IF EXISTS "Post_profileId_url_sourceType_key";
CREATE UNIQUE INDEX "Post_profileId_url_key" ON "Post"("profileId", "url");

-- Preserve scrape telemetry when its profile or session is deleted.
ALTER TABLE "ScrapeAttempt" DROP CONSTRAINT IF EXISTS "ScrapeAttempt_profileId_fkey";
ALTER TABLE "ScrapeAttempt" DROP CONSTRAINT IF EXISTS "ScrapeAttempt_sessionId_fkey";
ALTER TABLE "ScrapeAttempt"
    ADD CONSTRAINT "ScrapeAttempt_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScrapeAttempt"
    ADD CONSTRAINT "ScrapeAttempt_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "BrowserSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
