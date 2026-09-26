import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFolder, FOLDER_COLORS, listFolders } from "@/lib/folders";
import { apiGuard, getRequestUser } from "@/lib/auth";
import { optionsCors, withCors } from "@/lib/extension-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.enum(FOLDER_COLORS).optional(),
  description: z.string().max(240).nullable().optional(),
});

export async function OPTIONS(request: NextRequest) {
  return optionsCors(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  // Pastas (organizacao): qualquer logado.
  const guard = await apiGuard(request);
  if (guard) {
    return withCors(guard, origin);
  }
  const folders = await listFolders(await getRequestUser(request));
  return withCors(NextResponse.json({ folders }), origin);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const guard = await apiGuard(request);
  if (guard) {
    return withCors(guard, origin);
  }
  const user = await getRequestUser(request);
  if (!user) {
    return withCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin);
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return withCors(NextResponse.json({ error: "Dados invalidos para criar pasta." }, { status: 400 }), origin);
  }

  try {
    const folder = await createFolder(parsed.data, user.id);
    return withCors(
      NextResponse.json({
        id: folder.id,
        name: folder.name,
        color: folder.color,
        description: folder.description,
        profileCount: 0,
      }),
      origin,
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "Falha ao criar pasta." },
        { status: 400 },
      ),
      origin,
    );
  }
}
