# Bright Data API — referencia oficial aplicada a este projeto

Fonte primaria: documentacao oficial Bright Data
([docs.brightdata.com](https://docs.brightdata.com), free tier, Web Scraper / Datasets API v3).

Toda decisao de scraping, fila de chaves, timeout e credito neste repositorio deve
caber neste documento. Se a documentacao oficial mudar, atualize **este arquivo**
junto com o codigo.

---

## 1. O que usamos (e o que nao usamos)

| Produto Bright Data | Usamos? | Motivo |
|---------------------|---------|--------|
| **Web Scraper API / Scrapers Library** (`/datasets/v3/*`) | **Sim** | Datasets pre-prontos de Instagram e TikTok |
| Web Unlocker / proxy residencial | Nao | Nao ha browser local |
| Scraping Browser / Playwright | Nao | Removido do produto |
| SERP API | Nao | Fora do escopo |
| Dataset Marketplace (compra de dumps) | Nao | Coleta on-demand por URL de perfil |

> **Cobranca = por registro entregue.** O dataset de comentarios Instagram
> (`gd_ltppn085pokosxh13`, usado pela IA do Vault) entrega 1 registro por
> comentario — **sempre** usar `limit_per_input=20` no trigger. Detalhes em
> [CREDIT_USAGE.md](./CREDIT_USAGE.md) e [SCRAPING_RULES.md](./SCRAPING_RULES.md).
| Scraper Studio (DCA custom) | Nao | Usamos scrapers da biblioteca |

Cada **chave API** cadastrada em `/settings` e um Bearer token de **uma conta Bright Data**.
Chaves sao **globais** (nao ha chave "so Instagram" ou "so TikTok"): o app escolhe o dataset conforme o perfil.

---

## 2. Free tier oficial (5.000 creditos)

Documentacao oficial ([Free tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier)):

- Toda conta nova recebe **5.000 free credits por mes**.
- Valor de referencia ~**$7,50**/mes.
- Sem cartao obrigatorio no free tier.
- Creditos do free tier valem em conjunto para: **Web Unlocker, SERP, Web Scraper API e Scraper Studio**.
- Regra de cobranca citada na doc free tier:
  - Web Unlocker / SERP / **Web Scraper API**: **1 credito por request ou por record** (a doc junta as duas no free tier).
  - Scraper Studio: 1 credito por page load.

### Implicacao para este app

| Fato | Consequencia de produto |
|------|-------------------------|
| Cada conta = **5k/mes** | Cada chave na fila e um **silo de 5k**, nao um pool global compartilhado |
| N chaves = N contas | Capacidade teorica `N × 5000` so se cada chave for de **conta distinta** |
| Mesma conta, varias chaves | Podem compartilhar o **mesmo** saldo de 5k — tratar como 1 orcamento |
| Cobranca por request **ou** record | Nunca fixar "11 creditos/perfil" como garantia; medir no painel BD |

**Orcamento operacional recomendado por chave free:**

```txt
orcamento_util = 5000 * 0,75   # 25% reserva (erros, retry, testes)
               = 3750 creditos/mes por conta free
```

---

## 3. Modelo de chamada oficial (Datasets API v3)

Base: `https://api.brightdata.com/datasets/v3`

Autenticacao:

```http
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### 3.1 Sincrono — `POST /scrape`

- Query: `dataset_id`, `format=json`, opcional `include_errors=true`, params de discover.
- Body: lista de inputs **ou** envelope `{ "input": [ ... ] }` conforme o scraper.
- Ideal para poucas URLs / resposta rapida.
- **Timeout oficial de espera sincrona ~1 minuto.**
- Se passar do limite: **HTTP 202** + `{ "snapshot_id": "..." }` — nao e erro; e async residual.

### 3.2 Assincrono — `POST /trigger`

- Enfileira job e devolve `snapshot_id` na hora.
- Ideal para lotes grandes.
- Este app usa **`/scrape`** e trata 202/snapshot como o fluxo async residual (compativel com a doc).

### 3.3 Monitorar — `GET /progress/{snapshot_id}`

Status documentados em fluxos async:

| Status | Significado |
|--------|-------------|
| `collecting` | Coletando |
| `digesting` | Processando |
| `ready` | Pronto para download |
| `failed` | Falhou |

### 3.4 Baixar — `GET /snapshot/{snapshot_id}?format=json`

So depois de `ready`.

### 3.5 O que o nosso client implementa

Arquivo: `src/lib/scrapers/brightdata-client.ts`

1. `POST /scrape?...` com `{ input: [ ... ] }`.
2. Se body e array → registros sincronos.
3. Se body tem `snapshot_id` → poll `GET /progress` ate `ready` ou `failed`.
4. Download `GET /snapshot/{id}?format=json`.
5. Timeout HTTP do request inicial: 90s (ligeiramente acima do 1 min da doc para caber latencia).
6. Poll: ate **45 × 2s (~90s)** — necessario porque Grade/Reels Instagram frequentemente ultrapassam o sync de 1 min. Fonte de verdade: `src/lib/scrapers/brightdata-client.ts` (`SNAPSHOT_POLL_ATTEMPTS`, `SNAPSHOT_POLL_DELAY_MS`).

---

## 4. Datasets deste produto

| Papel | Dataset ID | Request (resumo) | Limite de economia |
|-------|------------|------------------|--------------------|
| IG perfil | `gd_l1vikfch901nx3by4` | `{ input: [{ url }] }` | 1 registro de stats |
| IG Grade | `gd_lk5ns7kz21pck8jpis` | discover `type=discover_new&discover_by=url`, `num_of_posts: 5` | max 5 itens |
| IG Reels | `gd_lyclm20il4r5helnj` | discover `discover_by=url_all_reels`, `num_of_posts: 5` | max 5 itens |
| TT perfil | `gd_l1villgoiiidt09ci` | `{ input: [{ url }] }` | 1 registro |
| TT videos | `gd_m7n5v2gq296pex2f5m` | `num_of_posts: 10` | max 10 itens |

Regras criticas alinhadas a API:

- **Nunca** pedir catalogo completo para filtrar no app.
- `num_of_posts` vai no **body do request** ao provedor.
- `discover_by=url_all_reels` e o **modo de descoberta** do scraper, nao "baixar todos os reels".
- Nao enviar descoberta de Grade no dataset de **perfil** (retorna HTTP 400).
- Nao usar `post_type: "post"` na Grade: em perfis so-Reels a BD devolve `dead_page` / "no public posts".

---

## 5. Erros oficiais → comportamento do app

| Sinal Bright Data | Codigo interno | Fila de chaves | UI |
|-------------------|----------------|----------------|-----|
| HTTP 401 / 403 | `authentication` | Esgota chave + **pausa** persistente | Chave ruim / pausada |
| HTTP 402 / saldo / suspended / permission | `account` | Esgota + **pausa** | Pausar e avisar |
| HTTP 429 / 5xx / timeout snapshot | `transient` | Esgota chave **neste run**, vai para a proxima da fila | Retry controlado |
| HTTP 400 generico / dataset error | `provider` | **Nao** esgota a chave no run — so repele o perfil para outra chave | Proxima da fila |
| "page isn't available" / user not found | `not_found` | **Nao** troca chave | Perfil indisponivel |
| "no public posts" / dead_page so conteudo | vazio util | Nao esgota | Dataset success 0 kept |
| Snapshot `failed` | `provider` / mensagem | Conforme detalhe | Erro seguro |

Nunca logar API key nem payload bruto. So telemetria: requests, records, status, errorCode.

---

## 6. Creditos: o que a API implica para 5k/conta

### 6.1 Custo estrutural por perfil (teto de request)

**Instagram** = **3 chamadas** `/scrape` (perfil + grade + reels), em paralelo no adaptador.

**TikTok** = **2 chamadas** (perfil + videos).

### 6.2 Estimativa de records (pior caso util)

| Plataforma | Records tipicos se tudo vier cheio |
|------------|-------------------------------------|
| Instagram | 1 + 5 + 5 = **11** |
| TikTok | 1 + 10 = **11** |

`estimatedCredits` no app = `requestsMade` (proxy operacional).
**Fonte financeira real:** painel / fatura Bright Data daquela conta.

### 6.3 Capacidade free tier (matematica de planejamento)

Assumindo cobranca ~1 credito por record e media C≈11 por perfil Instagram completo:

| Chaves (contas free distintas) | Creditos/mes | Perfis/mes (1 coleta) | Perfis/mes (2 coletas) |
|--------------------------------|-------------:|----------------------:|-----------------------:|
| 1 | 5.000 | ~450 | ~225 |
| 5 | 25.000 | ~2.270 | ~1.135 |
| 10 | 50.000 | ~4.540 | ~2.270 |

Com 25% de reserva (erros/retry/poll): multiplique por **0,75**.

Se a conta cobrar **1 credito por request** (3 requests IG): capacidade sobe ~3×.  
So o painel BD da conta fecha a conta.

### 6.4 Pool de chaves e 5k

- Chaves **globais** (sem split IG/TT); so entram workers **com credito**.
- Ate 20 contas com credito em paralelo (`SCRAPE_MAX_PARALLEL_KEYS`); acelera o tempo de parede e multiplica o gasto entre contas distintas.
- Mesma conta BD em varias chaves = **mesmo** silo de 5k.
- Saldo: `GET /customer/balance` (Account Management; precisa permissao de billing). Fallback: estimativa local free tier.

---

## 7. Decisoes de produto travadas pela API oficial

1. **So Web Scraper API** — sem browser/proxy local.
2. **`/scrape` + snapshot residual** — sync oficial + HTTP 202.
3. **Poll de snapshot** — jobs alem de ~1 min.
4. **`num_of_posts` no input** — economia na origem.
5. **3 datasets IG / 2 TT** — perfil + conteudo recente.
6. **Chaves globais + filtro por credito** — pool unico; silo 5k por conta.
7. **Balance API** para saldo quando permitido; senao estimativa local.
8. **Anti-recoleta 30 min** + **biblioteca upsert**.
9. **Import so dos IDs importados** — nunca `all` por acidente.
10. **estimatedCredits ≠ fatura**.

---

## 8. Checklist antes de mudar scraping

- [ ] Endpoint ainda e o da doc v3 (`/scrape`, `/progress`, `/snapshot`)?
- [ ] Body e query batem com o dataset (discover params)?
- [ ] `num_of_posts` (ou equivalente) limita **no request**?
- [ ] Timeout/poll cobrem o caso 202 + snapshot?
- [ ] Erro mapeado para `authentication|account|transient|provider|not_found`?
- [ ] Impacto em **5k/conta** e credito de worker documentado?
- [ ] Teste unitario **sem** chamar BD real?

---

## 9. Links oficiais uteis

- Free tier: https://docs.brightdata.com/general/account/billing-and-pricing/free-tier
- Total balance: https://docs.brightdata.com/api-reference/account-management-api/Get_total_balance_through_API
- Scrapers overview: https://docs.brightdata.com/datasets/scrapers/scrapers-library/overview
- Sync scrape: https://docs.brightdata.com/api-reference/scrapers/synchronous-requests
- Async trigger: https://docs.brightdata.com/api-reference/rest-api/scraper/asynchronous-requests
- Monitor progress: https://docs.brightdata.com/api-reference/scrapers/management-apis/monitor-progress
- Erros por endpoint: https://docs.brightdata.com/datasets/scrapers/scrapers-library/error-list-by-endpoint

Ultima revisao: 2026-07-28 (poll 45x2s, paralelismo 20, regra provider nao esgota no run). Historico 2026-07-10: chaves globais, credito, biblioteca, free tier 5k.
