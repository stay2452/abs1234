import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { canAccessOwner, isAdmin, ownerWhere } from "@/lib/ownership";

export type FolderColor =
  | "teal"
  | "rose"
  | "amber"
  | "blue"
  | "pink"
  | "purple"
  | "muted";

export type FolderRecord = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  profileCount?: number;
};

export const FOLDER_COLORS = [
  "teal",
  "rose",
  "amber",
  "blue",
  "pink",
  "purple",
  "muted",
] as const satisfies readonly FolderColor[];

export function isValidFolderColor(color: string): color is FolderColor {
  return (FOLDER_COLORS as readonly string[]).includes(color);
}

export function normalizeFolderName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 60);
}

export async function listFolders(user?: SessionUser | null): Promise<FolderRecord[]> {
  const folders = await prisma.folder.findMany({
    where: { ...ownerWhere(user ?? null) },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { profiles: true } },
    },
  });

  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    description: folder.description,
    profileCount: folder._count.profiles,
  }));
}

export async function createFolder(
  input: {
    name: string;
    color?: string;
    description?: string | null;
  },
  ownerId: string,
) {
  const name = normalizeFolderName(input.name);
  if (!name) {
    throw new Error("Nome da pasta e obrigatorio.");
  }

  const color =
    input.color && isValidFolderColor(input.color) ? input.color : "teal";
  const description = input.description?.trim() || null;

  return prisma.folder.create({
    data: { name, color, description, ownerId },
  });
}

export async function updateFolder(
  id: string,
  input: { name?: string; color?: string; description?: string | null },
  user?: SessionUser | null,
) {
  const data: { name?: string; color?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = normalizeFolderName(input.name);
    if (!name) {
      throw new Error("Nome da pasta invalido.");
    }
    data.name = name;
  }
  if (input.color !== undefined) {
    if (!isValidFolderColor(input.color)) {
      throw new Error("Cor invalida.");
    }
    data.color = input.color;
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  await assertFolderOwner(id, user);
  return prisma.folder.update({ where: { id }, data });
}

export async function deleteFolder(id: string, user?: SessionUser | null) {
  await assertFolderOwner(id, user);
  return prisma.folder.delete({ where: { id } });
}

/** Pasta inexistente ou de outro dono: erro igual a "nao encontrada" (nao vaza). */
async function assertFolderOwner(id: string, user?: SessionUser | null) {
  if (isAdmin(user)) {
    return;
  }
  const folder = await prisma.folder.findUnique({ where: { id }, select: { ownerId: true } });
  if (!folder || !canAccessOwner(user, folder.ownerId)) {
    throw new Error("Pasta nao encontrada.");
  }
}

/** Substitui o conjunto de pastas de um perfil. So vincula pastas do proprio dono. */
export async function setProfileFolders(
  profileId: string,
  folderIds: string[],
  user?: SessionUser | null,
) {
  const uniqueIds = Array.from(new Set(folderIds.filter(Boolean)));

  const folders =
    uniqueIds.length > 0
      ? await prisma.folder.findMany({
          where: { id: { in: uniqueIds }, ...ownerWhere(user ?? null) },
          orderBy: { name: "asc" },
        })
      : [];

  const validIds = folders.map((folder) => folder.id);

  await prisma.$transaction(async (tx) => {
    await tx.profileFolder.deleteMany({ where: { profileId } });
    if (validIds.length > 0) {
      await tx.profileFolder.createMany({
        data: validIds.map((folderId) => ({ profileId, folderId })),
      });
    }
  });

  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    description: folder.description,
  }));
}

/** Adiciona/remove um perfil de uma pasta. So entre itens do proprio dono. */
export async function setProfileInFolder(
  folderId: string,
  profileId: string,
  present: boolean,
  user?: SessionUser | null,
) {
  if (!isAdmin(user)) {
    const [folder, profile] = await Promise.all([
      prisma.folder.findUnique({ where: { id: folderId }, select: { ownerId: true } }),
      prisma.profile.findUnique({ where: { id: profileId }, select: { ownerId: true } }),
    ]);
    if (!folder || !canAccessOwner(user, folder.ownerId)) {
      throw new Error("Pasta nao encontrada.");
    }
    if (!profile || !canAccessOwner(user, profile.ownerId)) {
      throw new Error("Perfil nao encontrado.");
    }
  }
  if (present) {
    await prisma.profileFolder.upsert({
      where: {
        profileId_folderId: { profileId, folderId },
      },
      create: { profileId, folderId },
      update: {},
    });
  } else {
    await prisma.profileFolder.deleteMany({
      where: { profileId, folderId },
    });
  }
}
