import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFolder, FOLDER_COLORS, listFolders } from "@/lib/folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.enum(FOLDER_COLORS).optional(),
  description: z.string().max(240).nullable().optional(),
});

export async function GET() {
  const folders = await listFolders();
  return NextResponse.json({ folders });
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos para criar pasta." }, { status: 400 });
  }

  try {
    const folder = await createFolder(parsed.data);
    return NextResponse.json({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      description: folder.description,
      profileCount: 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar pasta." },
      { status: 400 },
    );
  }
}
