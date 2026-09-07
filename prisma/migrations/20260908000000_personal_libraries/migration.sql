-- Biblioteca pessoal por usuario (2026-09-08): cada perfil/pasta/creator tem um dono.
-- Linhas existentes vao para a conta mais antiga (o admin). Falha alto se nao
-- houver nenhum usuario (criar conta antes). Aditivo + backfill, sem apagar dados.

-- 1. Colunas novas como NULL para permitir o backfill
ALTER TABLE "Profile" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Folder" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Creator" ADD COLUMN "ownerId" TEXT;

-- 2. Backfill: tudo que existe pertence a conta mais antiga
DO $$
DECLARE
  first_user_id TEXT;
BEGIN
  SELECT id INTO first_user_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;
  IF first_user_id IS NULL THEN
    RAISE EXCEPTION 'Migration bloqueada: crie a conta admin antes (tabela "User" vazia).';
  END IF;
  UPDATE "Profile" SET "ownerId" = first_user_id WHERE "ownerId" IS NULL;
  UPDATE "Folder" SET "ownerId" = first_user_id WHERE "ownerId" IS NULL;
  UPDATE "Creator" SET "ownerId" = first_user_id WHERE "ownerId" IS NULL;
END $$;

-- 3. Trava NOT NULL depois do backfill
ALTER TABLE "Profile" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Folder" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Creator" ALTER COLUMN "ownerId" SET NOT NULL;

-- 4. Unicidade agora e por dono: mesmo @handle pode existir em contas diferentes
DROP INDEX IF EXISTS "Profile_platform_handle_key";
CREATE UNIQUE INDEX "Profile_ownerId_platform_handle_key" ON "Profile"("ownerId", "platform", "handle");

-- 5. Indices por dono
CREATE INDEX IF NOT EXISTS "Profile_ownerId_idx" ON "Profile"("ownerId");
CREATE INDEX IF NOT EXISTS "Folder_ownerId_idx" ON "Folder"("ownerId");
CREATE INDEX IF NOT EXISTS "Creator_ownerId_idx" ON "Creator"("ownerId");

-- 6. FKs (deletar usuario apaga a biblioteca dele; run preserva auditoria)
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Auditoria de quem disparou a coleta (nullable = legado preservado)
ALTER TABLE "ScrapeRun" ADD COLUMN "triggeredById" TEXT;
ALTER TABLE "ScrapeRun" ADD CONSTRAINT "ScrapeRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
