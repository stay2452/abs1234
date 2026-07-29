-- Bug #30: novo campo Profile.lastPostsScrapeAt para anti-recoleta cobrir
-- perfis cuja coleta so trouxe posts (sem profileSnapshot). Em SQLite antigo,
-- ALTER TABLE ADD COLUMN e suportado (so DROP COLUMN que nao era).

ALTER TABLE "Profile" ADD COLUMN "lastPostsScrapeAt" DATETIME;