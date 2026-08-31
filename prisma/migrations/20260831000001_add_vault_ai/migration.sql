-- AlterTable PatternVaultEntry add IA fields for potencial -> winner
ALTER TABLE "PatternVaultEntry" ADD COLUMN "aiStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "PatternVaultEntry" ADD COLUMN "aiResult" TEXT;
ALTER TABLE "PatternVaultEntry" ADD COLUMN "aiRealPct" DOUBLE PRECISION;
ALTER TABLE "PatternVaultEntry" ADD COLUMN "aiGringoPct" DOUBLE PRECISION;
ALTER TABLE "PatternVaultEntry" ADD COLUMN "aiVeredict" TEXT;
ALTER TABLE "PatternVaultEntry" ADD COLUMN "aiMotivo" TEXT;
ALTER TABLE "PatternVaultEntry" ADD COLUMN "aiAnalyzedAt" TIMESTAMP(3);

CREATE INDEX "PatternVaultEntry_creatorId_aiStatus_idx" ON "PatternVaultEntry"("creatorId", "aiStatus");
