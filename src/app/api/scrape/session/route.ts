import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCollectorSession,
  deleteCollectorSession,
  listCollectorSessions,
  refreshSessionBalances,
  testCollectorSession,
  updateCollectorSession,
} from "@/lib/scrapers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).max(80),
    provider: z.literal("brightdata").optional(),
    apiKey: z.string().min(1).max(1000),
    platform: z.string().optional(),
  }),
  z.object({
    action: z.literal("test"),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().min(1),
    name: z.string().min(1).max(80).optional(),
    provider: z.literal("brightdata").optional(),
    apiKey: z.string().min(1).max(1000).optional(),
    status: z.enum(["active", "paused"]).optional(),
  }),
  z.object({
    action: z.literal("refresh_balances"),
    id: z.string().min(1).optional(),
  }),
]);

export async function GET() {
  return NextResponse.json(await listCollectorSessions());
}

export async function POST(request: NextRequest) {
  const parsedBody = sessionSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Dados de sessao invalidos." }, { status: 400 });
  }

  try {
    if (parsedBody.data.action === "create") {
      return NextResponse.json(
        await createCollectorSession({
          name: parsedBody.data.name,
          provider: parsedBody.data.provider,
          apiKey: parsedBody.data.apiKey,
        }),
      );
    }

    if (parsedBody.data.action === "test") {
      return NextResponse.json(await testCollectorSession(parsedBody.data.id));
    }

    if (parsedBody.data.action === "delete") {
      return NextResponse.json(await deleteCollectorSession(parsedBody.data.id));
    }

    if (parsedBody.data.action === "refresh_balances") {
      const result = await refreshSessionBalances(parsedBody.data.id);
      const list = await listCollectorSessions();
      return NextResponse.json({ ...result, ...list });
    }

    return NextResponse.json(await updateCollectorSession(parsedBody.data));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar sessao." },
      { status: 400 },
    );
  }
}
