# Uso de créditos Apify (IG-only)

> Atualizado em 2026-09-07: provedor único Apify (free ~1k/conta).
> Pool e saldo por chave: [SESSION_POOL.md](./SESSION_POOL.md).

## Modelo atual (conta Apify free)

- **~1k requests/mês** por conta free (estimativa local — Apify não expõe balance oficial).
- Cada token em `/settings` = **uma conta** Apify.
- N tokens só somam `N × 1k` se forem **contas distintas**.
- Medir sempre no painel Apify da conta (console → usage).

## Quando gasta crédito (actor run)

| Ação | Gasta? |
|------|--------|
| Importar + coleta dos IDs novos | sim (após cadastro local) |
| **Atualizar biblioteca** / atualizar perfil | sim (3 actors IG por perfil) |
| Abrir páginas, rankings, detalhe | não |
| Atualizar saldos (estimativa local) | não é run de actor |
| Testes automatizados | não (sem rede real) |
| Perfis TikTok no run | **não** — pulados com `unsupported_platform` |

## Guardas de custo

- Escopo explícito; import até 500; lotes de coleta 20; cap `all` 200.
- Anti-recoleta 30 min (`max(snapshotAt, lastPostsScrapeAt)`).
- IG: 3 actors com teto 5+5 no input. Pre-flight `perfis × 11 > saldo` aborta antes de começar.
- Workers só usam chaves **com crédito**; sem crédito sai da fila.
- Auth/conta pausam; `not_found`/`snapshot_pending`/`unsupported_platform` não gastam as outras chaves em loop.
- Paralelismo (até 100 chaves) acelera e **multiplica gasto** entre contas.

## Teto de records (planejamento)

| Plataforma | Pior caso "cheio" por perfil |
|------------|------------------------------|
| Instagram | 1 + 5 + 5 ≈ **11** |
| TikTok | pausado (0 — pulado sem custo) |

`estimatedCredits` no app = `recordsReceived` (proxy operacional). **Não** é a fatura Apify.

## Vault (sem IA desde 2026-09-01)

Vault não gasta crédito desde 2026-09-01 — IA e dataset de comentários foram removidos.
`POST /api/vault/scan` é local (outlier 6x6) e `PatternVaultEntry` já é winner direto.
Ver histórico em `DECISIONS.md`.

## Estimativa de saldo na UI

| Fonte | Como |
|-------|------|
| Local (única) | `1000 − registros recebidos no mês por sessionId` |
| Coleta | Erro de fundos/quota/402 → marca sem crédito |
| Legado BD | `migrated_to_apify` → `no_credit` forçado |

## Capacidade free (ordem de grandeza)

Com C ≈ 11 e 25% reserva: ~**68 perfis/mês** por conta free Apify em 1 atualização/mês
(`1000 × 0,75 / 11`). Na prática: pool multi-conta (ex. 73 tokens → ~5k perfis/mês).

## Checklist

1. **Atualizar saldos** em `/settings`; priorizar contas com crédito.
2. Não forçar recoleta sem necessidade (`force` exige `X-Confirm-Force: 1`).
3. Preferir "Atualizar biblioteca" (respeita 30 min + cap 200).
4. Comparar `recordsReceived` com o painel Apify da conta.
