import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type GrowthPoint = {
  followers: number;
  capturedAt: Date;
};

/**
 * Busca so os snapshots necessarios para calcular crescimento — no maximo 4
 * por perfil (mais antigo, ultimo antes do corte, primeiro na janela, ultimo) —
 * em vez da serie completa. Resultado identico ao de `rankProfiles` com a serie
 * cheia, com uma fracao do payload (critico em link com RTT alto).
 */
export async function getGrowthSnapshots(
  profileIds: string[],
  cutoff: Date | null,
): Promise<Map<string, GrowthPoint[]>> {
  const map = new Map<string, GrowthPoint[]>();
  if (profileIds.length === 0) {
    return map;
  }

  const farPast = new Date(0);
  const cut = cutoff ?? farPast;
  type Row = { profileId: string; followers: number | null; capturedAt: Date };
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH ranked AS (
      SELECT
        "profileId",
        "followers",
        "capturedAt",
        ROW_NUMBER() OVER (PARTITION BY "profileId" ORDER BY "capturedAt" ASC) AS "ascRn",
        ROW_NUMBER() OVER (PARTITION BY "profileId" ORDER BY "capturedAt" DESC) AS "descRn",
        ROW_NUMBER() OVER (
          PARTITION BY "profileId"
          ORDER BY CASE WHEN "capturedAt" < ${cut} THEN "capturedAt" END DESC NULLS LAST
        ) AS "beforeRn",
        ROW_NUMBER() OVER (
          PARTITION BY "profileId"
          ORDER BY CASE WHEN "capturedAt" >= ${cut} THEN "capturedAt" END ASC NULLS LAST
        ) AS "inRn"
      FROM "ProfileSnapshot"
      WHERE "profileId" IN (${Prisma.join(profileIds)})
        AND "followers" IS NOT NULL
    )
    SELECT "profileId", "followers", "capturedAt"
    FROM ranked
    WHERE "ascRn" = 1 OR "descRn" = 1 OR "beforeRn" = 1 OR "inRn" = 1
  `);

  for (const row of rows) {
    if (row.followers === null) continue;
    const list = map.get(row.profileId) ?? [];
    list.push({ followers: row.followers, capturedAt: new Date(row.capturedAt) });
    map.set(row.profileId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  }
  return map;
}
