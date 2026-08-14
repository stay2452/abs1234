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
- `src/lib/scrapers`: Bright Data (client, adaptadores IG/TT, pool de chaves, orquestracao).
- `prisma/`: schema e migrations PostgreSQL do Supabase.
- `docs/`: contratos vivos — leia antes de mudar scraping, sessoes ou creditos.

## Documentacao viva

| Doc | Conteudo |
|-----|----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, fluxo, modelos |
| [CRITICAL_RULES.md](docs/CRITICAL_RULES.md) | Invariantes (custo, dados, workers) |
| [BRIGHT_DATA_API.md](docs/BRIGHT_DATA_API.md) | API oficial BD → decisoes do app |
| [SESSION_POOL.md](docs/SESSION_POOL.md) | Chaves **globais**, credito, workers |
| [SCRAPING_RULES.md](docs/SCRAPING_RULES.md) | Datasets, limites, biblioteca acumulativa |
| [CREDIT_USAGE.md](docs/CREDIT_USAGE.md) | Free tier 5k, o que gasta credito |
| [BRIGHT_DATA_CAPACITY.md](docs/BRIGHT_DATA_CAPACITY.md) | Planejamento de capacidade |
| [DECISIONS.md](docs/DECISIONS.md) | Historico de decisoes |

Cada conta Bright Data no free tier tem **5.000 creditos/mes**. Decisoes de coleta devem caber em `docs/BRIGHT_DATA_API.md`.

Sempre que uma regra importante mudar, atualize um `.md` junto com o codigo.

## Notas operacionais (estado atual)

- **PostgreSQL Supabase**: perfis, posts, historico e chaves ficam no banco remoto persistente.
- **Chaves globais** em `/settings`: nao ha chave "so IG" ou "so TT"; a plataforma vem do perfil.
- Workers usam chaves **com credito** (saldo oficial ou estimativa local 5k − uso no mes). Sem credito = fora da fila. **Atencao:** chave recem-criada sem refresh aparece como `unknown` e e tratada como `has_credit` (estimativa 5000 ate prova em contrario); rode **Atualizar saldos** antes de coletas em massa para evitar gasto em conta vazia.
- Botao **Atualizar saldos** consulta `GET /customer/balance` (precisa permissao de billing na chave); senao estima localmente.
- Ate **20 chaves** com credito coletam em paralelo (`SCRAPE_MAX_PARALLEL_KEYS`).
- **Atualizar biblioteca**: todos os perfis ativos; puxa ultimos 5 Grade + 5 Reels (ou 10 videos); **upsert** sem duplicar; historico antigo permanece.
- Importacao: ate **500** perfis/request; coleta em lotes de **20**; janela anti-recoleta **30 min** (salvo `force`).
- Nao ha navegador, proxy, cookies ou Playwright.
- `DATABASE_URL` usa a conexao transaction pooler; `DIRECT_URL` e usado pelas migrations.
- Chaves e arquivos `.env` nao vao para o Git. Backups e retencao ficam sob responsabilidade do Supabase.
