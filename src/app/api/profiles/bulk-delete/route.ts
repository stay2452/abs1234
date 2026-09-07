import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard, getRequestUser } from "@/lib/auth";
import { ownerWhere } from "@/lib/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bulkDeleteSchema = z.object({
  profileIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: NextRequest) {
  // Apaga biblioteca: so os proprios perfis (admin apaga qualquer).
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const user = await getRequestUser(request);
  const scope = ownerWhere(user);
  const body = await request.json().catch(() => null);
  const parsed = bulkDeleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Selecione de 1 a 100 perfis para remover." }, { status: 400 });
  }

  const profileIds = [...new Set(parsed.data.profileIds)];

  // Verifica quais existem PARA ESSE DONO (id alheio conta como nao encontrado).
  const existing = await prisma.profile.findMany({
    where: { id: { in: profileIds }, ...scope },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((p) => p.id));
  const notFound = profileIds.filter((id) => !existingIds.has(id));

  if (existingIds.size === 0) {
    return NextResponse.json({ error: "Nenhum perfil encontrado." }, { status: 404 });
  }

  const result = await prisma.profile.deleteMany({
    where: { id: { in: Array.from(existingIds) }, ...scope },
  });

  // deleteMany cascade: Post/PostSnapshot/ProfileFolder removidos; ScrapeAttempt.profileId vira SetNull (preserva auditoria)

  return NextResponse.json({
    deleted: result.count,
    notFound: notFound.length,
    notFoundIds: notFound,
  });
}
