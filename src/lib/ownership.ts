/**
 * Biblioteca pessoal por usuario (2026-09-08): cada perfil/pasta/creator tem
 * um `ownerId`. Admin enxerga tudo (moderacao/suporte); usuario comum so o
 * proprio. Chaves Apify continuam em pool global gerido pelo admin.
 */
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export function isAdmin(user: SessionUser | null | undefined): boolean {
  return user?.role === "admin";
}

/** Fragmento `where` para tabelas com `ownerId` direto (Profile/Folder/Creator). */
export function ownerWhere(user: SessionUser | null | undefined): { ownerId?: string } {
  if (isAdmin(user) || !user) {
    return {};
  }
  return { ownerId: user.id };
}

/** Fragmento `where` via relacao (ex: Post -> `profile`). */
export function ownedVia(
  relation: string,
  user: SessionUser | null | undefined,
): Record<string, { ownerId?: string }> {
  return { [relation]: ownerWhere(user) };
}

/** Confere dono de um registro carregado com `ownerId`. Admin passa sempre. */
export function canAccessOwner(
  user: SessionUser | null | undefined,
  ownerId: string | null | undefined,
): boolean {
  if (isAdmin(user)) {
    return true;
  }
  return !!user && ownerId === user.id;
}

/** Vault visivel? Inexistente ou alheio = false (rota responde 404 igual). */
export async function isCreatorVisible(
  user: SessionUser | null | undefined,
  creatorId: string,
): Promise<boolean> {
  const creator = await prisma.creator
    .findUnique({ where: { id: creatorId }, select: { ownerId: true } })
    .catch(() => null);
  if (!creator) {
    return false;
  }
  return canAccessOwner(user, creator.ownerId);
}
