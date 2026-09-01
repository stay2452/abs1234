# Arquitetura

App Next.js hospedado no Render com PostgreSQL gerenciado pelo Supabase para catalogar perfis de Instagram e TikTok, acumular biblioteca de conteudos (Grade/Reels/Videos) sem duplicar, acompanhar crescimento e rankings. Sem autenticacao propria e sem navegador automatizado: coleta externa so via **Bright Data Datasets API v3**. Extensao Chrome/Edge opcional em `extension/` so importa handle/URL (ver `docs/EXTENSION.md`).

## Stack

- Next.js (App Router) + React + TypeScript.
- PostgreSQL Supabase + Prisma Migrate (`npm run db:migrate`).
- Bright Data Web Scraper API (datasets Instagram e TikTok).
- Vitest + ESLint.

## Fluxo de coleta

1. **Importacao:** normaliza URLs, `@handles` e `plataforma:@handle`; seletor define plataforma dos `@` sem URL. Cadastro local em lote (ate 500). Coleta so dos IDs importados, em chunks de 20.
2. **Atualizar biblioteca:** `POST /api/scrape/run` com `scope: "all"` (ou um `profileId`). So perfis `active` fora da janela de 30 min por `max(ProfileSnapshot.capturedAt, Profile.lastPostsScrapeAt)` (salvo `force: true`).
3. Corpo invalido de scrape → **400**; nunca vira coleta global por padrao. Max 100 IDs por request de scrape.
4. **Pool global de chaves:** qualquer chave ativa **com credito** serve IG e TT. Ate `SCRAPE_MAX_PARALLEL_KEYS` (**20**) workers em paralelo; cada chave processa 1 perfil por vez. Plataforma do **perfil** escolhe o adaptador.
5. Instagram: 3 datasets em paralelo (perfil + Grade `num_of_posts: 5` + Reels `num_of_posts: 5`). TikTok: perfil + videos (`num_of_posts: 10`).
6. Persistencia por perfil em transacao: posts sao deduplicados por perfil e URL/externalId antes do upsert, preservando a primeira fonte (`sourceType`); biblioteca **acumula**; metricas iguais nao geram novo `PostSnapshot`.
7. Telemetria sem payload bruto; `stream: true` envia NDJSON de progresso.
8. Falha de um dataset nao descarta dados validos dos outros (`partial_failed` so quando dataset essencial falha; Grade/Reels/Videos vazios viram warning `partial_empty`, nao falha).
9. Rankings de **posts** filtram o periodo por `publishedAt` (data real do reel/video); metricas usam o ultimo snapshot. Rankings de **perfis** usam a janela de snapshots de seguidores capturados.

## Modelos principais

| Model | Papel |
|-------|--------|
| `Profile` | Unico por `[platform, handle]`; `lastPostsScrapeAt` referencia ultima coleta com posts (anti-recoleta) |
| `CollectorSession` | Chave Bright Data **global** (`platform=global`); tabela legada `BrowserSession`. Campos de credito: `creditStatus`, `balanceUsd`, `creditsRemaining`, etc. |
| `ProfileSnapshot` | Seguidores/seguindo/posts no tempo |
| `Post` | Conteudo; identidade por perfil e URL/externalId, com fonte preservada; `platform` denormalizado de `Profile` |
| `PostSnapshot` | Metricas do post no tempo |
| `ScrapeRun` / `ScrapeAttempt` | Resumo da varredura e telemetria por dataset; `ScrapeAttempt.profileId` nullable (`onDelete: SetNull`) preserva telemetria ao deletar perfil |
| `Folder` / `ProfileFolder` | Pastas do usuario e vinculo N:N com perfis |
| `DiscordNotifyConfig` | Webhook + criterios configuraveis de tops |
| `DiscordDelivery` | Dedupe de posts ja enviados ao Discord (FK + `onDelete: Cascade` para `Post` e `DiscordNotifyConfig` — nao cria orfaos) |

## Contratos de conteudo

- IG: `grid` e `reels` (ate 5 por coleta cada).
- TT: `video` (ate 10 por coleta).
- Mesmo shortcode pode existir em Grade e em Reels (fonte diferente).
- Detalhe do perfil lista a **biblioteca completa** catalogada, nao so a ultima leva de 5.

## Limites operacionais

- **Tudo em Supabase + Render — nada local (regra 2026-08-30).** `DATABASE_URL` (pooler `6543`) e `DIRECT_URL` (migrations `5432`) são `postgresql://` do Supabase em **todos** os ambientes (`next dev` local e `scripts/start.mjs` em prod). `prisma/dev.db` é legado git-ignorado e não é lido. `npm run dev` sem `.env` Supabase falha em `requireDatabaseEnvironment()` / `prisma validate`.
- PostgreSQL remoto no Supabase; chaves ficam armazenadas no banco remoto e nunca entram no Git.
- `estimatedCredits` = `recordsReceived` (registros entregues — BD cobra por registro). Fatura = painel Bright Data.
- Testes automatizados nao chamam Bright Data real.
- Saldo oficial via `GET /customer/balance` (permissao de billing); senao estimativa local free tier.
- Fallback `file:./dev.db` em `src/lib/scrape-reconcile.ts:62` existe apenas como segurança para `.env` legado mal configurado e não é caminho oficial.

Ver tambem: [CRITICAL_RULES.md](./CRITICAL_RULES.md), [SESSION_POOL.md](./SESSION_POOL.md), [BRIGHT_DATA_API.md](./BRIGHT_DATA_API.md).
