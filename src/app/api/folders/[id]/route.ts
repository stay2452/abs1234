import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGuard, getRequestUser } from "@/lib/auth";
import { canAccessOwner } from "@/lib/ownership";
import {
  deleteFolder,
  FOLDER_COLORS,
  setProfileInFolder,
  updateFolder,
} from "@/lib/folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.enum(FOLDER_COLORS).optional(),
  description: z.string().max(240).nullable().optional(),
});

const membershipSchema = z.object({
  profileId: z.string().min(1),
  present: z.boolean(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Pastas (organizacao): qualquer logado.
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const { id } = await context.params;
  const folder = await prisma.folder.findUnique({
    where: { id },
    include: {
      profiles: {
        include: {
          profile: {
            select: {
              id: true,
              handle: true,
              platform: true,
              url: true,
              status: true,
            },
          },
        },
      },
      _count: { select: { profiles: true } },
    },
  });

  if (!folder) {
    return NextResponse.json({ error: "Pasta nao encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    description: folder.description,
    profileCount: folder._count.profiles,
    profiles: folder.profiles.map((row) => row.profile),
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  // Pastas (organizacao): qualquer logado.
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const user = await getRequestUser(request);
  const body = await request.json().catch(() => null);

  // Membership: { profileId, present }
  const membership = membershipSchema.safeParse(body);
  if (membership.success) {
    try {
      const folder = await prisma.folder.findUnique({
        where: { id },
        select: { id: true, ownerId: true },
      });
      const profile = await prisma.profile.findUnique({
        where: { id: membership.data.profileId },
        select: { id: true, ownerId: true },
      });
      // So vincula pasta e perfil do proprio dono (admin passa).
      if (!folder || !canAccessOwner(user, folder.ownerId)) {
        return NextResponse.json({ error: "Pasta nao encontrada." }, { status: 404 });
      }
      if (!profile || !canAccessOwner(user, profile.ownerId)) {
        return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 404 });
      }
      await setProfileInFolder(id, membership.data.profileId, membership.data.present, user);
      return NextResponse.json({
        ok: true,
        folderId: id,
        profileId: membership.data.profileId,
        present: membership.data.present,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Falha ao atualizar pasta." },
        { status: 400 },
      );
    }
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
  }

  try {
    const folder = await updateFolder(id, parsed.data, user);
    return NextResponse.json({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      description: folder.description,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Pasta nao encontrada." }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Pastas (organizacao): qualquer logado.
  const guard = await apiGuard(request);
  if (guard) {
    return guard;
  }
  const { id } = await context.params;
  try {
    await deleteFolder(id, await getRequestUser(request));
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Pasta nao encontrada." }, { status: 404 });
    }
    throw error;
  }
}
