# Biblioteca de Perfis — instruções do projeto

Next.js 16 (App Router) + Prisma + PostgreSQL **Supabase-only** + coleta **Apify IG-only**.
Sem SQLite local, sem Bright Data, sem navegador/Playwright. Provedor único: `apify`.

## Comandos

- dev: `npm run dev -- --port 3000` (abre em `http://127.0.0.1:3000`, banco sempre Supabase)
- build: `npm run build` | test: `npm test` | lint: `npm run lint` | tipos: `npx tsc --noEmit`
- db: `npm run db:migrate` (DIRECT_URL `:5432`); validar: `npx prisma validate`

## Regras de ouro (detalhes em `docs/`)

1. **Supabase-only, sem fallback:** `DATABASE_URL`/`DIRECT_URL` sempre `postgresql://`. Sem `.env` Supabase, falha alto (`assertSupabaseDatabaseUrl`) — nunca criar caminho local.
2. **Nunca dispare coleta real sem pedido explícito** (`POST /api/scrape/run` gasta crédito Apify). Páginas, rankings, testes e repair nunca coletam sozinhos.
3. **IG-only:** TikTok é pulado com `unsupported_platform` (aviso, sem custo). Não reative sem atualizar `docs/SCRAPING_RULES.md`.
4. **Ranking de posts filtra por `Post.publishedAt`**, nunca `capturedAt` (perfis usam janela de snapshots).
5. **Coleta:** scope `all` (cap 200) ou `profiles` (1–100 IDs); corpo inválido → 400; `force` exige `X-Confirm-Force: 1`; anti-recoleta 30min; free Apify ≈ 1k/conta.
6. **Toda mudança de regra atualiza um `.md` em `docs/` junto com o código.** `docs/archive/` é histórico (não usar como referência).
7. **Sem commit/push sem pedido explícito.** Nunca logar, retornar ou versionar tokens/chaves ou payloads brutos.

## Mapa rápido

- `src/app`: páginas e rotas API (`api/scrape/*`, `api/profiles/*`, `api/history/*`)
- `src/components`: UI (import, biblioteca, sessões, rankings, vault)
- `src/lib/scrapers`: coleta (`apify-client.ts`, `apify-instagram.ts`, `session.ts`, `index.ts`)
- `src/lib`: domínio (`rankings.ts`, `db.ts`, `scrape-reconcile.ts`, `constants.ts`)
- `prisma/`: `schema.prisma` + migrations (única fonte de verdade do banco)
- `docs/`: `CRITICAL_RULES.md` (invariantes) → ler antes de mexer em coleta/banco/ranking
