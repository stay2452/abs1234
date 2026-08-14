# Decisoes do projeto

## 2026-07-05

- O MVP e local, sem autenticacao propria.
- Importar cadastra ou reativa perfis e pode iniciar a primeira coleta somente para eles.
- Instagram mantem Grade e Reels como colecoes separadas; TikTok usa Videos.
- Conteudo usa identidade por perfil, URL e fonte para permitir que o mesmo Reel apareca nas duas colecoes Instagram.
- Toda regra importante precisa de documentacao em `docs/`.
- O app usa tema escuro por padrao.

## 2026-07-07

- Instagram e TikTok usam somente Bright Data para captacao.
- Nao ha navegador, proxy, cookie, login manual ou fallback Playwright.
- Varias chaves Bright Data no pool (evoluiu depois para pool **global**, sem split por plataforma — ver 2026-07-10).
- A validacao de cadastro em settings e local; saldo usa Account Management API quando a chave permite.

## 2026-07-10

### Extensao browser de import

Extensao Chrome/Edge (MV3) em `extension/` (v1.1+). Importa perfil IG/TT via `POST /api/profiles/import`. Nao scrapa com sessao do browser; coleta Bright Data so com toggle no popup. Content scripts compartilham `shared.js`; um botao por site; reels IG reancoram ao deslizar. CORS: `extension-cors.ts` + `GET /api/health`. Docs: `docs/EXTENSION.md` e `extension/README.md`.

### Discord webhooks multiplos (tops virais)

Varios webhooks Discord (canais/servidores distintos). Cada `DiscordNotifyConfig` tem nome, serverLabel, URL, criterios (top N, metrica, periodo, plataforma, pasta, minimos) e dedupe proprio (`DiscordDelivery` por `configId`). UI em `/discord`. `POST /api/discord/[id]/send` e `POST /api/discord/send` (todos enabled). Zero Bright Data.

### Pastas (substituem tags)

Sistema de tags foi **extinto**. Modelo `Folder` + `ProfileFolder` (N:N): usuario cria pastas, coloca perfis e compara metricas na pasta (`/folders/[id]`). Filtro por pasta na biblioteca, ranking e Discord (`folderId`). Sem Bright Data.

### Coleta com escopo explicito

O endpoint de coleta so aceita `all` ou lista validada de IDs (max 100 no scrape). Import: ate 500 no cadastro; coleta em chunks de 20. Corpo invalido nunca vira varredura global.

### Telemetria antes de estimativa financeira

O app registra requisicoes e registros por dataset, perfil e sessao. `estimatedCredits` usa requisicoes feitas como referencia operacional, mas o custo financeiro vem do painel Bright Data. Nenhum custo fixo por perfil e tratado como garantia.

### Sessao API resiliente

O model de dominio virou `CollectorSession`, preservando a tabela SQLite anterior. Chaves com erro de conta ou autenticacao sao pausadas e os perfis podem receber uma tentativa em outra chave saudavel, sem loop.

### Persistencia e deduplicacao seguras

URLs de posts sao canonizadas antes do `upsert`; resultado de perfil e posts sao persistidos em uma transacao; snapshots de metricas identicos sao descartados.

### Migrations PostgreSQL

Alteracoes de schema usam Prisma Migrate no Supabase. `DATABASE_URL` usa o transaction pooler para o app e `DIRECT_URL` usa a conexao direta para migrations. Backups ficam sob responsabilidade do Supabase.

### Importacao por @handle

O cadastro em massa aceita URLs, `@handles` e listas separadas por linha, virgula ou ponto e virgula. URLs detectam a plataforma sozinhas; `@handles` sem URL usam o seletor Instagram/TikTok do formulario.

### Contrato Bright Data Instagram atualizado

O Instagram usa o contrato atual dos Social Media Scraper APIs: corpo `{ input: [...] }`, Grade no dataset `gd_lk5ns7kz21pck8jpis` com `type=discover_new` e `discover_by=url`, e Reels com parametros explicitos. O dataset de perfil `gd_l1vikfch901nx3by4` serve somente para o perfil. Enviar descoberta de Grade para o dataset de perfil retornou HTTP 400.

A Grade nao envia `post_type: "post"`: em perfis cujo feed e so Reels, esse filtro faz a Bright Data responder `There are no public posts` / `dead_page` e a colecao Grade fica vazia. Sem o filtro, o dataset devolve os itens do feed (foto, carrossel ou reel) com `sourceType = "grid"`.

### Persistencia parcial por dataset

Uma falha em Grade, Reels, Perfil TikTok ou Videos TikTok nao invalida dados validos recebidos pelas demais etapas. O adaptador devolve telemetria por dataset, o orquestrador persiste o resultado util em transacao e o `ScrapeRun` termina como `partial_failed` quando houver uma etapa pendente de correcao.

### URL publica do TikTok

O Fast API de posts por perfil pode retornar `video_url` como arquivo de midia. A biblioteca usa `post_id` mais `profile_username` para formar a URL publica do TikTok, preservando a deduplicacao e os links de detalhe.

### Progresso visivel da coleta

O endpoint aceita `stream: true` e envia eventos NDJSON enquanto cada dataset termina. `ScrapeRun.currentActivity` e `profilesFinished` acompanham o mesmo trabalho no PostgreSQL. O botao mostra etapa, perfil, dataset, registros recebidos e resultado final; uma coleta nao deve parecer travada ou infinita.

### Poll de snapshot Instagram Grade/Reels

Coletas reais mostraram perfil sincronizado em segundos, enquanto Grade e Reels ficam em snapshot async e frequentemente ultrapassavam o tempo.sync (12×3s). O poll padrao passou a **45×2s (~90s)** — mesma janela util com menor espera morta entre polls. Fonte de verdade: `src/lib/scrapers/brightdata-client.ts`. Timeout de snapshot e classificado como `transient` (uma retentativa em outra chave). Mensagens do tipo "no public posts" viram resultado vazio, nao falha parcial de provedor.

### Workers paralelos (evolucao da fila)

Primeiro houve fila estrita (1 chave por vez). Depois: chaves **com credito** em paralelo (1 perfil por chave; teto em `SCRAPE_MAX_PARALLEL_KEYS`, hoje 20), striping deterministico. Transient nao mata a chave inteira; auth/conta/provider sim. Objetivo: reduzir tempo de parede em massas grandes sem round-robin aleatorio entre contas mortas.

### Free tier oficial 5k e mapa da API

A documentacao Bright Data define **5.000 free credits/mes por conta**. Capacidade multiplica so com **contas distintas**. App: Datasets API v3 (`/scrape` + `/progress` + `/snapshot`), `num_of_posts` no request, poll apos HTTP 202. Ver `docs/BRIGHT_DATA_API.md`.

### Importacao em massa resiliente

Cadastro local em lote (ate 500). Coleta pos-import em chunks de 20, stream NDJSON, retry 409, continua se um lote falhar.

### Chaves globais (sem Instagram/TikTok na sessao)

`CollectorSession.platform = global`. Adaptador usa `Profile.platform`. Legado IG/TT migrado automaticamente.

### Credito como criterio de pool (nao "boa/ruim")

Workers filtram por **com credito / sem credito**. Saldo oficial via `GET /customer/balance` (permissao de billing); fallback `5000 − uso local no mes`. UI: Atualizar saldos + label de remanescente. Erro de fundos na coleta marca sem credito.

### Biblioteca acumulativa + botao Atualizar biblioteca

Cada update puxa so ultimos 5+5 (ou 10 TT). Upsert por URL+fonte: novo grava, antigo nao duplica. Detalhe lista biblioteca completa. Resposta de run expoe `postsNew` / `postsUpdated`.

### Ranking de posts por data de publicacao

O periodo do ranking de reels/videos usava `PostSnapshot.capturedAt` (quando o scrape salvou). Contas com video fixado antigo entravam em "7 dias" apos qualquer recoleta. Corrigido: filtro por `Post.publishedAt`; metricas continuam do snapshot mais recente. Posts sem data de publicacao so no periodo "all".

## 2026-07-28

### Auditoria completa — 33 bugs + 2 descobertos na execucao

Auditoria de codigo e docs identificou 33 problemas (inconsistencias, dead code, falhas logicas, docs desatualizadas); 2 extras (#34, #35) surgiram durante a execucao. 28 corrigidos em 5 fases sem commit (projeto local); #21 mantido (over-engineering toleravel), #22 fragilidade de detect.js (manutencao defensiva), #31 falsa positiva (validacao ja existia).

### Phase 1 — housekeeping repo + docs

`.gitignore` atualizado com `lint-output.txt`, `tmp/`, `.agents/`, `.codex/`. Placeholders vazios removidos. Docs sincronizadas com codigo: poll de snapshot **45x2s ~90s** (antes 40x3s em 2 docs), paralelismo **20 chaves** (antes 6 em 2 docs + contradicao interna em CAPACITY), regra `provider` **nao esgota** no run (antes contradizia em CRITICAL_RULES linha 26 e BRIGHT_DATA_API linha 138), versao extensao **1.3.3** (EXTENSION.md dizia 1.1.0), side panel documentado desde 1.3.3. Arquivo `BRIGHT_DATA_CAPACITY_500K.md` renomeado para `BRIGHT_DATA_CAPACITY.md` (nome legado). README.md alerta sobre chave `unknown` tratada como `has_credit` — rodar "Atualizar saldos" antes de coletas em massa.

### Phase 2 — remocao de dead code

`Profile.tags` (legado, substituido por `Folder`) removido do schema, das queries SQL raw (rankings), do select em `discord-notify.ts`, do tipo em `rankings.ts` e dos testes. Migration `20260728120000_drop_profile_tags` recriou a tabela (SQLite antigo sem `DROP COLUMN`). `splitTags` em `format.ts` era **dead code puro** (exportado, sem callers) — removido. CSS `.tags-manager` renomeado para `.folders-section` em `globals.css` + `folders-manager.tsx`. `PROFILE_STATUS` restrito a `["active", "paused"]` (variante `"error"` era zumbi — UI previa, ninguem setava); `<option value="error">` removido do `profile-editor.tsx`. `shouldPauseSession` e `shouldExhaustSessionInQueue` tinham corpo identico — unificadas como aliases de `isSessionUnrecoverable`.

### Phase 3 — schema migrations + bug fixes colaterais

`DiscordDelivery` ganhou FK `post` (`onDelete: Cascade`) e `config` (`onDelete: Cascade`) — antes linhas ficavam orfas quando Post (via Profile) ou DiscordNotifyConfig eram deletados. `deleteDiscordWebhook` simplificado (cascade cobre, `deleteMany` manual removido). `ScrapeAttempt.profileId` mudou de `String` com `onDelete: Cascade` para `String?` com `onDelete: SetNull` — telemetria historica preservada ao deletar perfil (estimativa de credito continua honesta). Migration `20260728130000_discord_delivery_fk_scrape_attempt_setnull` recriou ambas as tabelas (SQLite antigo), descartando deliveries orfaos legados.

Bug #34 (descoberto na Fase 3): `discord/page.tsx` passava prop `webhooks` ao `DiscordNotifyPanel` que nao aceita (componente carrega via fetch client-side). Removido o prop e o `listDiscordWebhooks` server-side importado sem uso. Bug #35: `profile-editor.tsx:88` chamava `setCatalog` (nao existe — `catalog` e `useMemo`). Corrigido para usar so `setSelectedIds` com `folderList`. Esses dois bugs blockavam o `npm run build`.

### Phase 4 — bugs de runtime sem mudanca de schema

`session.ts` bug #1: `applyLocalCreditEstimate` tinha ternario `balanceError` identico nos dois ramos — agora `permission_denied` devolve mensagem explicativa. Bug #2: `getActiveCollectorSessions()` lancava em vez de devolver `[]` quando sem chave com credito — agora retorna `[]` e o orquestrador marca perfis como `no_session` com razao legivel. Bug #4: `recordCollectorSessionNoData` nao decrementava credito estimado local — agora subtrai 1 (no_data ainda consome 1 request no Bright Data) quando `creditsSource === "estimated_local"`; se `creditsRemaining - 1 <= 0`, marca `no_credit`.

`brightdata-balance.ts` bug #6: `fetchBrightDataBalance` assumia USD sempre; heuristica defensiva — se `balance >= 100` (impossivel para free tier $7,50), assume credito direto sem multiplicar por `CREDITS_PER_USD`. Mantem USD como default alinhado a doc oficial.

`index.ts`/`types.ts` bug #8: status final do `ScrapeRun` conta todos os `errors[]` inclusive `partialError` de dataset opcional vazio — agora filtra `not_found` e `partial_empty` (warning), mantem so erros estruturais para `partial_failed`. Bug #10: erros de SQLite/Prisma (`SQLITE_BUSY`, `database is locked`, `Socket timeout`) classificados em `getScrapeErrorCode` como `transient` — perfil retenta com outra chave em vez de falhar `unknown` sem retry. `isRetryableDbError` em `db.ts` exportado para reuse.

### Phase 5 — mudancas de design

Bug #28 (Opção A: `partial_failed` só em dataset essencial): `ScrapePartialError` ganhou campo `essential?: boolean`. Adaptadores IG/TT classificam quais datasets falharam como essenciais (so `DATASET_*_PROFILE`). `toPartialScrapeError` marca `errorCode: "partial_empty"` quando `partialError.essential === false` — Grade vazia em perfil so-reels vira `success`, nao `partial_failed`.

Bug #29 (`SCRAPE_MAX_RETRIES_PER_PROFILE=3` fixo): nova constante em `constants.ts`. `maxRounds` agora `min(sessions.length, 3)` (antes `sessions.length`, podia 20x). Backoff exponencial entre rounds: `min(30s, 1s × 2^(round-1))` — pausa de 1s, 2s, 4s evita retry imediato em rate-limit prolongado.

Bug #30 (`lastPostsScrapeAt` anti-recoleta): novo campo `Profile.lastPostsScrapeAt DateTime?`. Migration `20260728140000_add_last_posts_scrape_at` (`ALTER TABLE ADD COLUMN`, suportado em SQLite antigo). `shouldScrapeProfile` agora calcula `max(snapshotAt, postsAt)` — cobre perfil so-com-posts sem `profileSnapshot` (antes a janela de 30min nao contava e o perfil era re-coletado em seguida, gastando credito). `persistScrapeResult` atualiza `lastPostsScrapeAt = now` quando `postsFound > 0`. 3 novos testes cobrindo essa logica.

Bug #32 (`Post.platform` denormalizado): somente documentacao no schema (`prisma/schema.prisma`) — denormalizacao intencional para consultas de ranking/Discord sem JOIN, atualizada em cada upsert via `persistPost`.

Bug #31 (validacao `Folder.color`): falsa positiva — validacao `z.enum(FOLDER_COLORS)` e helper `isValidFolderColor` ja existiam em `folders/route.ts`, `folders/[id]/route.ts` e `folders.ts`. Sem mudanca de codigo.

### Testes e verificacao

8 testes novos (66 vs baseline 63): 3 em `index.test.ts` cobrindo `lastPostsScrapeAt`, 0 lint regressao (mesmo 1 erro preexistente `react-hooks/set-state-in-effect`), `npm run build` **passou** (antes falhava por bug #34). 13 migrations aplicadas no total (3 novas).
