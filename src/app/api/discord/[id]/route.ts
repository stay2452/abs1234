import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  POST_METRICS,
  PLATFORMS,
  RANKING_PERIODS,
} from "@/lib/constants";
import {
  deleteDiscordWebhook,
  getDiscordWebhook,
  updateDiscordWebhook,
} from "@/lib/discord-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  serverLabel: z.string().max(80).nullable().optional(),
  webhookUrl: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  topN: z.number().int().min(1).max(25).optional(),
  metric: z.enum(POST_METRICS).optional(),
  period: z.enum(RANKING_PERIODS).optional(),
  platform: z.union([z.literal("all"), z.enum(PLATFORMS)]).optional(),
  folderId: z.string().nullable().optional(),
  minViews: z.number().nonnegative().nullable().optional(),
  minLikes: z.number().nonnegative().nullable().optional(),
  minEngagement: z.number().nonnegative().nullable().optional(),
  skipAlreadySent: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const webhook = await getDiscordWebhook(id);
  if (!webhook) {
    return NextResponse.json({ error: "Webhook nao encontrado." }, { status: 404 });
  }
  return NextResponse.json(webhook);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
  }

  try {
    const webhook = await updateDiscordWebhook(id, parsed.data);
    return NextResponse.json(webhook);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const result = await deleteDiscordWebhook(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao remover." },
      { status: 404 },
    );
  }
}
