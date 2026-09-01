# Regras criticas

Invariantes de custo, dados e operacao. Qualquer mudanca que as toque deve atualizar este documento na mesma entrega.

## Coleta e credito

- Referencia oficial da API e free tier (5k/conta): `docs/BRIGHT_DATA_API.md`.
- Cada chave = token de **uma conta** Bright Data; free tier = **5.000 creditos/mes** por conta distinta.
- `POST /api/scrape/run`: so `scope: "all"` ou `scope: "profiles"` com 1–100 IDs. Invalido → **400** (nunca vira `all`).
- Importacao: ate **500** perfis validos e 200k caracteres; coleta pos-import em lotes de **20**.
- Falha de um lote de coleta **nao** desfaz o cadastro local nem impede os lotes seguintes.
- Import aceita URLs IG/TT e `@handles`; `@` sem URL usa o seletor do formulario.
- Limites no servidor: IG 5 Grade + 5 Reels; TT 10 videos. Sem `limit` generico na API de coleta.
- Janela anti-recoleta **30 min** por `max(ProfileSnapshot.capturedAt, Profile.lastPostsScrapeAt)` (salvo `force: true`). O `lastPostsScrapeAt` cobre perfil so-com-posts (sem `profileSnapshot`); sem ele a janela nao atualizava e o perfil podia ser re-coletado em seguida.
- Paginas, rankings, detalhes e testes **nao** disparam coleta. "Atualizar saldos" / balance e account management, nao dataset scrape.
- Nao tratar "11 creditos/perfil" como garantia; usar telemetria + painel BD.
- Coleta termina em sucesso, falha, parcial ou timeout controlado; UI nao fica presa em "Atualizando".
- `partial_failed` so quando **dataset essencial** falha (perfil IG/TT). Grade/Reels/Videos vazios viram `errorCode: "partial_empty"` — warning em `errors[]` (telemetria/auditoria), nao falha estrutural. Adaptadores classificam via `ScrapePartialError.essential`.
- Retentativas por perfil limitadas a `SCRAPE_MAX_RETRIES_PER_PROFILE` (**3**) com backoff exponencial entre rounds (`min(30s, 1s × 2^(round-1))`); evita 20 tentativas sem pausa em cenario de rate-limit prolongado.
- Falha de um dataset nao descarta dados validos dos outros.

## Workers Bright Data (chaves globais + credito)

- Chaves **nao** tem plataforma: `platform=global`; IG/TT vem do `Profile`.
- Entram no worker: ativas + **com credito** (oficial ou estimado). **Sem credito** fica fora da fila. `getActiveCollectorSessions()` retorna `[]` (nao throw) quando vazia — orquestrador marca perfis como `no_session`.
- Prioridade: mais `creditsRemaining` primeiro. Ate `SCRAPE_MAX_PARALLEL_KEYS` (20) em paralelo; 1 perfil por chave por vez.
- `no_data` consome 1 credito (estimativa local decrementa `creditsRemaining`); saldo oficial e revalidado no proximo refresh.
- Heuristica de saldo: `/customer/balance` doc oficial retorna USD; valor `>=100` assume creditos diretos sem multiplicar por `CREDITS_PER_USD`.
- Erro `provider`/`transient` da Bright Data **nao** esgota a chave no run (so aquele perfil retry). So `authentication`/`account` matam a chave no worker.
- Auth/conta: esgotam + **pausam** a chave. `provider`/`transient`: **nao** esgotam no run — trocam de chave so para o perfil. `not_found`: nao troca chave (perfil indisponivel). Erros transitorios de Prisma/PostgreSQL (timeout, deadlock ou falha de conexao): perfil retenta com outra chave em vez de falhar `unknown` sem retry. Fonte de verdade: `src/lib/scrapers/index.ts` (`isSessionUnrecoverable`) e `src/lib/scrapers/types.ts`.
- UI de `/settings`: com credito / sem credito / pausadas + label de creditos remanescentes.
- Nunca logar, retornar ou versionar API keys ou payloads brutos.
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
  - `prisma/schema.prisma:5` `provider = "postgresql"` + `prisma/migrations/*` são a única fonte de verdade. `prisma/dev.db` e `prisma/backups/*.db` são legado git-ignorado e **não são usados** — `DATABASE_URL` e `DIRECT_URL` devem ser sempre `postgresql://...pooler.supabase.com` (app) e `postgresql://...supabase.co` / `pooler ...:5432` (migrations), tanto em `Render` quanto em `next dev` local. Desvio para `file:./dev.db` viola a regra e quebra `prisma validate` (`must start with postgresql://`).
  - `npm run dev` local e `node scripts/start.mjs` em prod usam as mesmas credenciais Supabase. Não existe “modo offline” ou “banco local”.
  - Backups, retenção e PITR são responsabilidade do Supabase. `tmp/` e `dwadaw/` são temporários git-ignorados e não são banco.
- Sem push/commit no GitHub sem pedido explicito do usuario.
- Toda regra nova de arquitetura, scraping, sessao, schema ou ranking entra em um `.md`.
- **Proteção opt-in dos endpoints que gastam crédito (2026-08-31):** se `API_ACCESS_TOKEN` estiver definido no ambiente, `POST /api/scrape/run` e `POST /api/vault/analyze-ai` exigem `Authorization: Bearer <token>` ou `?token=<token>` (401 sem). Sem a variável, permanecem abertos (compatibilidade com a extensão e uso local). A extensão envia o token se `chrome.storage.sync.apiToken` estiver configurado. `CRON_SECRET` protege `/api/cron/reconcile` da mesma forma (recomendado definir no Render).
- **Vault IA — malha anti-re-trigger (2026-08-31):** claim atômico (`pending → analyzing`) impede duas abas de analisar a mesma entrada; cooldown de 5 min (`aiAnalyzedAt`) antes de re-tentar entrada que falhou por provedor/IA; lock global in-memory (409 se já há análise rodando); rotação tenta todas as chaves do pool; falha de IA/provedor nunca deixa entrada presa em `analyzing`. Fonte de verdade: `src/app/api/vault/analyze-ai/route.ts`.
