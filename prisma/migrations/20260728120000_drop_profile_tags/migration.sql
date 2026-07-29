-- SQLite (driver antigo) nao suporta DROP COLUMN direto até 3.35.
-- Recriar a tabela sem a coluna "tags", preservando indexes e dados.

PRAGMA foreign_keys=OFF;

CREATE TABLE "_Profile_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "_Profile_new" ("id","platform","handle","url","notes","status","createdAt","updatedAt")
SELECT "id","platform","handle","url","notes","status","createdAt","updatedAt" FROM "Profile";

DROP TABLE "Profile";

ALTER TABLE "_Profile_new" RENAME TO "Profile";

CREATE UNIQUE INDEX "Profile_platform_handle_key" ON "Profile"("platform","handle");
CREATE INDEX "Profile_platform_status_idx" ON "Profile"("platform","status");

PRAGMA foreign_key_check;

PRAGMA foreign_keys=ON;