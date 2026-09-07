/**
 * LEGADO (2026-09-08): supersedido por `hasValidApiToken`/`apiGuard` em
 * `src/lib/auth.ts`. Nenhuma rota usa mais `isAuthorizedByToken` — com contas
 * de usuario ativas, "sem variavel = aberto" acabou (ver CRITICAL_RULES.md).
 * Mantido para referencia da extensao; remover quando a extensao migrar.
 */
export function isAuthorizedByToken(request: Request) {
  const token = process.env.API_ACCESS_TOKEN?.trim();
  if (!token) {
    return true;
  }
  const auth = request.headers.get("authorization");
  const provided =
    auth?.replace(/^Bearer\s+/i, "") ?? new URL(request.url).searchParams.get("token");
  return provided === token;
}
