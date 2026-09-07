# Apify API — referência oficial aplicada a este projeto

Fonte primária: documentação oficial Apify ([docs.apify.com](https://docs.apify.com)).

Toda decisão de scraping, fila de chaves, timeout e crédito neste repositório deve
caber neste documento. Se a API oficial mudar, atualize **este arquivo** junto com o código.

---

## 1. O que usamos (e o que não usamos)

| Produto Apify | Usamos? | Motivo |
|---------------|---------|--------|
| **Actors** (`apify/instagram-profile-scraper`, `apify/instagram-post-scraper`, `apify/instagram-reel-scraper`) | **Sim** | Coleta IG-only: perfil + grade + reels |
| Apify Proxy | Indireto | Via actors (sem proxy local) |
| Dataset / Key-value store | Leitura | `GET /datasets/{id}/items` após run |
| Scraping Browser / Playwright local | Não | Sem navegador local |
| Store (actors pagos de terceiros) | Não | Só actors oficiais listados acima |

Cada **token** cadastrado em `/settings` é um personal API token de **uma conta Apify**.
Tokens são **globais** (não há token "só Instagram"): o app escolhe o actor conforme o perfil.
Modo atual: **IG-only** — TikTok é pulado com `unsupported_platform`.

---

## 2. Free tier (≈1k requests/mês por conta)

- Conta free ≈ **$5 em créditos**, estimados no app como **~1.000 requests/mês** (`FREE_TIER_CREDITS`).
- Sem API oficial de saldo consumida pelo app — `balanceUsd` fica `null`, vale a **estimativa local** (`1000 − uso no mês`).
- N tokens só somam `N × 1k` se forem de **contas distintas**.

**Orçamento operacional recomendado por conta free:**

```txt
orcamento_util = 1000 * 0,75   # 25% reserva (erros, retry, testes)
               = 750 requests/mês por conta free
```

Com C ≈ 11 requests/perfil (3 actors): ~**68 perfis/mês** por conta em 1 atualização/mês.
Cap `all` 200 × 11 ≈ 2200 → exige **multi-conta** ou `scope profiles` paginado.

---

## 3. Fluxo de run (fonte de verdade: `src/lib/scrapers/apify-client.ts`)

```txt
POST /acts/{actor}/runs { input }
  → { data: { id: runId, defaultDatasetId } }
POLL GET /acts/{actor}/runs/{runId}  (40 × 3s, ~120s)
  → status SUCCEEDED | FAILED | TIMED-OUT | ABORTED
GET /datasets/{datasetId}/items?format=json&clean=true
  → records[]
```

- **Auth:** header `Authorization: Bearer <token>` — nunca `?token=` na URL (vaza para logs/proxy).
- **Timeout HTTP:** ~90s por request (`DEFAULT_TIMEOUT_MS`).
- **Poll:** `POLL_TRIES=40`, `POLL_MS=3000`. Sem `SUCCEEDED` após 40 polls → `snapshot_pending`
  (não retenta com outra chave — o run pode estar cobrando no lado Apify).
- **Cada actor conta 1 request** (`requestsMade: 1`); registros = `records.length`.

### Actors e inputs

| Actor | Input | Teto |
|-------|-------|------|
| `apify/instagram-profile-scraper` | `{ usernames: [handle] }` | 1 perfil |
| `apify/instagram-post-scraper` | `{ username: [handle], resultsLimit: 5 }` | `INSTAGRAM_GRID_LIMIT` |
| `apify/instagram-reel-scraper` | `{ username: [handle], resultsLimit: 5 }` | `INSTAGRAM_REELS_LIMIT` |

---

## 4. Classificação de erros (`classifyApifyMessage`)

| Sinal | `errorCode` | Efeito na chave |
|-------|-------------|-----------------|
| HTTP 401/403 | `authentication` | pausa + esgota no run |
| HTTP 402, `credit/balance/funds/suspended/over quota/limit exceeded` | `account` | pausa + esgota no run |
| `user not found`, `private account`, `restricted profile`, página indisponível | `not_found` | não troca chave, não retenta |
| `TIMED-OUT/ABORTED`, `ainda não concluiu`, cancelada | `snapshot_pending` | não retenta (evita pagar 2x) |
| HTTP 429/5xx, timeout, rede | `transient` | retry do perfil com outra chave |
| resto | `provider` | retry do perfil com outra chave |

`not_found`/`partial_empty`/`unsupported_platform` são **avisos** — não tornam o run `partial_failed` sozinhos (`getScrapeRunStatus`).

---

## 5. Capacidade (resumo)

```txt
perfis_por_mes = (K * 1000 * 0.75) / (C * atualizacoes_por_mes)   # C ≈ 11
```

| Contas free (K) | Perfis/mês (1 atualização/mês) |
|----------------:|-------------------------------:|
| 1 | ~68 |
| 10 | ~680 |
| 73 | ~5.000 |

Tempo de parede: ~1–3 min/perfil **por chave**; com 100 chaves em paralelo, ~100 perfis ao mesmo tempo.

## 6. Operação

| Objetivo | Ação |
|----------|------|
| Caber no free | Poucos perfis ou poucas atualizações; respeitar cap 200 |
| Mais velocidade | Várias **contas** free com crédito ativas (paralelo) |
| Não gastar conta zerada | Atualizar saldos; workers ignoram sem crédito |
| Proteger o free | 30 min anti-recoleta, `resultsLimit`, sem scrape em page load, pre-flight `perfis × 11` |
