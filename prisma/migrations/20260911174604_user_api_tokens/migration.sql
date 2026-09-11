-- Tokens pessoais de API (SaaS): login da extensao por usuario, biblioteca do dono.
CREATE TABLE "public"."ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Chrome extension',
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiToken_userId_idx" ON "public"."ApiToken"("userId");
CREATE INDEX "ApiToken_prefix_idx" ON "public"."ApiToken"("prefix");

ALTER TABLE "public"."ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
