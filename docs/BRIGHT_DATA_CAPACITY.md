# Capacidade Bright Data — free tier 5k e multiplas contas

> Atualizado em 2026-07-28. Free tier oficial: **5.000 creditos/mes por conta**.  
> Nome anterior `BRIGHT_DATA_CAPACITY_500K.md` (legado — base de planejamento sempre foi 5k por conta).

Ver: [BRIGHT_DATA_API.md](./BRIGHT_DATA_API.md), [CREDIT_USAGE.md](./CREDIT_USAGE.md), [SESSION_POOL.md](./SESSION_POOL.md).

## Premissas

1. Cada chave com credito = token de **uma conta** BD.
2. Free tier: **5.000/mes** por conta (Web Scraper incluso).
3. Capacidade ≈ `contas_distintas × 5000` (nao "numero de linhas em settings" se forem a mesma conta).
4. C medio por atualizacao completa ≈ **11 records** (IG 1+5+5 ou TT 1+10) se cobranca por record — medir no painel.
5. Reserva **25%** (erros, retry, poll).
6. Workers: ate **20** chaves com credito em paralelo (`SCRAPE_MAX_PARALLEL_KEYS`); acelera tempo, multiplica gasto.

## Orcamento

| Escala | Bruto / mes | Util 75% |
|--------|------------:|---------:|
| 1 conta free | 5.000 | 3.750 |
| 10 contas free | 50.000 | 37.500 |
| 100 contas free (≈500k) | 500.000 | 375.000 |

## Formula

```txt
perfis_por_mes = (K * 5000 * 0.75) / (C * atualizacoes_por_mes)
```

Exemplos com **C = 11** e **1 atualizacao/mes**:

| Contas free (K) | Perfis/mes |
|----------------:|-----------:|
| 1 | ~340 |
| 5 | ~1.700 |
| 10 | ~3.400 |
| 100 | ~34.000 |

1 conta + 1 coleta/dia ≈ **11 perfis/dia**.

## Tempo de parede (ordem de grandeza)

~1–3 min/perfil **por chave**. Com 20 chaves com credito em paralelo, ~20 perfis ao mesmo tempo  
→ 30 perfis na ordem de **~10–15 min** em vez de ~40–90 min com 1 chave.

## Como medir C

1. Uma chave + um perfil (autorizacao explicita).
2. Painel BD antes/depois.
3. Coleta completa (3 datasets IG ou 2 TT).
4. `C_painel` e `C_records` do `ScrapeRun`.
5. Atualizar este arquivo e `CREDIT_USAGE.md`.

## Operacao

| Objetivo | Acao |
|----------|------|
| Caber no free de 1 conta | Poucos perfis ou poucas atualizacoes |
| Mais velocidade | Varias **contas** free com credito ativas (paralelo) |
| Nao gastar conta zerada | Atualizar saldos; workers ignoram sem credito |
| Proteger 5k | 30 min anti-recoleta, num_of_posts, sem scrape em page load |
