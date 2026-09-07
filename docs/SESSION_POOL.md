# Pool global de chaves Apify (IG-only)

> Atualizado em 2026-09-07: provedor único Apify. Referência da API em `docs/APIFY_API.md`.

Cada sessão é um **token Apify global**. Não existe chave "só Instagram" ou "só TikTok".
A plataforma é a do **perfil**; o token autentica a conta Apify. **Modo atual: IG-only** —
perfis TikTok são pulados com aviso `unsupported_platform` (sem worker, sem retry, sem custo).

## Estado operacional

- `active`: candidata a worker (se tiver crédito).
- `paused`: fora dos workers (manual ou auth/conta).
- Prisma: `platform` fixo em `global` (legado IG/TT migrado automaticamente).
- Tabela legada: `BrowserSession` (map do model `CollectorSession`).
- `provider`: `apify` (único). Registros com outro valor ficam `no_credit` em runtime
  (`creditsSource = migrated_to_apify`) até migrar para token Apify.

## Crédito (critério principal da fila)

| Estado | Critério | Worker? |
|--------|----------|---------|
| **com crédito** | estimativa local > 0 (`1000 − uso no mês`) | sim |
| **sem crédito** | estimativa 0 / erro de fundos / conta suspensa | **não** |
| **desconhecido** | `unknown` sem `balanceCheckedAt` — **não entra** até `Atualizar saldos` | não |
| **pausada** | `status = paused` | não |

### Como lemos o saldo (Apify)

1. **Estimativa local** (única fonte):  
   `creditsRemaining ≈ 1000 − sum(recordsReceived no mês por sessionId)`.  
   Free Apify ≈ $5 ≈ ~1k requests (simplificado em `FREE_TIER_CREDITS`, `session.ts`).
2. **Sem balance oficial:** Apify não tem `GET /customer/balance` — `balanceUsd` fica `null`.
3. **Erro de coleta** com mensagem de crédito/saldo/402/quota: marca `creditStatus = no_credit`.
4. Sessões com provedor legado ainda no DB são neutralizadas (`no_credit`, sem `deleteMany`).

Botão **Atualizar saldos** em `/settings`. Workers ordenam por **mais crédito remanescente**.

## Workers

- Até `SCRAPE_MAX_PARALLEL_KEYS` (**100**) chaves **com crédito** em paralelo.
- Cada chave: 1 perfil por vez; só Instagram (`scrapeWithApiSession` — resto vira `unsupported_platform`).
- Auth/conta → pausa persistente + esgota neste run. Transient/provider → retry do perfil com outra chave. `not_found`/`snapshot_pending` → não troca chave (`snapshot_pending` não re-dispara run pago).
- Fila UI (`queuePosition`) vale para todo token `apify` com crédito.

## Free tier Apify (~1k)

- 1 **conta** Apify free ≈ 1k requests/mês (estimativa local, sem API oficial de saldo).
- N contas distintas ≈ N × 1k (e N vezes o gasto se paralelizar).
- Cap `all` 200 perfis × 11 ≈ 2200 > 1 conta free — `all` cheio exige **multi-conta** ou `scope profiles` paginado.

## Cadastro

`/settings`: nome + token Apify (sem seletor de plataforma). Exibe com/sem crédito, label de remanescente, fila #N.
