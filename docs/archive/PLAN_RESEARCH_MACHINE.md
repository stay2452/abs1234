# Plano — Máquina de Research (Ch.5) — Pattern Vault + 6-before/6-after

Data: 2026-08-30
Base: prints OFM Vault Pro Ch.5 Research + Ch.6 Production (The List) — aula completa
Regra: tudo em Supabase + Render, sem `file:` local. Ver `CRITICAL_RULES.md`.

## 0. O que a aula manda e o que sua Biblioteca já faz

| Aula (OFM Vault Pro) | Biblioteca hoje | Gap |
|---|---|---|
| **Ninguém inventa viral.** Pesquisar 2h/dia, todo dia, ritmo fixo. | Coleta `Instagram` `gd_lk5ns7kz21pck8jpis/reels` + `TikTok` `gd_m7n5...` via Bright Data, 5+5 por perfil, `Post`/`PostSnapshot` com `views/likes/comments/shares` | Não há ritmo nem métrica de outlier |
| **1 research account por creator em celular dedicado, nunca na conta da modelo** `Creator A/B/C → her look/niche/patterns` | `Profile` é só alvo viral, não há `Creator` nem `ResearchAccount` | Sem vínculo creator ↔ feed treinado |
| **6-before / 6-after baseline:** video 130K só é winner se média dos 6 antes + 6 depois = 50K → **2× baseline**. Seguidores não importam, outlier sim. | Já tem `Post.publishedAt` + `PostSnapshot.views` ordenáveis por `publishedAt` | Não calcula |
| **2 checks antes do Vault:** `1) minha creator consegue fazer?` + `2) quem comentou? (língua, país, frases reais vs "beautiful baby", ratio comentários/views)` | Mostra `caption` e `views/likes/comments` mas sem ratio nem país | Falta decisão |
| **Ratios tell the truth:** `3M/80c = rage bait lixo`, `2M/500c = ouro`. `25-50% Tier3 sem poder de compra = pular`. Som também importa (evitar som que todo OFM usa). | `rankings.ts` já calcula `engagement`, mas não `comments/views` nem `Tier` | Falta filtrar |
| **Pattern Vault (The Archive):** todo winner/outlier salvo pra sempre, tagueado. “2h de research bem arquivado = 1 semana de conteúdo”. É o 1º treino de qualquer contratado. | Biblioteca acumulativa solta (`Post` + `sourceType`), sem `pattern/sound/outfit` | Não é Vault |

**Objetivo desta máquina:** transformar `Biblioteca` solta em `Vault` que decide SOZINHO se é outlier e só deixa salvar se passar nos checks, vinculado a uma `Creator` e à sua `ResearchAccount`.

## 1. Modelo de dados (Supabase)

### 1.1 Novas tabelas

```prisma
// Creator da operação — dona da ResearchAccount (não é a modelo que posta)
model Creator {
  id          String   @id @default(cuid())
  name        String   // "Creator J - Techno girl"
  look        String?  // "morena, tatuagem, etc"
  niche       String?  // "techno, safe content only"
  patterns    String?  // notas livres
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  researchAccounts ResearchAccount[]
  vaultEntries     PatternVaultEntry[]

  @@index([name])
}

model ResearchAccount {
  id         String   @id @default(cuid())
  creatorId  String
  platform   String   // "instagram" | "tiktok"
  handle     String   // @ da conta de pesquisa (não da modelo)
  phoneLabel String?  // "iPhone 7 - Creator J" (infra física)
  niche      String?  // cópia do nicho para o feed
  status     String   @default("active") // active | paused | burned
  notes      String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  creator Creator @relation(fields: [creatorId], references: [id], onDelete: Cascade)

  @@unique([creatorId, platform, handle])
  @@index([creatorId, status])
}

// Cofre infinito — só entra winner que passou 6-6 + 2 checks
model PatternVaultEntry {
  id              String    @id @default(cuid())
  creatorId       String?   // link opcional à creator (null = pesquisa geral)
  sourceProfileId String?   // Profile de onde veio o viral (para rastreio)
  sourcePostId    String    // Post que é o outlier
  platform        String
  sourceHandle    String
  sourceUrl       String
  publishedAt     DateTime?

  // Snapshot do momento do arquivamento (congelado, não muda com re-scrape)
  views           Float?
  likes           Float?
  comments        Float?
  shares          Float?
  caption         String?

  // Calculado
  baselineAvg     Float?    // média 6+6
  outlierRatio    Float?    // views / baselineAvg (precisa >=2)
  isOutlier       Boolean   @default(false)
  commentsRatio   Float?    // comments/views*100

  // Curadoria humana (2 checks + tags)
  checkCanDo      Boolean?  // Check 1: creator consegue fazer?
  checkAudience   String?   // Check 2: notas sobre quem comentou (língua/país)
  pattern         String?   // ex: "techno girl, black outfit, car"
  hook            String?   // frase do hook
  sound           String?   // nome do som (evitar som batido OFM)
  outfit          String?
  location        String?
  tags            String?   // csv livre
  notes           String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  creator       Creator? @relation(fields: [creatorId], references: [id], onDelete: SetNull)
  sourceProfile Profile? @relation(fields: [sourceProfileId], references: [id], onDelete: SetNull)
  sourcePost    Post     @relation(fields: [sourcePostId], references: [id], onDelete: Cascade)

  @@unique([sourcePostId, creatorId]) // mesmo post não duplica por creator
  @@index([creatorId, isOutlier])
  @@index([platform, isOutlier])
  @@index([createdAt])
}

// Para completar: Profile precisa de link opcional ao vault? Não — vault aponta para Post/Profile
```

**Migração:** `prisma/migrations/20260831XXXXXX_add_research_machine/migration.sql` — `CREATE TABLE Creator, ResearchAccount, PatternVaultEntry` + índices. `Post` não muda; `6-before/6-after` é calculado em runtime via `Post`/`PostSnapshot` existentes.

### 1.2 O que NÃO criar agora

* `Daily Research Log` — pode ser `PatternVaultEntry.createdAt` + contador. Deixa para Fase 1B.
* Campo `countryTier` automático — Bright Data não devolve país dos comentários no dataset atual; será preenchimento manual no `checkAudience` (futuro: scraper de comentários).

## 2. Lógica de negócio

### 2.1 Cálculo 6-before / 6-after (core)

Local: `src/lib/research/outlier.ts` (novo).

```
Entrada: postId (o candidato 130K)
1. Busca Post + Profile (para saber de qual conta veio)
2. Busca todos os Post do MESMO Profile ordenados por publishedAt ASC
   (usa Post.publishedAt real, não capturedAt — regra rankings.ts:116)
3. Encontra índice do candidato
4. Pega 6 antes e 6 depois (se tiver menos que 6 de cada lado, usa o que tiver, mas marca "amostra curta")
5. Calcula baselineAvg = avg(views dos 12 vizinhos) — usa latest PostSnapshot.views por post
6. outlierRatio = candidateViews / baselineAvg
7. isOutlier = outlierRatio >= 2.0
Retorna {baselineAvg, outlierRatio, isOutlier, neighborsCount, sampleWarning}
```

Fonte de verdade: `src/lib/rankings.ts:191` já faz `latestSnapshot` e `postMatchesPeriod` — reutiliza. `PostSnapshot` guarda `views` por `capturedAt DESC`.

**Caso borda:** `publishedAt = null` (post sem data) → não entra no Vault (só `period=all`). `views = null` → ignora.

### 2.2 2 checks antes do Vault

UI obriga preencher antes de `Salvar no Vault`:

* **Check 1 — Can we do it?** `checkCanDo: boolean` + `pattern/outfit/location` — “Sunset beach in Thailand não vira parede branca | Lambo precisa de Lambo”. Se `false`, botão Salvar desabilita com hint `Pule — sua creator não consegue executar o que fez viralizar`.
* **Check 2 — Comment test** `checkAudience: string` + `commentsRatio` auto — mostra `2M views, 500 comments = 0.025%` vs `3M/80 = 0.002%`. Campo livre para anotar `língua, país, frases reais vs "beautiful baby", 30% Tier3 → pular`.

### 2.3 Ratios

Auto-calculado ao abrir o modal de análise:
* `comments/views*100` e `likes/views*100` (usa `PostSnapshot` latest).
* Badge: `<0.01%` vermelho `rage bait`, `0.02-0.05%` verde `ouro` (thresholds da aula).
* País/Tier: manual em `checkAudience` por enquanto (futura: `GET /comments` do dataset).

## 3. Fluxos e telas

### 3.1 Onde nasce o Vault

**Hoje:** `src/app/profiles/[id]/page.tsx` mostra biblioteca completa. **Novo:** cada card de Post (`src/components/profile-content-tabs.tsx`) ganha botão `Analisar outlier` que abre modal `src/components/research/outlier-modal.tsx`.

Modal:
* Header: `130K views` grande + `baseline 50K (6+6) → 2.6× OUTLIER ✅` ou `1.3× NÃO É OUTLIER ❌`
* Gráfico 13 barras (6 cinza + 1 dourada + 6 cinza) igual print da aula.
* Ratios: `500 comments / 2M = 0.025%` + seletor `Creator` (para vincular)
* 2 checks (checkbox + textarea)
* Botão `Salvar no Vault` (só se isOutlier && checkCanDo)

### 3.2 Vault (nova rota)

* `src/app/vault/page.tsx` — lista `PatternVaultEntry` com filtros `Creator`, `platform`, `isOutlier`, `tags`, `sound`, busca por `handle/caption`.
* Tabela: `Creator | @handle | views | ratio | pattern | sound | data | [Abrir] [Copiar para Lista]`
* `Vault` é o 1º treino — rota linkada no `AppShell` `src/components/app-shell.tsx` ao lado de Auditoria.

### 3.3 Creators & ResearchAccounts (nova rota)

* `src/app/creators/page.tsx` + `src/app/creators/[id]/page.tsx`
* CRUD `Creator` + lista de `ResearchAccount` (1 por creator por plataforma, com `phoneLabel`).
* Aviso da aula: “Never on the model accounts. Never mixed. Permanent machine.” — helper na UI.

### 3.4 APIs

* `POST /api/research/analyze {postId}` → retorna `{baselineAvg, outlierRatio, isOutlier, neighbors}` (sem gravar)
* `POST /api/vault {postId, creatorId, checkCanDo, checkAudience, pattern, hook, sound, outfit, location, tags}` → cria `PatternVaultEntry` (valida isOutlier + checks)
* `GET /api/vault?creatorId=&isOutlier=true&platform=instagram`
* `GET/POST /api/creators` e `/api/research-accounts`
* Tudo `prisma` em Supabase, `dynamic = force-dynamic`, `zod` validado.

## 4. Integração com o que já existe

* **Fonte de dados:** `Post`/`PostSnapshot` já coletados via Bright Data continuam alimentando o cálculo. Não muda `SCRAPING_RULES.md`.
* **Ranking:** `rankPosts` continua para “top viral”, Vault é filtro curado humano com regra 2×.
* **Auditoria de erros:** não conflita — perfis com `not_found` não entram no Vault (precisa `profileDataFound`).
* **Extensão:** pode ganhar `Salvar no Vault` direto no reels (futuro).

## 5. Fases de implementação (estimativa)

| Fase | Entrega | Arquivos | Tempo |
|---|---|---|---|
| **1A — Vault MVP** | Migration `Creator/ResearchAccount/PatternVaultEntry` + `outlier.ts` + `POST /api/research/analyze` + `POST /api/vault` + `GET /api/vault` | `prisma/schema.prisma`, `src/lib/research/outlier.ts`, `src/app/api/...`, `src/components/research/outlier-modal.tsx`, `src/app/vault/page.tsx` | 1 dia |
| **1B — Checks + Ratios** | Modal com 2 checks obrigatórios + badges de ratio + campo `checkAudience` | `outlier-modal.tsx`, `vault/page.tsx` | 3h |
| **1C — Creators/Accounts** | CRUD Creator + ResearchAccount + `AppShell` link | `src/app/creators/...`, `src/app/api/creators/...` | 4h |
| **Total Fase 1** | Máquina de Research completa, 2h/dia viram 1 semana de conteúdo |  | **~2 dias** |

Fase 2 (separada): Video List (`Creator J | 15.08.2026` doc) que consome o Vault.

## 6. Regras que entram em `CRITICAL_RULES.md`

* **Vault só com outlier:** `isOutlier = outlierRatio >=2` (6+6). Não é “gostei”.
* **Check 1 obrigatório:** sem `checkCanDo=true` não salva.
* **ResearchAccount por Creator:** 1 conta feed por creator, telefone dedicado, nunca na conta da modelo.

## 7. Testes

* `src/lib/research/outlier.test.ts`: 130K com vizinhos 50K → 2.6× outlier; 55K com 50K → 1.1× não outlier; publishedAt null → erro; borda com <12 vizinhos.
* `vitest` mock `prisma.post.findMany` com 13 posts + snapshots.

## 8. Próximo passo

Diga `executar fase 1A` que eu já crio migration + `outlier.ts` + Vault e deixo o botão `Analisar outlier` na Biblioteca.
