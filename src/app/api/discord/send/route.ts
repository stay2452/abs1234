import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendDiscordTopPostsAllEnabled } from "@/lib/discord-notify";
import { apiGuard } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  force: z.boolean().optional(),
});

/** Envia tops em todos os webhooks com "enabled" ligado. */
export async function POST(request: NextRequest) {
  // Disparo para o Discord: so admin.
  const guard = await apiGuard(request, "admin");
  if (guard) {
    return guard;
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
  }

  try {
    const result = await sendDiscordTopPostsAllEnabled({
      force: parsed.data.force,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar." },
      { status: 400 },
    );
  }
}
