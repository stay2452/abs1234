import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { testDiscordWebhookById } from "@/lib/discord-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  webhookUrl: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
  }

  try {
    const result = await testDiscordWebhookById(id, parsed.data.webhookUrl);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha no teste." },
      { status: 400 },
    );
  }
}
