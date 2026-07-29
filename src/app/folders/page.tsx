import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { FoldersManager } from "@/components/folders-manager";
import { listFolders } from "@/lib/folders";

export const dynamic = "force-dynamic";

export default async function FoldersPage() {
  const folders = await listFolders();

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Organização</p>
          <h1>Pastas</h1>
          <p className="lede">
            Agrupe perfis por nicho, campanha ou teste A/B. Abra uma pasta para comparar
            seguidores, crescimento e melhor post.
          </p>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <p className="eyebrow">Biblioteca de pastas</p>
          <h2>{folders.length} pasta(s)</h2>
          {folders.length === 0 ? (
            <div className="empty-state ranking-empty">
              <p>Crie a primeira pasta ao lado.</p>
            </div>
          ) : (
            <div className="folder-grid">
              {folders.map((folder) => (
                <Link key={folder.id} href={`/folders/${folder.id}`} className="folder-card">
                  <span className={`badge tag-badge tag-${folder.color}`}>
                    <FolderOpen size={14} aria-hidden />
                    {folder.name}
                  </span>
                  <strong>{folder.profileCount ?? 0}</strong>
                  <span className="meta">perfil(is)</span>
                  {folder.description ? (
                    <p className="meta" style={{ margin: "6px 0 0" }}>
                      {folder.description}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </section>
        <FoldersManager initialFolders={folders} />
      </div>
    </main>
  );
}
