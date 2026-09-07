import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessOwner, ownerWhere } from "@/lib/ownership";
import { CreatorDetailClient } from "@/components/creators/creator-detail-client";

export const dynamic = "force-dynamic";

export default async function CreatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const creator = await prisma.creator.findUnique({ where: { id } });
  if (!creator) return <main className="page"><p>Creator não encontrada</p></main>;
  // Vault alheio: mesma tela de nao encontrada.
  if (!canAccessOwner(user, creator.ownerId)) {
    return <main className="page"><p>Creator não encontrada</p></main>;
  }

  const scope = ownerWhere(user);
  const [allProfiles, allFolders, vaultEntries] = await Promise.all([
    prisma.profile.findMany({ where: { ...scope }, orderBy: { handle: "asc" }, take: 500, select: { id: true, handle: true, platform: true } }),
    prisma.folder.findMany({ where: { ...scope }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.patternVaultEntry.findMany({ where: { creatorId: id }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);

  return <CreatorDetailClient creator={creator} allProfiles={allProfiles} allFolders={allFolders} initialVault={vaultEntries} />;
}
