# Plano — Pattern Vault por Creator (V2 — ajustado)

Data: 2026-08-30
Ajuste solicitado: Biblioteca continua idêntica. Novo é o **Pattern Vault por Creator**. Ignorar checks e infra. Ratio sim. Seleção de perfis trackeados + pastas por creator.

## 0. O que entendi (confirma?)

1.  **Biblioteca não muda** — continua acumulando `Profile` + `Post` + `PostSnapshot` via Bright Data, com `Folder`, rankings, etc.
2.  **Vault por Creator** — você cria um Vault para cada modelo/creator (ex: `Creator J`, `Creator A`). Cada Vault é o cofre infinito da aula: só entra winner/outlier curado.
3.  **Trackeamento seletivo:** para cada Creator você **escolhe quais Perfis** da Biblioteca serão monitorados para ela. Não é “todo perfil vai pra toda creator”. É `Creator J` trackeia `@handle_01, @handle_02...` (20-30 perfis do nicho dela).
4.  **Pastas associadas:** além de perfis avulsos, você pode **associar uma Pasta inteira** a uma Creator (ex: pasta `Techno Girl` com 40 perfis → vincula no Vault da `Creator J`). Se adicionar perfil na pasta, já reflete.
5.  **Ignorar checks:** `Can we do it?` e `Comment test` não entram no sistema — você faz na sua cabeça.
6.  **Ignorar infra:** nada de `ResearchAccount`, telefone dedicado, `phoneLabel`. Não modelar.
7.  **Ratio sim:** todo card do Vault/método 6-6 deve calcular e exibir `baseline 6+6`, `outlier 2x`, `comments/views`.

Se entendi errado, me fala antes de eu executar.

## 1. Modelo de dados (Supabase)

### 1.1 Novos models

```prisma
// Vault = Creator. 1:1 mental: cada Creator TEM um Vault
model Creator {
  id        String   @id @default(cuid())
  name      String   // "J - Techno girl"
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  profileLinks CreatorProfile[]
  folderLinks  CreatorFolder[]
  vaultEntries PatternVaultEntry[]

  @@index([name])
}

// Perfis que esta Creator trackeia (seleção manual)
model CreatorProfile {
  creatorId String
  profileId String
  createdAt DateTime @default(now())

  creator Creator @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  profile Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@id([creatorId, profileId])
  @@index([profileId])
  @@index([creatorId])
}

// Pastas que esta Creator trackeia (atalho: todos os perfis da pasta contam)
model CreatorFolder {
  creatorId String
  folderId  String
  createdAt DateTime @default(now())

  creator Creator @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  folder  Folder  @relation(fields: [folderId], references: [id], onDelete: Cascade)

  @@id([creatorId, folderId])
  @@index([folderId])
  @@index([creatorId])
}

// Entrada do Vault — winner salvo (só outlier >=2x)
model PatternVaultEntry {
  id              String    @id @default(cuid())
  creatorId       String
  sourceProfileId String?   // de onde veio
  sourcePostId    String    // post winner
  platform        String
  sourceHandle    String
  sourceUrl       String
  publishedAt     DateTime?

  views     Float?
  likes     Float?
  comments  Float?
  shares    Float?
  caption   String?

  baselineAvg   Float?   // média 6+6
  outlierRatio  Float?   // views/baseline
  isOutlier     Boolean  @default(false)
  commentsRatio Float?   // comments/views*100

  pattern String? // opcional livre (hook, som, etc) — sem obrigar check
  tags    String?
  notes   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  creator       Creator @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  sourceProfile Profile? @relation(fields: [sourceProfileId], references: [id], onDelete: SetNull)
  sourcePost    Post     @relation(fields: [sourcePostId], references: [id], onDelete: Cascade)

  @@unique([sourcePostId, creatorId])
  @@index([creatorId, isOutlier])
  @@index([createdAt])
}
```

**Regra de leitura do Vault:** `profiles trackeados da Creator = UNION( CreatorProfile.profileId , perfis das pastas em CreatorFolder )`. Isso permite `Creator J` trackear 15 perfis avulsos + pasta `Nicho X` com 30.

### 1.2 O que NÃO será criado

* `ResearchAccount`, `phoneLabel`, `checkCanDo`, `checkAudience` — fora.
* Não alterar `Profile`, `Post`, `Folder` existentes.

## 2. Lógica

### 2.1 6-before / 6-after + Ratio (core que você pediu)

`src/lib/research/outlier.ts`

* Entrada `postId`, busca `Post` + todos `Post` do mesmo `Profile` ordenados por `publishedAt`
* Calcula `baselineAvg = avg(views dos 6 antes + 6 depois)` via `PostSnapshot` latest por post
* `outlierRatio = views / baselineAvg`, `isOutlier = >=2`
* `commentsRatio = comments/views*100` (ex: 500/2M = 0.025% verde, 80/3M = 0.002% vermelho)
* Retorna também `baselineAvg` para exibir `130K vs 50K = 2.6x OUTLIER`

### 2.2 Salvamento no Vault

Só permite `POST /api/vault` se `isOutlier=true`. Sem tela de checks — modal mostra `baseline`, `ratio`, `outlier` e campo livre `pattern/tags/notes` opcional. Botão `Salvar no Vault da Creator J`.

## 3. Telas e APIs

### 3.1 `GET /api/creators` `POST /api/creators` `PATCH/DELETE /api/creators/[id]`
CRUD Creator. `src/app/api/creators/route.ts`

### 3.2 `GET/POST /api/creators/[id]/profiles` e `/folders`
Associação. Body `{profileIds: string[]}` ou `{folderIds: string[]}` — `z.array(cuid).max(100)`. Usa `createMany` em `CreatorProfile`/`CreatorFolder`.

### 3.3 `GET /api/creators/[id]/tracked-profiles`
Retorna `UNION` de perfis trackeados (avulsos + via pastas) com `handle/platform/url` para exibir no Vault.

### 3.4 `POST /api/research/analyze {postId}`
Só calcula e retorna `{baselineAvg, outlierRatio, isOutlier, commentsRatio}` — sem gravar.

### 3.5 `POST /api/vault {creatorId, sourcePostId, pattern?, tags?, notes?}`
Valida `isOutlier` (recalcula no servidor) e cria `PatternVaultEntry`. `GET /api/vault?creatorId=&isOutlier=true`

### 3.6 UI

* **Nova rota** `src/app/creators/page.tsx` — lista Creators (cards `Vault J - 42 winners`)
* **Detalhe** `src/app/creators/[id]/page.tsx` — 3 abas:
  1.  **Trackeamento:** 2 pickers (`src/components/creator-profile-picker.tsx` e `creator-folder-picker.tsx`) para associar perfis/pastas. Lista de perfis trackeados (union).
  2.  **Vault:** tabela `PatternVaultEntry` daquela Creator (`@handle | views | baseline | 2.6x | ratio 0.025% | pattern | data | Abrir`)
  3.  **Biblioteca filtrada:** reaproveita `profile-content-tabs.tsx` mas filtrado pelos perfis trackeados.
* **Biblioteca** `src/app/profiles/[id]/page.tsx` — cada Post ganha botão `Analisar outlier → Salvar no Vault` que abre `src/components/research/outlier-modal.tsx` (gráfico 13 barras + ratio + seletor de Creator).
* **AppShell** `src/components/app-shell.tsx` — novo item `Vaults`/`Creators`.

## 4. Fases

| Fase | Entrega | Tempo |
|---|---|---|
| **2A — Base** | Migration `Creator/CreatorProfile/CreatorFolder/PatternVaultEntry` + `outlier.ts` + `POST /api/research/analyze` | 4h |
| **2B — Vault** | `POST /api/vault` + `GET /api/vault` + `src/app/vault/page.tsx` global (opcional) | 3h |
| **2C — Creators + Trackeamento** | CRUD Creator + pickers de perfis/pastas + `GET /tracked-profiles` | 5h |
| **Total V2** | Vault por Creator com perfis/pastas seletivos + 6-6 + ratio | **~1.5 dias** |

## 5. Validação

* `6-6`: post 130K com vizinhos 50K → 2.6x outlier; 55K/50K → 1.1x não entra.
* `UNION`: Creator com 2 perfis avulsos + pasta com 3 → `tracked = 5` (deduplicado).
* `POST /api/vault` sem `isOutlier` → `400`.

## 6. Próximo passo

Se estiver de acordo, digo `executar V2` e já começo pela **Fase 2A (base + outlier)**. Confirma ou quer ajustar perfis/pastas?
