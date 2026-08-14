# Uso de creditos Bright Data

Referencia de API e free tier: [BRIGHT_DATA_API.md](./BRIGHT_DATA_API.md).  
Pool e saldo por chave: [SESSION_POOL.md](./SESSION_POOL.md).

## Modelo oficial (conta free)

- **5.000 free credits/mes** por conta (Web Scraper API incluso).
- Cada chave em `/settings` = token de **uma conta**.
- N chaves so somam `N × 5k` se forem **contas distintas**.
- Doc free tier: 1 credito por request **ou** record — confirme no painel.

## Quando gasta credito (dataset scrape)

| Acao | Gasta? |
|------|--------|
| Importar + coleta dos IDs novos | sim (apos cadastro local) |
| **Atualizar biblioteca** / atualizar perfil | sim |
| Abrir paginas, rankings, detalhe | nao |
| Atualizar saldos (`/customer/balance`) | nao e coleta de dataset; account management |
| Testes automatizados | nao (sem rede real) |

## Guardas de custo

- Escopo explicito; import ate 500; lotes de coleta 20.
- Anti-recoleta 30 min.
- IG: 3 requests com teto 5+5 no body. TT: 2 requests, 10 videos.
- Workers so usam chaves **com credito**; sem credito sai da fila.
- Auth/conta pausam; `not_found` nao gasta as outras chaves em loop.
- Paralelismo (ate 20 chaves) acelera e **multiplica gasto** entre contas.

## Teto de records (planejamento)

| Plataforma | Pior caso "cheio" por perfil |
|------------|------------------------------|
| Instagram | 1 + 5 + 5 ≈ **11** |
| TikTok | 1 + 10 ≈ **11** |

`estimatedCredits` no app = `requestsMade` (proxy operacional). **Nao** e a fatura BD.

## Estimativa de saldo na UI

| Fonte | Como |
|-------|------|
| Oficial | `GET /customer/balance` → US$ e ~creditos (se a chave tiver permissao) |
| Local | `5000 − registros recebidos no mes por sessionId` |
| Coleta | Erro de fundos/402 → marca sem credito |

## Capacidade free (ordem de grandeza)

Com C ≈ 11 e 25% reserva: ~**340 perfis/mes** por conta free em 1 atualizacao/mes.  
Ver tabela em [BRIGHT_DATA_CAPACITY.md](./BRIGHT_DATA_CAPACITY.md).

## Checklist

1. **Atualizar saldos** em `/settings`; priorizar contas com credito.
2. Nao forcar recoleta sem necessidade.
3. Preferir "Atualizar biblioteca" (respeita 30 min).
4. Comparar `recordsReceived` com o painel BD da conta.
