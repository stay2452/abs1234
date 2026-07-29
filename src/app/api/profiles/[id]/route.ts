import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROFILE_STATUS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { setProfileFolders } from "@/lib/folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateProfileSchema = z.object({
  folderIds: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(PROFILE_STATUS).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsedBody = updateProfileSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Dados inválidos para atualizar perfil." }, { status: 400 });
  }

  try {
    const exists = await prisma.profile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 404 });
    }

    let folderList: Array<{
      id: string;
      name: string;
      color: string;
      description: string | null;
    }> | null = null;

    if (parsedBody.data.folderIds) {
      folderList = await setProfileFolders(id, parsedBody.data.folderIds);
    }

    const updated = await prisma.profile.update({
      where: { id },
      data: {
        notes:
          parsedBody.data.notes !== undefined
            ? parsedBody.data.notes?.trim() || null
            : undefined,
        status: parsedBody.data.status,
      },
      include: {
        profileFolders: {
          include: { folder: true },
        },
      },
    });

    const folders =
      folderList ??
      updated.profileFolders
        .map((row) => row.folder)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return NextResponse.json({
      id: updated.id,
      folderIds: folders.map((folder) => folder.id),
      folderList: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        color: folder.color,
        description: folder.description,
      })),
      notes: updated.notes,
      status: updated.status,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const deleted = await prisma.profile.delete({
      where: { id },
      select: {
        id: true,
        handle: true,
        platform: true,
      },
    });

    return NextResponse.json({
      deleted: true,
      id: deleted.id,
      handle: deleted.handle,
      platform: deleted.platform,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 404 });
    }
    throw error;
  }
}
