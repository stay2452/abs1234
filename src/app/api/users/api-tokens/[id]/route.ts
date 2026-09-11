import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { revokeApiToken } from "@/lib/api-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Revoga um token pessoal do logado (ex.: perdeu o dispositivo). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser(request, "any");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const revoked = await revokeApiToken(user.id, id);
  if (!revoked) {
    return NextResponse.json({ error: "Token nao encontrado." }, { status: 404 });
  }
  return NextResponse.json({ revoked: true });
}
