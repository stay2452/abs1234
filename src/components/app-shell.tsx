"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Library, Settings, Sparkles } from "lucide-react";

const navItems = [
  { href: "/", label: "Ranking", icon: BarChart3 },
  { href: "/profiles", label: "Perfis", icon: Library },
  { href: "/settings", label: "Sessões", icon: Settings },
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
            <span className="brand-mark">
              <Sparkles size={18} strokeWidth={2.5} />
            </span>
            <span className="brand-text">Biblioteca de Perfis</span>
          </Link>
          <nav className="nav" aria-label="Navegação principal">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  className={`nav-link ${isActive(pathname, item.href) ? "active" : ""}`}
                  href={item.href}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
