import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { testDiscordWebhookUrl } from "@/lib/discord-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  webhookUrl: z.string().min(1),
});

/** Teste de URL solta (ex.: antes de salvar um webhook novo). */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe webhookUrl." }, { status: 400 });
  }

  try {
    const result = await testDiscordWebhookUrl(parsed.data.webhookUrl);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha no teste." },
      { status: 400 },
    );
  }
}
