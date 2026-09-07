# Biblioteca de Perfis

App Next.js hospedado no Render com PostgreSQL gerenciado pelo Supabase para catalogar perfis de Instagram e TikTok, acumular Grade/Reels/Videos sem duplicar, manter historico de crescimento e rankings por nicho.

## Como rodar

```bash
npm install
npm run db:migrate
npm run dev -- --port 3000
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Organizacao

- `src/app`: paginas e rotas (Next.js App Router).
- `src/components`: UI (import, biblioteca, sessoes, rankings).
- `src/lib`: dominio, formatacao, rankings, Prisma.
- `src/lib/scrapers`: Apify (client, adaptador IG, pool de tokens, orquestracao).
- `prisma/`: schema e migrations PostgreSQL do Supabase.
- `docs/`: contratos vivos — leia antes de mudar scraping, sessoes ou creditos.

## Documentacao viva

| Doc | Conteudo |
|-----|----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, fluxo, modelos |
| [CRITICAL_RULES.md](docs/CRITICAL_RULES.md) | Invariantes (custo, dados, workers) |
| [SCRAPING_RULES.md](docs/SCRAPING_RULES.md) | Actors Apify, limites, biblioteca acumulativa |
| [SESSION_POOL.md](docs/SESSION_POOL.md) | Tokens Apify **globais**, credito, workers |
| [CREDIT_USAGE.md](docs/CREDIT_USAGE.md) | Free Apify ~1k, o que gasta credito |
| [APIFY_API.md](docs/APIFY_API.md) | API Apify → decisões do app |
| [DECISIONS.md](docs/DECISIONS.md) | Historico de decisoes |

Cada conta Apify free tem **~1.000 requests/mes** (estimativa local). Decisoes de coleta devem caber em `docs/SCRAPING_RULES.md`.

Sempre que uma regra importante mudar, atualize um `.md` junto com o codigo.

## Notas operacionais (estado atual)

- **PostgreSQL Supabase (único banco — regra 2026-08-30, rígida desde 2026-09-07: tudo em Render+Supabase, nada local)**. Perfis, posts, histórico e chaves ficam **sempre** no Postgres remoto. `npm run dev` local também usa `DATABASE_URL`/`DIRECT_URL` `postgresql://` do Supabase. `prisma/dev.db` foi **deletado** e os fallbacks SQLite/`file:` removidos do código — sem Supabase no `.env`, o app falha alto (sem fallback silencioso).
- **Tokens Apify globais** em `/settings`: nao ha chave "so IG" ou "so TT"; modo atual é **IG-only** (TT pulado sem custo).
- Workers usam tokens **com credito** (estimativa local 1k − uso no mes). Sem credito = fora da fila. **Atencao:** token `unknown` sem refresh **não entra** no pool; rode **Atualizar saldos** antes de coletas em massa.
- Botao **Atualizar saldos** recalcula a estimativa local (Apify não tem balance oficial).
- Ate **100 chaves** com credito coletam em paralelo (`SCRAPE_MAX_PARALLEL_KEYS`).
- **Atualizar biblioteca**: todos os perfis ativos; puxa ultimos 5 Grade + 5 Reels (ou 10 videos); **upsert** sem duplicar; historico antigo permanece.
- Importacao: ate **500** perfis/request; coleta em lotes de **20**; janela anti-recoleta **30 min** (salvo `force`).
- Nao ha navegador, proxy, cookies ou Playwright.
- `DATABASE_URL` usa a conexao transaction pooler (`6543`); `DIRECT_URL` e usado pelas migrations (`5432`). Ambos são `postgresql://` do Supabase em todos os ambientes.
- Chaves e arquivos `.env` nao vao para o Git. Backups e retencao ficam sob responsabilidade do Supabase (PITR). `tmp/` e `dwadaw/` são temporários.
