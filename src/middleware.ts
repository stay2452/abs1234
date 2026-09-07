/**
 * Porteiro das paginas (parte 1 do modo prod, 2026-09-08).
 *
 * - Paginas do app exigem o cookie de sessao; sem ele, manda para /login.
 * - A verificacao REAL da assinatura e feita nas paginas/APIs via
 *   getCurrentUser()/getRequestUser() — aqui e so presenca (cookie forjado
 *   cai na verificacao e vira "nao logado").
 * - /api/* fica FORA daqui: cada rota decide (token da extensao OU sessao),
 *   e /api/health continua aberto para o health check do Render.
 */
import { NextRequest, NextResponse } from "next/server";

// Mesmo valor de SESSION_COOKIE em src/lib/auth.ts (duplicado de proposito:
// middleware roda no edge e nao pode importar o modulo auth — node:crypto,
// next/headers e prisma nao existem aqui).
const SESSION_COOKIE = "bp_session";

const PUBLIC_PAGES = ["/login", "/cadastro"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.[a-z0-9]+$/i)
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
