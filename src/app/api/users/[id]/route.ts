import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard, getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["admin", "user"]).optional(),
});

/** Aprovar/desativar/trocar papel: so admin. Nao mexe em si mesmo. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request, "admin");
  if (guard) {
    return guard;
  }
  const me = await getRequestUser(request);
  const { id } = await context.params;
  if (me && me.id === id) {
    return NextResponse.json(
      { error: "Voce nao pode alterar a propria conta." },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.isActive === undefined && !parsed.data.role)) {
    return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Conta nao encontrada." }, { status: 404 });
  }
}
