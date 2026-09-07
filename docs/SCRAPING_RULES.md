# Contrato Apify IG-only (scraping)

> Atualizado em 2026-09-07: provedor único Apify (IG-only). Fronteira app ↔ Apify.
> Mudanca de actor ou limite deve atualizar este arquivo.

## Escopo e limites

| Acao | Comportamento |
|------|----------------|
| Import | Cadastro local ate 500 (IG + TT aceitos no tracker); coleta so dos IDs importados, lotes de 20 |
| Atualizar biblioteca | `scope: "all"`, perfis ativos, anti-recoleta 30 min (salvo `force`), cap 200 |
| Atualizar um perfil | `scope: "profiles"` com 1–100 IDs |
| Scrape API | Max 100 IDs; corpo invalido → 400 (nunca vira `all`) |

- Instagram: 3 actors/perfil — profile + post 5 (`INSTAGRAM_GRID_LIMIT`) + reel 5 (`INSTAGRAM_REELS_LIMIT`).
- TikTok: **pausado** — perfis TT são pulados com `unsupported_platform` (aviso, sem custo). Tracker continua aceitando TT para uso futuro.

## Vault — winners diretos (sem IA desde 2026-09-01)

Vault não usa mais dataset de comentários. `POST /api/vault/scan` cria winners direto via outlier 6x6 (ratio ≥2.0) — sem IA, sem `gd_ltppn085pokosxh13`, sem `limit_per_input`. Histórico de IA removido em 2026-09-01.

- Limite no **request** ao provedor; proibido baixar catalogo inteiro e filtrar no app.

## Retentativa e cobranca (auditoria 2026-08-31, portada p/ Apify em 2026-09-04)

- **`snapshot_pending`**: timeout de run/poll Apify (`ainda não concluiu o run`, `TIMED-OUT/ABORTED`, `demorou demais`) NÃO é retry com outra chave — o run pode já estar rodando/cobrando no lado Apify; re-disparar paga de novo. Classificado em `apify-client.ts` (`classifyApifyMessage`) como `snapshot_pending`, fora de `shouldRetryWithAnotherSession` em `index.ts`.
- **Timeout global do run `withRunTimeout`** aborta os workers via `AbortController` compartilhado (checado por worker/perfil e nos fetches). Cancelar no UI/stream (`request.signal`) também cancela para de agendar novos perfis. Antes: o run falhava mas as coletas seguiam em background pagando.
- **Persistencia separada da coleta** (`executeAttempt`): falha de banco após coleta **paga** não re-dispara a coleta com outra chave (`retryable: false`, `errorCode: persist_error`) — evita custo duplicado. A coleta inteira só é refeita se a própria coleta (Apify) falhar.

## Biblioteca acumulativa

- Cada coleta puxa so os ultimos N itens da fonte.
- Identidade efetiva: `[profileId, url canonica]` ou `externalId` quando presente; `sourceType` preserva a origem sem duplicar o mesmo conteudo.
- **Novo** URL → cria post. **Mesmo** URL → upsert (sem duplicar); metricas mudaram → novo `PostSnapshot`.
- Conteudo antigo permanece no PostgreSQL do Supabase.
- UI de detalhe lista a **biblioteca completa** (nao so os 5 da ultima leva).
- Botao **Atualizar biblioteca** deixa isso explicito na home e em `/profiles`.

## Catalogacao

- IG Grade: `sourceType = "grid"`. IG Reels: `reels`. TT: `video`.
- Canonizar URL antes do upsert.
- Legendas auto do IG ("Photo by…") nao sao legenda do criador.
- TikTok: URL publica `@handle/video/id`; nao usar URL de midia CDN como identidade.

## Contrato Instagram atual (Apify, 3 actors)

- Profile: `apify/instagram-profile-scraper` — 1 perfil por input.
- Grid: `apify/instagram-post-scraper` — `resultsLimit = INSTAGRAM_GRID_LIMIT` (5).
- Reels: `apify/instagram-reel-scraper` — `resultsLimit = INSTAGRAM_REELS_LIMIT` (5).
- Fluxo: `POST /acts/{actor}/runs` → poll `GET /acts/.../runs/{id}` (`POLL_TRIES=40 × POLL_MS=3000`, ~120s) → `GET /datasets/{id}/items`. Status `SUCCEEDED/FAILED/TIMED-OUT/ABORTED`. Fonte de verdade: `src/lib/scrapers/apify-client.ts`.
- Auth via header `Authorization: Bearer <token>` (nunca `?token=` na URL).

## Contrato TikTok

- **Pausado (modo IG-only).** Tracker/import/rankings ainda aceitam TT, mas `scrapeWithApiSession` pula com `unsupported_platform`. Reativar = novo adapter + atualizar este doc.

## Reparo seletivo de metricas ausentes

- Dashboard: **Corrigir metricas ausentes** permite selecionar `views`, curtidas, comentarios, compartilhamentos e favoritos.
- So considera conteudo de video ja catalogado: IG `sourceType = reels` (**IG-only**); **Grade nunca entra**.
- Agrupa por perfil e consulta somente o actor de conteudo: ate 5 Reels IG. Nao cria posts, nao coleta perfil e nao altera Grade.
- Atualiza somente posts cujo ultimo snapshot tem a metrica escolhida em `null`; cria novo `PostSnapshot` apenas quando a Apify devolve valor preenchido.
- Conteudo antigo fora da janela recente do provedor pode continuar sem metrica; o resumo informa quantos ficaram indisponiveis.
- Compartilhamentos/favoritos dependem dos campos que a Apify expor. Instagram pode continuar sem esses valores.
- A reparacao consome creditos Apify por perfil afetado; confirmacao explicita na UI antes de iniciar.

## Falhas e telemetria

- Telemetria por actor sem chave/payload bruto.
- `estimatedCredits` = `recordsReceived` (registros entregues; proxy operacional, nao e a fatura Apify).
- Resposta final de run pode incluir `postsNew` / `postsUpdated`.
- Auth/conta pausam chave + esgotam neste run; transient/provider re-tentam perfil com outra chave; not_found/`snapshot_pending`/`unsupported_platform` nao trocam chave (`snapshot_pending` nao re-dispara run pago; `unsupported_platform` vira aviso, nao falha — ver `getScrapeRunStatus`).
- "no public posts" / empty content → dataset vazio, nao falha de chave.
- Timeout HTTP request ~90s; poll de run ate **40×3s (~120s)**. Status: `SUCCEEDED/FAILED/TIMED-OUT/ABORTED`. Fonte de verdade: `src/lib/scrapers/apify-client.ts`.
- Coleta parcial: salva o valido; run pode ser `partial_failed` (só em dataset essencial).
- Reparo de metricas respeita a janela anti-recoleta de 30 min (pula perfil coletado recentemente).

## Teste controlado de dataset

Nao rodar automaticamente. Com autorizacao explicita:

1. Uma chave + um perfil de teste.
2. Uso no painel Apify antes/depois.
3. Um actor por vez se necessario.
4. Atualizar `CREDIT_USAGE.md` com a medicao.
