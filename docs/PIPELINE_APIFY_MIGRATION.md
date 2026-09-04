# Pipeline Completa — Migração Bright Data → Apify (IG 3 actors) — Zero Quebra — CORTE TOTAL BD

> **Decisão final:** Bright Data sai 100%. Nenhuma chave BD permanecerá no projeto. **Princípio mantido:** nenhuma linha vai para `main` sem passar por 4 portões (lint → teste → build → review).

---

## 0. Trava de segurança (Dia 0)

1. **Branch isolada:** `feat/apify-ig-migration` a partir de `main`.
2. **Tag de rollback:** `git tag pre-apify` em `main` (último ponto com BD). Se Apify quebrar, `git revert` volta, mas com BD já removido o rollback será recriar chave BD — por isso o backup é crítico.
3. **Backup de dados:** dump do Supabase (60 da `trans`) — `profiles`, `posts`, `CollectorSession` com chaves BD (serão apagadas).
4. **Sem Feature Flag BD:** `SCRAPER_PROVIDER` removido. Código só conhece `apify`. Não há `dual` — é corte seco.

## 1. Pipeline de Desenvolvimento (cada commit)

```
git commit → Husky pre-commit → GitHub PR → CI (Render/GitHub Actions)
```

| Portão | O que roda | Onde | Quebra se |
|---|---|---|---|
| 1. Lint | `npx eslint src/lib/scrapers/apify-*.ts src/app/api/scrape/run` | local + CI | Erro de tipo |
| 2. Type | `npx tsc --noEmit` | CI | `...` |
| 3. Testes | `vitest run` 17 suites / 79 testes + novos `apify-*.test.ts` (sem BD) | CI | Qualquer falha |
| 4. Build | `npm run build` (Next 15 + Prisma) | CI | Build não gera `.next` |

PR só mergea com 2 aprovações e CI verde.

## 2. Corte total (apaga BD)

```
ANTES:
src/lib/scrapers/
├── brightdata-client.ts
├── brightdata-instagram.ts
├── brightdata-tiktok.ts
└── index.ts (usa BD)

DEPOIS:
src/lib/scrapers/
├── apify-client.ts        (poll run → dataset, igual ao beta D:\Nova pasta (123))
├── apify-instagram.ts     (profile-scraper + post-scraper + reel-scraper, 3 actors)
├── types.ts               (mantido)
└── index.ts               (só apify, sem if provider)
```

Ações de deleção:
- Deletar `brightdata-client.ts`, `brightdata-instagram.ts`, `brightdata-tiktok.ts`, `brightdata-balance.ts`, `brightdata-partial-results.*`
- Remover `provider=brightdata` de `CollectorSession` → só `apify` (limpa `apiKey` BD do `.env`, mantém só `APIFY_TOKEN`)
- Atualizar `docs/BRIGHT_DATA_API.md` → `docs/APIFY_API.md` com contratos `apify/instagram-profile-scraper` etc.
- `.env.example` só terá `APIFY_TOKEN` e `APIFY_IG_ACTOR` (já validado em `D:\Nova pasta (123)\.env.local`)

Tabela `CollectorSession` será truncada (chaves BD apagadas) — não precisa `prisma migrate`, só `deleteMany where provider=brightdata`.

## 3. Testes (pirâmide, sem BD)

1. **Unit (70%)**: `apify-instagram.test.ts` com mocks de `fetch` (sem rede). Cobre `mapApifyPost` (`videoViewCount|viewCount|playCount`), `isRestrictedProfile`, `deduplicate`.
2. **Integração (20%)**: 1 livre `bialombaz` + 1 restrito `drluciigatz` contra Apify FREE (custo ~$0,02). Restrito deve voltar `isRestricted=true` e `posts=[]`.
3. **E2E (10%)**: beta `D:\Nova pasta (123)` com visual igual ao oficial (`Grade 1 / Reels 1`) comparado lado a lado com `/profiles/[id]`.

## 4. Validação em Staging

1. Deploy da branch em preview do Render.
2. Rodar só Apify: `POST /api/scrape/run {scope:"profiles", profileIds: [60 da trans]}` — deve voltar 60 com `followers` preenchidos (exceto 3 restritos: `sou.saori_`, `kamiskiro`, `luanna_tss`).
3. Testar `Atualizar perfil` (1), `Atualizar pasta (60)` (1 lote de 60, limite 100), `Atualizar biblioteca` (cap 200). Todos com anti-recoleta 30min.

## 5. Auditoria (bloqueia merge)

- [ ] **Crédito**: 60×11=660 results Apify = $0,99–$1,78. Medir `usageTotalUsd` real do run.
- [ ] **Dados**: 10 perfis amostrados, `likes/comments/views` existem (views mapeado para `videoViewCount|viewCount|playCount` já corrigido no beta).
- [ ] **Restritos**: 3 da `trans` não quebram run.
- [ ] **Performance**: Apify poll 40×3s ≤ timeout 90s.
- [ ] **Segurança**: `APIFY_TOKEN` nunca em log.
- [ ] **Limpeza BD**: `grep -r brightdata` deve retornar 0 resultados.

## 6. Rollout (corte seco, sem canário dual)

1. Merge para `main` → deploy Render já 100% Apify.
2. Monitora 24h `ScrapeRun` (`success` vs `partial_failed`) e `/api/health`.
3. Rollback se falhar = recriar branch a partir de `pre-apify` (precisará recadastrar chaves BD, pois foram apagadas).

## 7. Pós-migração

- Deletar docs de BD e manter só `APIFY_API.md`.
- Manter backup `D:\tracker apify` por 30 dias, depois apagar.

---

**Garantia de não quebrar:** branch isolada + 4 portões + corte total limpo (sem código morto BD) + validação nos 60 da `trans` antes de 100%. Projeto nunca fica em estado híbrido.
