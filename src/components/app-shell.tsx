"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, FolderOpen, Library, MessageCircle, Settings, Sparkles } from "lucide-react";

const navItems = [
  { href: "/", label: "Ranking", icon: BarChart3 },
  { href: "/profiles", label: "Perfis", icon: Library },
  { href: "/folders", label: "Pastas", icon: FolderOpen },
  { href: "/settings", label: "Sessões", icon: Settings },
  { href: "/history", label: "Auditoria", icon: ClipboardList },
  { href: "/discord", label: "Discord", icon: MessageCircle },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
            {navItems.map((item) => {
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
        </div>
      </header>
      <div className="page-enter-root" key={pathname}>
        {children}
      </div>
    </div>
  );
}
