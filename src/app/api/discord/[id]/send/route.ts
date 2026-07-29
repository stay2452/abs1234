import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendDiscordTopPostsForConfig } from "@/lib/discord-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  force: z.boolean().optional(),
  ignoreEnabled: z.boolean().optional(),
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
    const result = await sendDiscordTopPostsForConfig(id, {
      force: parsed.data.force,
      ignoreEnabled: parsed.data.ignoreEnabled ?? true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar." },
      { status: 400 },
    );
  }
}
