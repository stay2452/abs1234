"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, ClipboardList, FolderOpen, Library, LogOut, MessageCircle, Settings, Sparkles, Users } from "lucide-react";

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
  { href: "/creators", label: "Vaults", icon: Sparkles },
  { href: "/settings", label: "Sessões", icon: Settings, admin: true },
  { href: "/users", label: "Usuários", icon: Users, admin: true },
  { href: "/history", label: "Auditoria", icon: ClipboardList, admin: true },
  { href: "/discord", label: "Discord", icon: MessageCircle, admin: true },
];

const AUTH_PAGES = ["/login", "/cadastro"];

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
    if (AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) {
      return;
    }
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setMe(payload))
      .catch(() => setMe(null));
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
    router.refresh();
  }

  // Telas de conta: sem menu, so o conteudo.
  if (AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) {
    return (
      <div className="app-shell">
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
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Biblioteca de Perfis">
            <span className="brand-mark" aria-hidden>
              <Sparkles size={18} strokeWidth={2.5} />
            </span>
            <span className="brand-text">Biblioteca de Perfis</span>
          </Link>
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
          <div className="user-box">
            {me ? <span className="user-name">{me.name}</span> : null}
            <button type="button" className="nav-link" onClick={logout} title="Sair">
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </header>
      <div className="page-enter-root" key={pathname}>
        {children}
      </div>
    </div>
  );
}
