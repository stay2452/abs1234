import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROFILE_STATUS } from "@/lib/constants";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateProfileSchema = z.object({
  tags: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(PROFILE_STATUS).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsedBody = updateProfileSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Dados inválidos para atualizar perfil." }, { status: 400 });
  }

  const updated = await prisma.profile.update({
    where: { id },
    data: {
      tags: parsedBody.data.tags?.trim() || null,
      notes: parsedBody.data.notes?.trim() || null,
      status: parsedBody.data.status,
    },
  });

  return NextResponse.json({
    id: updated.id,
    tags: updated.tags,
    notes: updated.notes,
    status: updated.status,
  });
}
