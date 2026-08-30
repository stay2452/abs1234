-- AlterTable: add updatedAt to ScrapeRun + index for zombie detection
-- Postgres (Supabase) prod — default CURRENT_TIMESTAMP valid in PG
-- For SQLite dev, manual ALTER via python was used (without default)

ALTER TABLE "ScrapeRun" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ScrapeRun_status_startedAt_idx" ON "ScrapeRun"("status", "startedAt");
