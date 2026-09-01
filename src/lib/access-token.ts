/**
 * Protecao OPT-IN para endpoints que gastam credito Bright Data
 * (scrape/run, vault/analyze-ai).
 *
 * Se a variavel de ambiente `API_ACCESS_TOKEN` estiver definida, exige
 * `Authorization: Bearer <token>` ou `?token=<token>`. Sem a variavel,
 * o endpoint permanece aberto — compatibilidade com a extensao e uso local.
 *
 * Para ativar em producao: defina API_ACCESS_TOKEN no Render e cadastre o
 * mesmo token na extensao (chrome.storage.sync.apiToken).
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
