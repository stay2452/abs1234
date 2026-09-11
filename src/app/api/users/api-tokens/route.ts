import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { issueApiToken, listApiTokens } from "@/lib/api-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista os tokens pessoais do logado (sem nunca expor o texto). */
export async function GET(request: Request) {
  const user = await requireApiUser(request, "any");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ tokens: await listApiTokens(user.id) });
}

/** Emite um token pessoal novo (texto uma unica vez). */
export async function POST(request: Request) {
  const user = await requireApiUser(request, "any");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const name =
    typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Chrome extension";
  const { token, info } = await issueApiToken(user.id, name);
  return NextResponse.json({ token, info }, { status: 201 });
}
