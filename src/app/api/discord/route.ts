import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  POST_METRICS,
  PLATFORMS,
  RANKING_PERIODS,
} from "@/lib/constants";
import {
  createDiscordWebhook,
  listDiscordWebhooks,
} from "@/lib/discord-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
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

export async function GET() {
  const webhooks = await listDiscordWebhooks();
  return NextResponse.json({ webhooks });
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
  }

  try {
    const webhook = await createDiscordWebhook(parsed.data);
    return NextResponse.json(webhook);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar." },
      { status: 400 },
    );
  }
}
