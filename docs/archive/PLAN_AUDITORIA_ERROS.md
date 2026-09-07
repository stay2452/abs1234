# Plano — Auditoria de Erros: perfis com @ mudado / banido (últimas 5 coletas)

Data: 2026-08-30
Solicitante: remover em massa perfis que mudaram de @ ou foram banidos, com base nos erros das últimas auditorias.
Regra do projeto: **tudo em Supabase (Render+Supabase)**, sem SQLite local. Ver `CRITICAL_RULES.md`.

## 1. Problema atual

* `Histórico de Coletas` `src/app/history/page.tsx:14` mostra `ScrapeRun` com `partial_failed` e `failed`, mas exige abrir cada `Auditoria` `src/components/history-detail.tsx:134` para ver `ScrapeAttempt` por dataset. Não há visão consolidada de **quais perfis falharam recentemente**.
* Causas reais de `@` mudado/banido aparecem como `not_found` em `ScrapeAttempt`:
  * `src/lib/scrapers/brightdata-client.ts:148` `isUnavailableTargetError()` → `/page isn't available|user not found|profile not found|does not exist|invalid username|account has been|content isn't available|no user found|profile is private/i`
  * `brightdata-client.ts:421` `classifyBrightDataMessage()` mapeia isso → `errorCode = "not_found"`
  * Exemplo em prod: `[gd_l1vikfch901nx3by4] Perfil ou conteudo indisponivel no provedor: Sorry, this page isn't available.` → `not_found` (visto em `prisma/dev.db` e Supabase `ScrapeRun.errorsJson`)
* Hoje não há ação em massa: `DELETE /api/profiles/[id]/route.ts:90` apaga 1 por vez. Biblioteca acumula perfis mortos, polui rankings e consome `anti-recoleta` + tentativas.

## 2. Objetivo

Nova auditoria derivada: **“Perfis com erro nas últimas 5 coletas”** sobre `Histórico de Coletas`.
* Lista deduplicada dos perfis que falharam em **qualquer** das últimas 5 `ScrapeRun` (por `startedAt DESC`, só `failed`/`partial_failed`/`success` com `errorsJson`).
* Colunas: `@handle` + `plataforma` + `URL` + `último erro` + `código` + `última falha em` + `falhou em X/5 runs`.
* Ação: checkbox por perfil + **Selecionar todos** + **Remover selecionados** (`DELETE` em lote, com confirmação) e **Remover tudo**.

## 3. Mapeamento de erro → candidato à remoção

| `errorCode` em `ScrapeAttempt`/`ScrapeRun.errorsJson` | Significa | Entra na lista? | Fonte |
|---|---|---|---|
| `not_found` | `@` mudou, perfil deletado/banido/privado | **Sim — principal** | `brightdata-client.ts:149,433` + `types.ts:113` |
| `account` com `message` contendo `suspended|banned|account has been` | Banido por plataforma | **Sim** (subconjunto de `account`) | `brightdata-client.ts:426` |
| `provider` com `isUnavailableTargetError` | Mesmo que `not_found` mas sem 401 | **Sim** se mensagem bater regex | `brightdata-client.ts:170` |
| `authentication`/`transient`/`no_session`/`timeout`/`zombie_timeout` | Credencial, rede, sem chave, timeout | **Não** — re-tentável | `types.ts:105`, `scrape-reconcile.ts` |
| `partial_empty` | Grade/Reels vazio (perfil só-reels) | **Não** | `scrapers/index.ts:413` |

Regra: `errorCode IN ('not_found') OR (errorCode='account' AND message ~* 'suspended|banned|account has been') OR (errorCode='provider' AND isUnavailableTargetError(message))`. Demais ficam fora (ruído).

## 4. Arquitetura

```
Supabase (ScrapeRun 1..5) ─┐
                           ├─► GET /api/audits/errors?lastRuns=5 ─► agregação SQL + dedup ─► UI
Supabase (ScrapeAttempt) ──┘                                              │
                                                                          ├─► POST /api/profiles/bulk-delete {profileIds}
                                                                          └─► prisma.profile.deleteMany (cascade)
```

### 4.1 Dados

* **Fonte primária:** `ScrapeAttempt` `prisma/schema.prisma:160` com `status='failed'` e `profileId NOT NULL` dos últimos 5 `ScrapeRun.id`. `ScrapeRun.errorsJson` é secundário (para `no_session` sem `ScrapeAttempt`).
* **Dedup:** `Map<profileId, {lastError, lastFailedAt, failedCount, runs[]}>`. Se perfil falhou em 3 dos 5 runs, `failedCount=3`.
* **Enriquecimento:** `JOIN Profile` para `handle/platform/url/status` atuais. Se `Profile` já foi deletado (`profileId=null` em `ScrapeAttempt` por `onDelete: SetNull`), usa `handle/platform` do `ScrapeAttempt.profile` ou do `errorsJson` (fallback).
* **Ordenação:** `failedCount DESC, lastFailedAt DESC` (mais problemáticos primeiro).

### 4.2 APIs

#### `GET /api/audits/errors?lastRuns=5` (novo)
* **Query:** `lastRuns` 1..10 default 5, `errorCodes=not_found` opcional, `platform=all|instagram|tiktok`.
* **Lógica em `src/lib/audit-errors.ts` (novo):**
  ```ts
  export async function getErrorProfilesFromLastRuns(n=5) {
    const runs = await prisma.scrapeRun.findMany({orderBy:{startedAt:'desc'}, take:n, select:{id:true, startedAt:true}});
    const attempts = await prisma.scrapeAttempt.findMany({
      where:{scrapeRunId:{in: runs.map(r=>r.id)}, status:'failed', profileId:{not:null}, errorCode:{in:['not_found','account','provider']}},
      include:{profile:{select:{id:true, handle:true, platform:true, url:true, status:true}}}
    });
    // filtra isUnavailableTargetError para provider/account, dedup, conta failedCount
  }
  ```
* **Resposta:**
  ```json
  {
    "runs": [{"id":"...","startedAt":"..."}],
    "profiles": [
      {
        "profileId":"cm...",
        "handle":"euauroraofc__",
        "platform":"instagram",
        "url":"https://instagram.com/euauroraofc__",
        "status":"active",
        "lastError":"[gd_l1vikfch901nx3by4] Sorry, this page isn't available.",
        "errorCode":"not_found",
        "lastFailedAt":"2026-08-30T22:29:00.463Z",
        "failedCount":3,
        "failedInRuns":["cmtde00h","cmtc84k4"],
        "postsCount": 12
      }
    ],
    "total": 27
  }
  ```
* **Cache:** `dynamic = force-dynamic`, sem cache (dados mudam a cada run).

#### `POST /api/profiles/bulk-delete` (novo)
* **Body:** `{"profileIds": ["cm...","cm..."]}` via `z.array(z.string().cuid()).min(1).max(100)`
* **Regras:**
  * Valida `profileIds` existem e `status` qualquer.
  * `prisma.$transaction` → `prisma.profile.deleteMany({where:{id:{in:profileIds}}})` (cascade `Post`/`PostSnapshot`/`ProfileFolder` via `onDelete: Cascade`, `ScrapeAttempt.profileId` vira `SetNull` preservando auditoria).
  * Retorna `{deleted: 12, notFound: 2}`.
  * Limite 100 por request (mesmo de `MAX_SCRAPE_PROFILE_IDS`) — frontend pagina “Remover tudo” em chunks de 100.
* **Alternativa já existente:** manter `DELETE /api/profiles/[id]` para 1, novo bulk para N.

### 4.3 UI

**Local:** nova seção em `src/app/history/page.tsx:14` ou página dedicada `src/app/history/errors/page.tsx` (recomendado: rota `/history/errors` com link no header da tabela).
* **Componente** `src/components/error-profiles-panel.tsx` (client):
  * Fetch `GET /api/audits/errors?lastRuns=5` no mount.
  * Tabela: `[checkbox] @handle (platform) | URL | último erro (truncado) | código badge | última falha | falhou X/5` + `[Detalhes]` link para `ScrapeAttempt`.
  * Ações: `Selecionar todos (27)` checkbox master, `Remover selecionados (12)` (disabled se 0), `Remover tudo (27)` com `confirm()` duplo.
  * Ao clicar remover: `POST /api/profiles/bulk-delete` em chunks de 100, mostra `progress` + `toast` + revalida `router.refresh()`.
  * Estado vazio: “Nenhum perfil com erro nas últimas 5 coletas ✅”.

**Integração com `AppShell`:** link “Perfis com erro” no `src/components/app-shell.tsx` ao lado de Histórico.

**Coesão visual:** reutiliza `history-table`, `history-status not_found`, `button secondary`, `FileSearch` ícones já em uso.

## 5. Segurança e regras

* **Sem auth própria** (regra `DECISIONS.md:5`). Bulk delete é destrutivo mas reversível só via re-import. Mitigações:
  * Confirmação modal: “Remover 27 perfis? Posts e snapshots serão apagados (auditoria preservada via SetNull).”
  * Limite 100 IDs por request (evita `414` e payload gigante).
  * Loga `ScrapeRun`/`errorsJson` preservado mesmo após delete (auditoria intacta).
* **Tudo em Supabase:** `GET /api/audits/errors` e `POST /api/profiles/bulk-delete` usam `prisma` com `DATABASE_URL` pooler. Nenhum `file:` ou `prisma/dev.db`. Testes mockam `prisma`.
* **Mínimo trabalho do usuário:** 1 clique “Selecionar todos” + 1 clique “Remover” — sem copiar lista, sem SQL.

## 6. Testes

* **Unit** `src/lib/audit-errors.test.ts` (novo, 4 testes):
  * dedup: perfil com 3 falhas aparece 1 vez com `failedCount=3`
  * filtro: `not_found` entra, `transient` não
  * `provider` com `isUnavailableTargetError` entra, sem regex não
  * ordenação `failedCount DESC`
* **API** `vitest` mock `prisma.scrapeRun.findMany` + `prisma.scrapeAttempt.findMany` para `GET`, e `prisma.profile.deleteMany` para `POST`.
* **E2E manual:** inserir 2 perfis fake com `ScrapeAttempt` `not_found` nas últimas 5 runs, abrir `/history/errors`, selecionar 1, remover, verificar `Profile` deletado e `ScrapeAttempt.profileId=null` mas `ScrapeRun` intacto.

## 7. Fases e esforço

| Fase | Arquivos | Esforço |
|---|---|---|
| **A — Backend** `audit-errors.ts` + `GET /api/audits/errors` | `src/lib/audit-errors.ts`, `src/app/api/audits/errors/route.ts` | 3h |
| **B — Bulk delete** `POST /api/profiles/bulk-delete` | `src/app/api/profiles/bulk-delete/route.ts` | 2h |
| **C — UI** `error-profiles-panel.tsx` + rota `/history/errors` | `src/components/error-profiles-panel.tsx`, `src/app/history/errors/page.tsx` | 4h |
| **D — Docs + CRITICAL_RULES** | `docs/CRITICAL_RULES.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` | 30min |
| **Total** |  | **~1 dia** |

## 8. Alternativas descartadas

* **Deletar já no `runScrape` se `not_found`:** arriscado — @ pode ser temporário (privado), melhor auditoria humana.
* **Marcar `status='paused'` em vez de deletar:** viável, mas solicitante pediu remoção; `paused` manteria biblioteca morta. Fica como opção futura (toggle bulk `paused`).

## 9. Checklist antes de implementar

* [ ] `GET /api/audits/errors` retorna `not_found` apenas, não `transient`/`no_session`
* [ ] `lastRuns=5` param validado 1..10
* [ ] Bulk delete respeita `onDelete: SetNull` (auditoria não perde telemetria)
* [ ] UI com `force-dynamic` + `reconcileZombieRuns()` antes (evita zumbi na contagem)
* [ ] Docs atualizados com nova regra de auditoria de erros

## 10. Próximo passo

Diga `executar auditoria de erros` que eu implemento A+B+C+D (backend, bulk delete, UI, docs) sem SQL manual, tudo em Supabase.
