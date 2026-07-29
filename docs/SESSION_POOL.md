# Pool global de chaves Bright Data

Cada sessao e uma **chave API global**. Nao existe mais chave "so Instagram" ou "so TikTok".
A plataforma e a do **perfil**; a chave autentica a conta Bright Data.

## Estado operacional

- `active`: candidata a worker (se tiver credito).
- `paused`: fora dos workers (manual ou auth/conta).
- Prisma: `platform` fixo em `global` (legado IG/TT migrado automaticamente).
- Tabela legada: `BrowserSession` (map do model `CollectorSession`).

## Credito (criterio principal da fila)

| Estado | Criterio | Worker? |
|--------|----------|---------|
| **com credito** | saldo oficial > 0 **ou** estimativa local > 0 | sim |
| **sem credito** | saldo 0 / erro de fundos / free 5k do mes esgotado (estimado) | **nao** |
| **desconhecido** | ainda nao consultado (tratado com estimativa ao listar) | sim se estimado > 0 |
| **pausada** | `status = paused` | nao |

### Como lemos o saldo

1. **Oficial:** `GET https://api.brightdata.com/customer/balance`  
   - Campos: `balance`, `pending_balance` (US$).  
   - Precisa de **permissao de billing** na API key; chaves so de scraper costumam retornar **403**.  
   - Conversao de referencia free tier: ~5000 creditos ≈ US$ 7,50.

2. **Estimativa local** (quando 403 ou falha):  
   `creditsRemaining ≈ 5000 − sum(recordsReceived no mes por sessionId)`.

3. **Erro de coleta** com mensagem de credito/saldo/402: marca `creditStatus = no_credit`.

Botao **Atualizar saldos** em `/settings`. Workers ordenam por **mais credito remanescente**.

## Workers

- Ate `SCRAPE_MAX_PARALLEL_KEYS` (**20**) chaves **com credito** em paralelo.
- Cada chave: 1 perfil por vez; adaptador IG ou TT pelo `Profile.platform`.
- Auth/conta → pausa persistente. Provider → esgota neste run. Transient → so o perfil re-tenta. not_found → nao troca chave.

## Free tier 5k

- 1 **conta** BD = 5k/mes. Varias chaves da mesma conta = **mesmo** saldo.
- N contas distintas ≈ N × 5k (e N vezes o gasto se paralelizar).

## Cadastro

`/settings`: nome + API key (sem seletor de plataforma). Exibe com/sem credito, label de remanescente, fila #N.
