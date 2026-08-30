# Plano — Correção da Auditoria / Histórico de Coletas

Data: 2026-08-30
Base: print `Histórico de Coletas` (4 RUNNING zumbis + N PARTIAL_FAILED) + código `src/lib/scrapers/index.ts:800`, `src/app/api/scrape/run/route.ts:9`, `src/app/history/page.tsx:14`

## 0. Diagnóstico resumido

| Sintoma no print | Causa raiz | Severidade |
|---|---|---|
| `RUNNING` há 2-22 dias (`118/240`, `68/240`, `154/216` com `em andamento`) | `ScrapeRun.status=running` e `finishedAt=null` nunca finalizado. `runScrape()` só grava `failed` no `catch:1009`. Se o processo Next morre (Render restart/deploy/OOM), o `finally` não roda. Lock `globalForScrape.activeScrape:9` é só em memória e some no restart, deixando zumbi no DB. | **P0** — bloqueia leitura, mente auditoria, pode re-coletar perfis já feitos |
| `PARTIAL_FAILED` 16-29% erro (`165/219 ok, 54 erro`) | `not_found` (`Sorry, this page isn't available` em `gd_l1vikfch901nx3by4`) — perfil deletado/privado. Classificado correto em `getScrapeRunStatus:429` (filtra `not_found`/`partial_empty`). Não é bug, mas polui `errorsJson` sem distinção visual. | P1 — ruído |
| `0 com erro` nos RUNNING mas `profilesFinished < profilesTotal` | `profilesFinished` só incrementa em `recordRunAttemptProgress:381` quando `finalProfileOutcome=true`. Enquanto o lote está em workers paralelos, a conta fica defasada e `errors[]` fica vazio até falhar. UI parece “sucesso parcial” mesmo estando travado. | P1 |
| Sem timeout / sem heartbeat | Poll Bright Data 45×2s `brightdata-client.ts`, mas run inteiro sem deadline. `SCRAPE_MAX_SECONDS_PER_PROFILE=180s` `scrape-eta.ts:10` existe só para UI, não é enforce. | P0 |
| Endpoint sem auth | `POST /api/scrape/run` aceita qualquer origem (CORS liberado `extension-cors.ts`). Qualquer visitante pode queimar 5k créditos. | P0 |
| Pasta com acento/espaço | `D:\blioteca de perfis zcode...` quebra `prisma`, `spawn` em `scripts/start.mjs:46` em CI/Linux | P2 |

---

## 1. Fase P0 — Estabilizar (1-2 dias) — FAZER PRIMEIRO

### 1.1 Limpeza imediata dos zumbis (hotfix DB)
**Arquivos:** nenhum código, SQL direto no Supabase.

```sql
-- ver zumbis
SELECT id, "startedAt", "currentActivity", "profilesFinished", "profilesTotal"
FROM "ScrapeRun" WHERE status='running' ORDER BY "startedAt" DESC;

-- marcar como failed (preserva histórico, libera auditoria)
UPDATE "ScrapeRun"
SET status='failed',
    "finishedAt"=NOW(),
    "currentActivity"='Marcado como falha: timeout zumbi (sem heartbeat >2h)',
    "errorsJson" = COALESCE("errorsJson",'[]')::jsonb || '[{"errorCode":"zombie_timeout","error":"Run travado sem finalizacao - processo reiniciado"}]'::jsonb
WHERE status='running' AND "startedAt" < NOW() - INTERVAL '2 hours';
```

**Critério de aceitação:** `SELECT count(*) FROM "ScrapeRun" WHERE status='running'` = 0; print não mostra mais `em andamento` com dias.

### 1.2 Timeout + heartbeat no orquestrador
**Arquivos:** `src/lib/scrapers/index.ts:800`, `src/lib/scrape-eta.ts:12`

- Calcular deadline no início do `runScrape`:
  ```ts
  const deadlineMs = estimateScrapeMaxSeconds(profiles.length, sessions.length) * 1000 + 5*60*1000; // margem 5min
  const hardTimeout = setTimeout(async () => {
    await prisma.scrapeRun.update({ where:{id:run.id}, data:{ status:"failed", finishedAt:new Date(), currentActivity:"Timeout global - coleta excedeu tempo máximo" }});
  }, deadlineMs);
  ```
- `setRunActivity:351` já faz `UPDATE currentActivity` — usar como heartbeat. Adicionar `heartbeatAt` em `ScrapeRun` (nova coluna `DateTime?`) ou reutilizar `updatedAt`.
- No `catch/finally:1009` sempre limpar `hardTimeout` e garantir `finishedAt`.

**Critério:** run de 240 perfis com 20 chaves não pode ficar > `waves*3min + 5min` (≈ 36min). Após isso, auto-`failed`.

### 1.3 Lock persistente (não só em memória)
**Arquivos:** `src/app/api/scrape/run/route.ts:9`, `src/lib/db.ts`, `scripts/start.mjs:51`

Problema: `globalForScrape.activeScrape` some no restart → 2 coletas concorrentes gastam 2× créditos.

Solução A (simples, recomendada):
- Antes de `runScrape`, `SELECT ... WHERE status='running' FOR UPDATE` — se existir `running` com `startedAt > NOW()-2h`, retorna 409 com `retryAfter`.
- Dentro do `runScrape`, todo `setRunActivity/recordRunAttemptProgress` já usa `withDbWriteRetry`, mantém atomicidade.

Solução B (robusta): criar `ScrapeLock` tabela (`id, runId, lockedAt`). `start.mjs:51` no boot faz `UPDATE ScrapeRun SET status='failed' WHERE status='running'` (limpeza de crash).

**Critério:** 2 `POST /api/scrape/run` simultâneos → 1×200, 1×409 com mensagem `Ja existe uma atualizacao em andamento`; após `kill -9` do server, novo request não cria duplicata, mas limpa zumbi.

### 1.4 Garantir finalização mesmo em crash
**Arquivos:** `src/app/api/scrape/run/route.ts:63`, `src/lib/scrapers/index.ts:836`

- No modo `stream:true`, o `promise.finally` `route.ts:98` limpa `activeScrape` mas não finaliza `ScrapeRun` se cliente fecha aba (já tratado com `safeWrite` mas não com DB).
- Mover `prisma.scrapeRun.update({status:failed})` para `process.on('SIGTERM')` em `scripts/start.mjs:52` — antes do `child.on('exit')`, fazer `UPDATE ... WHERE status='running'`.

**Teste:** `vitest` novo `src/lib/scrapers/zombie.test.ts` — mock `prisma.scrapeRun.create` + `setTimeout` + `SIGTERM` simulado.

---

## 2. Fase P1 — Auditoria confiável (2-3 dias)

### 2.1 Melhorar `GET /api/history` e `history/page.tsx`
**Arquivos:** `src/app/api/history/route.ts:7`, `src/app/history/page.tsx:14`, `src/app/history/[id]/page.tsx`

- Na query, computar `isZombie = status==='running' && startedAt < now-2h`.
- Na UI, mostrar `RUNNING (zumbi?)` com badge laranja + `Duração: 2d 3h (travado)` em vez de `em andamento`.
- Adicionar colunas: `Créditos est.` (`estimatedCredits`) e `Taxa erro` (`(profilesFinished-profilesOk)/profilesFinished`).
- Auto-refresh a cada 10s se houver `running` (hoje é `force-dynamic` sem poll).

### 2.2 Separar `not_found` de erro real em `errorsJson`
**Arquivos:** `src/lib/scrapers/index.ts:429`, `src/components/history-detail.tsx:87`

- Hoje `getScrapeRunStatus` filtra `not_found`/`partial_empty` para status, mas `errorsJson` ainda guarda todos. Na UI de auditoria, mostrar 2 abas: `Falhas reais (provider/transient/account)` vs `Perfis indisponíveis (not_found)` — reduz ruído dos 54 erros `Sorry, this page isn't available`.
- Adicionar `errorCode` na tabela `history-detail.tsx:140` com cor distinta.

### 2.3 Lock visual + progresso honesto
**Arquivos:** `src/lib/scrapers/index.ts:359`, `src/app/api/scrape/run/route.ts:58`

- `progress/datasetsCompleted` já existe, mas `profilesFinished` só incrementa no final do perfil. Durante `RUNNING`, mostrar `em processamento: X em workers` via `currentActivity` (já atualizado `Worker ${session.name}: @${handle}` `index.ts:680`).
- Expor via `GET /api/history/[id]/route.ts` o `currentActivity` para poll.

---

## 3. Fase P2 — Operação e segurança (1 semana)

### 3.1 Auth no scrape
**Arquivos:** `src/app/api/scrape/run/route.ts:17`, `src/app/api/profiles/import/route.ts`

- Middleware: checar `Authorization: Bearer <CRON_SECRET>` ou `x-scrape-token` == `process.env.SCRAPE_SECRET`. Sem isso, `401`.
- Manter CORS para extensão `extension-cors.ts`, mas só `GET /api/health` e `POST /api/profiles/import` ficam públicos.
- Adicionar `CRON_SECRET` em `.env.example` e Render env.

### 3.2 Renomear pasta e limpar legado
**Arquivos:** `prisma/dev.db`, `dwadaw/`, `tmp/`, `eslint.config.mjs`

- Renomear `D:\blioteca de perfis zcode 10 07 2026\Nova pasta` → `D:\biblioteca-perfis` (sem acento/espaço).
- Remover `prisma/dev.db*` do repo (já é SQLite dev, não deve ir para prod). Adicionar em `.gitignore`.
- `npm run lint` + `npm run build` pós-rename para garantir `scripts/start.mjs:6` resolve.

### 3.3 Cron de reconciliação (Render)
**Arquivos:** novo `src/app/api/cron/reconcile/route.ts` + `vercel.json`/`render.yaml`

- Job a cada 30min: `UPDATE ScrapeRun SET status='failed' WHERE status='running' AND startedAt < NOW() - INTERVAL '2 hours'`.
- Loga em `ScrapeRun.errorsJson` para auditoria.

### 3.4 Testes e monitoramento
- `vitest` `scope.test.ts`, `index.test.ts` já cobrem `shouldScrapeProfile`. Adicionar testes para `getScrapeRunStatus`, `deadline`, `zombie detection`.
- Adicionar `GET /api/health` já existente para retornar `runningRuns count` + `lastRun status`.

---

## 4. Ordem de execução e esforço

| Ordem | Tarefa | Esforço | Risco se não fizer |
|---|---|---|---|
| 1 | SQL hotfix zumbis (1.1) | 10 min | auditoria mentirosa continua |
| 2 | Timeout + heartbeat (1.2) | 4h | novos zumbis |
| 3 | Lock persistente + SIGTERM (1.3+1.4) | 6h | 2 coletas paralelas queimam créditos |
| 4 | UI auditoria zombie badge + poll (2.1) | 4h | usuário não sabe que travou |
| 5 | Separar not_found (2.2) | 2h | ruído 25% |
| 6 | Auth (3.1) | 3h | gasto malicioso |
| 7 | Rename/cleanup (3.2) | 1h | CI quebra em Linux |
| 8 | Cron reconcile (3.3) | 2h | zumbis voltam após deploy |

**Total estimado:** 2-3 dias P0+P1, +1 dia P2.

## 5. Validação

- Após P0: `SELECT status FROM "ScrapeRun" ORDER BY "startedAt" DESC LIMIT 10` — nenhum `running` com `startedAt < NOW()-2h`.
- `npm run test` — 74 testes existentes + 3 novos passam.
- `npm run build` — sem erro `react-hooks/set-state-in-effect` (único lint atual).
- Teste manual: iniciar `POST /api/scrape/run {scope:"all"}` com 240 perfis, matar `next dev` com `Ctrl+C` mid-run, reiniciar e verificar que run foi marcado `failed` (não `running`).

## 6. Próximo passo

Diga `executar P0` que eu já aplico 1.1–1.4 (crio `heartbeatAt`, corrijo `route.ts:9` e `index.ts:800` e gero migration). Se preferir só o hotfix SQL, eu te entrego o comando pronto para colar no SQL Editor do Supabase.
