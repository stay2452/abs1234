# Plano de Migração — Bright Data → Apify (IG-only, 3 actors especializados)

> **Projeto oficial:** `D:\blioteca de perfis zcode 10 07 2026\Nova pasta` (biblioteca-perfis-viral, repo `stay2452/abs1234`)
> **Beta validado:** `D:\Nova pasta (123)` e `D:\tracker apify` (backup) — 3 actors ok: `apify/instagram-profile-scraper`, `apify/instagram-post-scraper`, `apify/instagram-reel-scraper`
> **Escopo decidido:** só IG, 1 actor por coisa (profile 1 + grade 5 + reels 5), Apify FREE sem cartão.

---

## 1. Objetivo

Trocar o provedor de scraping de **Bright Data Datasets** (`gd_l1vikfch901nx3by4`, `gd_lk5ns7kz21pck8jpis`, `gd_lyclm20il4r5helnj`) para **Apify Actors** especializados, mantendo 100% da UI/contrato atual: `Atualizar biblioteca`, `Atualizar pasta (60)` e `Atualizar perfil`.

---

## 2. Arquitetura alvo

| Hoje (BD) | Depois (Apify) |
|---|---|
| `src/lib/scrapers/brightdata-client.ts` (poll snapshot) | `src/lib/scrapers/apify-client.ts` (poll run → dataset) |
| `brightdata-instagram.ts` (3 datasets em `Promise.allSettled`) | `apify-instagram.ts` (3 actors em `Promise.allSettled`: profile/post/reel) |
| `CollectorSession` = N chaves BD (pool `has_credit`) | `CollectorSession` = N tokens Apify (mesmo pool, mesmo `creditStatus`) |
| Custo = `recordsReceived` (11/perfil) | Custo = `results` (11/perfil), mesmo `estimatedCredits` |

Contratos que **não mudam**: `src/lib/scrapers/types.ts` (`ScrapedProfileResult`, `ScrapeDatasetUsage`), `src/lib/scrapers/scope.ts`, `src/lib/scrapers/index.ts` (`shouldScrapeProfile` 30min, `MAX_SCRAPE_PROFILE_IDS=100`, `MAX_SCRAPE_ALL_PROFILES=200`), `POST /api/scrape/run` e `RunScrapeButton`.

---

## 3. Fases

### Fase 0 — Congelamento (0,5 dia)
- [ ] Travar `main` para mudanças de scraping (`docs/*` já atualizado).
- [ ] Tag `pre-apify` no git para rollback 1-clique.
- [ ] Snapshot da pasta `trans` (60 handles) para baseline de comparação.

### Fase 1 — Execução (3 dias)

**Dia 1 — Infra**
- [ ] Criar `src/lib/scrapers/apify-client.ts` (run actor → poll → dataset, espelhando `brightdata-client.ts:355`).
- [ ] Criar `src/lib/scrapers/apify-instagram.ts` com `mapApifyProfile`, `mapApifyPost`, `mapApifyReel` (reuso de `flatten`/`sortRecentPosts`).
- [ ] Estender `CollectorSession` para aceitar `provider=apify` + `APIFY_TOKEN` em `src/lib/scrapers/session.ts` (manter BD como fallback via `provider`).

**Dia 2 — Orquestração**
- [ ] Adaptar `src/lib/scrapers/index.ts:323` (`scrapeWithApiSession`) para `if provider===apify → scrapeApifyInstagramProfile()` else BD.
- [ ] Manter `executeAttempt`/`persistScrapeResult`/`deduplicateScrapedPosts` idênticos — só muda a origem dos `ScrapedPost[]`.
- [ ] Feature-flag env `SCRAPER_PROVIDER=brightdata|apify|dual` (dual = tenta Apify, fallback BD se `no_session`).

**Dia 3 — UI**
- [ ] Nenhuma mudança visual — `RunScrapeButton` (`mode="folder"`) já está pronto; só troca texto de `Bright Data` para `Apify` nos `confirm`/`progressDetail` quando `provider=apify`.

### Fase 2 — Validação (2 dias)

**Validação técnica (local, sem gastar produção)**
- [ ] `npx tsc --noEmit` + `vitest run` (17 suites, 79 testes) + `npm run build` — todos devem passar.
- [ ] Teste beta isolado (já validado): `drluciigatz` (+18 → só perfil) vs `bialombaz` (livre → grade 5 + reels 5). Reaproveitar `D:\Nova pasta (123)` como harness.
- [ ] Teste de paridade nos 60 da `trans` em `dual` mode: rodar `POST /api/scrape/run {scope:"profiles", profileIds: [...60]}` 1× via BD e 1× via Apify, comparar `followers`, `postsNew`, `recordsReceived` (tolerância <10% de divergência).

**Validação funcional**
- [ ] `Atualizar perfil` (1) → `Atualizar pasta (60)` (1 lote) → `Atualizar biblioteca` (cap 200) — os 3 botões.
- [ ] Perfis restritos (`sou.saori_`, `kamiskiro`, `luanna_tss` mapeados na auditoria) devem voltar `profileDataFound=true` mas `posts=[]` sem quebrar o run.
- [ ] Perfis `not_found` (ex: `paoladesouzagama`) continuam `not_found` sem retry de chave.

### Fase 3 — Auditoria (1 dia)

Checklist obrigatório antes do deploy:

- [ ] **Crédito:** `apify/instagram-profile-scraper` 1 result = 1 crédito Apify? Medir `usageTotalUsd` de 1 run de 60 e comparar com `5000×0,75=3750` do BD. Confirmar que Apify free $5 = ~168 perfis vs BD 340.
- [ ] **Dados:** followers, views, likes, comments de 10 perfis amostrados batem entre BD e Apify (±5%)?
- [ ] **Performance:** `estimateScrapeMaxSeconds(60, 5)` com Apify ≤ BD? Poll 40×3s já está ok, mas medir parede real.
- [ ] **Segurança:** `APIFY_TOKEN` nunca logado (`safeProviderDetail`), só telemetria `recordsReceived/status` (igual BD).
- [ ] **Resiliência:** `transient`/`provider` → retry outra chave; `snapshot_pending` → não retenta (mesma regra BD); `persist_error` → não re-dispara coleta paga.
- [ ] **Rollback:** `git revert` para `pre-apify` + `SCRAPER_PROVIDER=brightdata` volta em <5 min, sem migração de DB (schema não muda).

### Fase 4 — Rollout (1 dia)

1. Merge para `main` com flag `apify` OFF → deploy no Render (health `/api/health` ok).
2. Liga `dual` para 1 pasta canário (`trans` 60) por 1 dia.
3. Se canário ok → `SCRAPER_PROVIDER=apify` 100% → monitora 24h.
4. Se falhar → `SCRAPER_PROVIDER=brightdata` (rollback instantâneo).

---

## 4. Riscos

- **Apify free trava 3/run** no `post-scraper`/`reel-scraper` de terceiros, mas o oficial `apify/instagram-scraper` não tem essa trava — por isso escolhemos os 3 **oficiais** validados. Mesmo assim, `profile-scraper` free tem 8 runs/dia: 60 em 1 conta free levaria 8 dias; por isso o beta roda 1 perfil por vez. Em produção com 1 conta Apify paga ou pool de 20 free, o limite some.
- **Views de reels** vêm como `videoViewCount`/`playCount` (já corrigido no beta). Auditoria deve validar o mapeamento.

---

## 5. Entregáveis

- Código: `apify-client.ts`, `apify-instagram.ts`, `session.ts` (pool Apify), `index.ts` (switch provider), `.env.example` com `APIFY_TOKEN`.
- Docs: atualizar `docs/BRIGHT_DATA_API.md` → `docs/SCRAPER_PROVIDER.md` com contratos Apify.
- Testes: `apify-instagram.test.ts` espelhando `brightdata-instagram.test.ts` sem rede real.

---

## 6. Próximo passo

Aguardando seu **OK** para começar Fase 1 no projeto oficial. Estimativa total: **6-7 dias corridos**.
