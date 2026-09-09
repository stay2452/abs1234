"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, ClipboardList, FolderOpen, Library, LogOut, MessageCircle, Settings, Users, Vault } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  admin?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "Ranking", icon: BarChart3 },
  { href: "/profiles", label: "Perfis", icon: Library },
  { href: "/folders", label: "Pastas", icon: FolderOpen },
  { href: "/creators", label: "Vault", icon: Vault },
  { href: "/settings", label: "Sessões", icon: Settings, admin: true },
  { href: "/users", label: "Usuários", icon: Users, admin: true },
  { href: "/history", label: "Auditoria", icon: ClipboardList, admin: true },
  { href: "/discord", label: "Discord", icon: MessageCircle, admin: true },
];

const AUTH_PAGES = ["/login", "/cadastro", "/landing"];

type Me = { id: string; name: string; email: string; role: string } | null;

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);

  useEffect(() => {
    if (me) {
      return;
    }
    if (AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) {
      return;
    }
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setMe(payload))
      .catch(() => setMe(null));
  }, [pathname, me]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setMe(null);
    router.push("/login");
    router.refresh();
  }

  // Telas de conta: sem menu, so o conteudo.
  if (AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) {
    return (
      <div className="app-shell auth-mode">
        <div className="page-enter-root" key={pathname}>
          {children}
        </div>
      </div>
    );
  }

  const isAdmin = me?.role === "admin";
  const visibleItems = navItems.filter((item) => !item.admin || isAdmin);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <Link href="/" className="brand" aria-label="Eye of Zuck">
            <span className="brand-mark" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" width={40} height={40} />
            </span>
            <span className="brand-text">
              Eye of Zuck
              <small>OFM · Viral Intel</small>
            </span>
          </Link>
          <p className="nav-label">Monitorar</p>
          <nav className="nav" aria-label="Navegação principal">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  className={`nav-link ${active ? "active" : ""}`}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="user-box sidebar-user">
            {me ? (
              <span className="user-id">
                <span className="user-avatar" aria-hidden>
                  {me.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="user-meta">
                  <span className="user-name">{me.name}</span>
                  <span className="user-email">{me.email}</span>
                </span>
              </span>
            ) : null}
            <button type="button" className="user-logout" onClick={logout} title="Sair">
              <LogOut size={15} />
              Sair
            </button>
          </div>
        </div>
      </aside>
      <div className="page-enter-root" key={pathname}>
        {children}
      </div>
    </div>
  );
}
