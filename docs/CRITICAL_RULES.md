# Regras criticas

Invariantes de custo, dados e operacao. Qualquer mudanca que as toque deve atualizar este documento na mesma entrega.

## Coleta e credito (Apify IG-only desde 2026-09-04)

- Referencia oficial da API e free tier (~1k/conta): `docs/APIFY_API.md`. Regras ativas: `docs/SCRAPING_RULES.md` + `docs/SESSION_POOL.md` + `docs/CREDIT_USAGE.md`.
- Cada token = **uma conta** Apify; free ≈ **1.000 requests/mes** (estimativa local `1000 − uso`), por conta distinta. Cap `all` 200 × 11 exige multi-conta.
- `POST /api/scrape/run`: so `scope: "all"` (capado em `MAX_SCRAPE_ALL_PROFILES=200` perfis elegíveis por rodada) ou `scope: "profiles"` com 1–100 IDs. Invalido → **400** (nunca vira `all`). `force:true` exige `X-Confirm-Force: 1`.
- Importacao: ate **500** perfis validos e 200k caracteres; coleta pos-import em lotes de **20**.
- Falha de um lote de coleta **nao** desfaz o cadastro local nem impede os lotes seguintes.
- Import aceita URLs IG/TT e `@handles`; `@` sem URL usa o seletor do formulario.
- Limites no servidor: IG 5 Grade + 5 Reels; TT 10 videos. Sem `limit` generico na API de coleta.
- Janela anti-recoleta **30 min** por `max(ProfileSnapshot.capturedAt, Profile.lastPostsScrapeAt)` (salvo `force: true`). O `lastPostsScrapeAt` cobre perfil so-com-posts (sem `profileSnapshot`); sem ele a janela nao atualizava e o perfil podia ser re-coletado em seguida.
- Paginas, rankings, detalhes e testes **nao** disparam coleta. "Atualizar saldos" é estimativa local, nao run de actor.
- Nao tratar "11 creditos/perfil" como garantia; usar telemetria + painel Apify.
- TikTok é pulado com `unsupported_platform` (aviso, sem custo); run com só TT-skips termina `success`.
- Coleta termina em sucesso, falha, parcial ou timeout controlado; UI nao fica presa em "Atualizando".
- `partial_failed` so quando **dataset essencial** falha (perfil IG/TT). Grade/Reels/Videos vazios viram `errorCode: "partial_empty"` — warning em `errors[]` (telemetria/auditoria), nao falha estrutural. Adaptadores classificam via `ScrapePartialError.essential`.
- Retentativas por perfil limitadas a `SCRAPE_MAX_RETRIES_PER_PROFILE` (**3**) com backoff exponencial entre rounds (`min(30s, 1s × 2^(round-1))`); evita 20 tentativas sem pausa em cenario de rate-limit prolongado.
- Falha de um dataset nao descarta dados validos dos outros.

## Workers Apify (tokens globais + credito)

- Tokens **nao** tem plataforma: `platform=global`; modo atual é **IG-only** (TT pulado).
- Entram no worker: ativos + **com credito** (estimativa local). **Sem credito** fica fora da fila. `getActiveCollectorSessions()` retorna `[]` (nao throw) quando vazia — orquestrador marca perfis como `no_session`.
- Prioridade: mais `creditsRemaining` primeiro. Ate `SCRAPE_MAX_PARALLEL_KEYS` (100) em paralelo; 1 perfil por chave por vez.
- Estimativa local Apify (`1000 − uso no mês`); sem balance oficial (`balanceUsd = null`).
- Pre-flight `ESTIMATED_CREDITS_PER_PROFILE=11`: se `profiles×11 > Σ creditsRemaining` o run falha com `insufficient_credits` (evita começar e parar no meio). `GET /api/scrape/estimate` expõe `required/available/deficit` (protegido por token como o run).
- Token `unknown` recém-criado sem `balanceCheckedAt` não entra no pool até `Atualizar saldos`.
- Provedor único: `apify`. Registros com provedor legado/desconhecido no DB ficam `no_credit` até migrar para token Apify.
- Erro `provider`/`transient` da Apify **nao** esgota a chave no run (so aquele perfil retry). So `authentication`/`account` matam a chave no worker.
- Auth/conta: esgotam + **pausam** a chave. `provider`/`transient`: **nao** esgotam no run — trocam de chave so para o perfil. `not_found`/`snapshot_pending`/`unsupported_platform`: nao trocam chave (perfil indisponível / run pago em andamento / plataforma pausada). Erros transitorios de Prisma/PostgreSQL (timeout, deadlock ou falha de conexao): perfil retenta com outra chave em vez de falhar `unknown` sem retry. Fonte de verdade: `src/lib/scrapers/index.ts` (`isSessionUnrecoverable`) e `src/lib/scrapers/types.ts`.
- UI de `/settings`: com credito / sem credito / pausadas + label de creditos remanescentes + fila #N (qualquer provider válido).
- Nunca logar, retornar ou versionar API keys/tokens ou payloads brutos. Token Apify via header `Authorization: Bearer` (nunca `?token=` na URL).
- Nao reintroduzir navegador, proxy, cookies, Playwright ou login manual.

## Dados (biblioteca acumulativa)

- `Profile` unico por `[platform, handle]`. Coluna `tags` removida (legado) — organizacao via `Folder`/`ProfileFolder`.
- `Post` e deduplicado por `[profileId, url canonica]` ou `externalId`; `sourceType` preserva a origem do conteudo. `Post.platform` e denormalizado intencionalmente de `Profile.platform` (consultas sem JOIN).
- `ScrapeAttempt.profileId` e `String?` com `onDelete: SetNull` — telemetria historica preservada quando perfil deletado (estimativa de credito continua honesta).
- `DiscordDelivery` tem FK + `onDelete: Cascade` para `Post` e `DiscordNotifyConfig` — BD limpa automaticamente; `deleteDiscordWebhook` nao precisa mais `deleteMany` manual.
- Cada atualizacao puxa so os ultimos N itens; **upsert** acumula biblioteca sem duplicar.
- Posts antigos permanecem; UI de detalhe lista a biblioteca completa.
- Transacao por perfil na persistencia.
- `no_data` (sem perfil util e sem posts) nao cria snapshot que dispare a janela de 30 min.
- TikTok: identidade e URL publica `@handle/video/id`, nao URL de midia CDN.
- Sem `PostSnapshot` se metricas identicas ao ultimo.
- Migration/normalizacao: usar Prisma Migrate no Supabase; backups ficam sob responsabilidade do banco gerenciado.

## Rankings e interface

- **Ranking de posts (reels/videos):** o periodo (3d/7d/30d/90d) filtra por `Post.publishedAt` (data real de publicacao), **nunca** por `PostSnapshot.capturedAt` (data do scrape). Video fixado antigo nao entra em "7 dias" so porque foi re-coletado hoje.
- Posts sem `publishedAt` so entram no periodo **all**.
- Metricas do post usam o snapshot mais recente disponivel (views/likes atuais).
- **Ranking de perfis:** o periodo continua sendo a janela de *medicao* (snapshots de seguidores capturados), porque o score e crescimento entre coletas.
- Rankings: perfis ativos (`PROFILE_STATUS = ["active", "paused"]`; "error" removido, sem uso), metricas nulas toleradas; limite 1–100.
- Botao de coleta em massa usa stream NDJSON + resumo final (`postsNew` / `postsUpdated` quando houver).
- Sem rolagem horizontal indesejada em mobile; graficos com data/hora real do snapshot.

## Operacao

- **Regra de persistência absoluta (2026-08-30): tudo roda em Supabase (PostgreSQL) + Render. Nunca SQLite local.**
  - `prisma/schema.prisma:5` `provider = "postgresql"` + `prisma/migrations/*` são a única fonte de verdade. `prisma/dev.db` foi **deletado em 2026-09-07**; `prisma/backups/` é git-ignorado e nunca é lido pelo app — `DATABASE_URL` e `DIRECT_URL` devem ser sempre `postgresql://...pooler.supabase.com` (app) e `postgresql://...supabase.co` / `pooler ...:5432` (migrations), tanto em `Render` quanto em `next dev` local. `assertSupabaseDatabaseUrl()` (`src/lib/db.ts`) e `requireDatabaseEnvironment()` (`scripts/start.mjs`) travam `file:`/SQLite com erro explícito.
  - `npm run dev` local e `node scripts/start.mjs` em prod usam as mesmas credenciais Supabase. Não existe “modo offline” ou “banco local”.
  - Backups, retenção e PITR são responsabilidade do Supabase. `tmp/` e `dwadaw/` são temporários git-ignorados e não são banco.
- Sem push/commit no GitHub sem pedido explicito do usuario.
- Toda regra nova de arquitetura, scraping, sessao, schema ou ranking entra em um `.md`.
- **Proteção opt-in dos endpoints que gastam crédito (2026-09-01, endurecida em 2026-09-08):** com contas de usuário ativas, o legado "aberto sem token" acabou — `hasValidApiToken()` (`src/lib/auth.ts`) só autoriza com token explícito; sem token, vale a sessão de login (`apiGuard`/`isApiAllowed`). `POST /api/scrape/run`, `POST /api/metrics/repair`, `scrape/session`, `profiles/import`, `bulk-delete`, Discord e `vault/scan` exigem **admin** (ou token da extensão/operador onde aplicável: run, repair, estimate, import). Leitura (rankings, pastas, vault, creators) exige login. Auditoria/history e chaves são admin-only. A extensão precisa de `API_ACCESS_TOKEN` configurado nos dois lados (app + `chrome.storage.sync.apiToken`) — sem ele, as chamadas dela sem sessão caem em 401. `CRON_SECRET` protege `/api/cron/reconcile` da mesma forma (recomendado definir no Render).
- **Contas e papéis — modo prod parte 1 (2026-09-08):** cadastro + login próprios (`User`: email único, senha em hash scrypt, `role` admin/user, `isActive`). Primeira conta criada vira **admin ativa**; resto entra **pendente** (`isActive=false`) e só loga depois que um admin aprovar em `/users` (API `PATCH /api/users/[id]`, admin-only, sem mexer na própria conta). Login de pendente responde 403 "aguardando aprovação". Sessão em cookie `bp_session` (payload `{uid, role, exp}` 7 dias, HMAC-SHA256 com `SESSION_SECRET` ≥32 chars — sem ele, login falha alto). `src/middleware.ts` manda sem-cookie para `/login` (páginas); `/api/*` decidem por rota (`/api/health` sempre aberto para o Render). Fonte de verdade: `src/lib/auth.ts` (`hashPassword`, `signSessionToken`, `getCurrentUser`, `apiGuard`). Limitação V1: rate-limit de login em memória (5 tentativas → 15min por IP, zera ao reiniciar) e pastas/creators compartilhados entre usuários (sem dono por registro).
- **Vault — winners diretos (2026-09-01):** IA removida. `PatternVaultEntry` criado por `POST /api/vault/scan` (outlier 6x6, ratio ≥2.0) já é winner — sem `pending/approved/rejected`, sem dataset de comentários, sem Gemini. Colunas `ai*` em `schema.prisma` são legado e não são usadas.
