import Link from "next/link";
import { prisma } from "@/lib/db";
import { CreateCreatorForm } from "@/components/creators/create-creator-form";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const creators = await prisma.creator.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { vaultEntries: true, profileLinks: true, folderLinks: true } } },
  });

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Research Machine</p>
          <h1>Vaults por Creator</h1>
          <p className="lede">Cada Creator tem seu cofre. Selecione quais perfis/pastas ela trackeia. Biblioteca continua igual.</p>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 8 }}>Nova Creator</h2>
        <CreateCreatorForm />
      </section>

      <section className="grid three">
        {creators.map((c) => (
          <Link key={c.id} href={`/creators/${c.id}`} className="panel" style={{ textDecoration: "none" }}>
            <h3>{c.name}</h3>
            <p className="hint">{c._count.vaultEntries} winners no vault • {c._count.profileLinks} perfis + {c._count.folderLinks} pastas trackeadas</p>
            <small className="meta">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</small>
          </Link>
        ))}
        {creators.length === 0 && <div className="panel"><p className="meta">Nenhuma Creator ainda. Crie a primeira (ex: J - Techno girl).</p></div>}
      </section>
    </main>
  );
}
