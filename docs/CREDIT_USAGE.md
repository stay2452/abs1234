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

`estimatedCredits` no app = `recordsReceived` (registros entregues — a BD cobra por registro; antes usava `requestsMade`, que subestimava ~3.6x). **Nao** e a fatura BD.

## ⚠️ Dataset de COMENTARIOS (Vault IA) — custo alto e limitado (2026-08-31)

**Causa raiz do sumidouro de 5 contas em 31/08:** o dataset `gd_ltppn085pokosxh13` (Instagram Comments) entrega **1 registro POR COMENTARIO** do post. O Vault analisa posts **outliers** (virais, 10x-150x baseline) — que têm milhares de comentarios. `.slice(0, 20)` no app acontece DEPOIS da entrega/cobranca. Resultado: uma unica analise de post mega-viral pode custar **milhares de creditos**; 5 contas (5k cada) foram consumidas em ~25 min de "Analise com IA" (evento `Billing: Conta suspenso automatico` no painel quando saldo zera → `Customer is not active` em toda chamada seguinte).

Regras obrigatorias desde 2026-08-31 (`src/app/api/vault/analyze-ai/route.ts`):

1. **`limit_per_input=20`** no trigger de comentarios — teto de 20 registros/post por coleta (≈20 creditos), independente do tamanho do post. Verificado no painel: sem isso o gasto e ilimitado.
2. **Timeout (90s) NAO cancela a cobranca** — a coleta continua no lado BD e entrega tudo. O timeout existe so para a UI nao travar.
3. **`Customer is not active` = conta com credito zerado/suspensa pelo Billing.** Pausa a chave automaticamente no pool e **nao reprova** a entrada (fica pendente). Falha de provedor nunca vira REPROVADO.
4. Antes de rodar "Analise com IA (todos)" em massa, conferir creditos reais no painel BD (o saldo da UI e estimativa local e **mente** quando a conta ja foi suspensa).

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
