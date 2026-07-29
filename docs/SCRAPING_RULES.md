# Contrato Bright Data (scraping)

Fronteira app ↔ Bright Data. Mudanca de dataset ou limite deve atualizar este arquivo.

## Escopo e limites

| Acao | Comportamento |
|------|----------------|
| Import | Cadastro local ate 500; coleta so dos IDs importados, lotes de 20 |
| Atualizar biblioteca | `scope: "all"`, perfis ativos, anti-recoleta 30 min (salvo `force`) |
| Atualizar um perfil | `scope: "profiles"` com 1 ID |
| Scrape API | Max 100 IDs; corpo invalido → 400 |

- Instagram: 3 datasets/perfil — perfil + Grade (`num_of_posts: 5`) + Reels (`num_of_posts: 5`).
- TikTok: perfil + videos (`num_of_posts: 10`).
- Limite no **request** ao provedor; proibido baixar catalogo inteiro e filtrar no app.

## Biblioteca acumulativa

- Cada coleta puxa so os ultimos N itens da fonte.
- Identidade: `[profileId, url canonica, sourceType]`.
- **Novo** URL → cria post. **Mesmo** URL → upsert (sem duplicar); metricas mudaram → novo `PostSnapshot`.
- Conteudo antigo permanece no SQLite.
- UI de detalhe lista a **biblioteca completa** (nao so os 5 da ultima leva).
- Botao **Atualizar biblioteca** deixa isso explicito na home e em `/profiles`.

## Catalogacao

- IG Grade: `sourceType = "grid"`. IG Reels: `reels`. TT: `video`.
- Canonizar URL antes do upsert.
- Legendas auto do IG ("Photo by…") nao sao legenda do criador.
- TikTok: URL publica `@handle/video/id`; nao usar URL de midia CDN como identidade.

## Contrato Instagram atual

- Perfil: `gd_l1vikfch901nx3by4`, `{ input: [{ url }] }`.
- Grade: `gd_lk5ns7kz21pck8jpis`, `type=discover_new`, `discover_by=url`, `num_of_posts: 5` (**sem** `post_type: "post"`).
- Reels: `gd_lyclm20il4r5helnj`, `discover_by=url_all_reels`, `num_of_posts: 5`.
- Corpo `{ input: [...] }`. Grade pode aninhar itens em `posts` (achatar no adaptador).

## Contrato TikTok

- Perfil: `gd_l1villgoiiidt09ci`.
- Videos: `gd_m7n5v2gq296pex2f5m`, `num_of_posts: 10`.
- URL publica via `post_id` + username.

## Reparo seletivo de metricas ausentes

- Dashboard: **Corrigir metricas ausentes** permite selecionar `views`, curtidas, comentarios, compartilhamentos e favoritos.
- So considera conteudo de video ja catalogado: IG `sourceType = reels` e TT `sourceType = video`; **Grade nunca entra**.
- Agrupa por perfil e consulta somente o dataset de conteudo: ate 5 Reels IG ou 10 videos TT. Nao cria posts, nao coleta perfil e nao altera Grade.
- Atualiza somente posts cujo ultimo snapshot tem a metrica escolhida em `null`; cria novo `PostSnapshot` apenas quando a Bright Data devolve valor preenchido.
- Conteudo antigo fora da janela recente do provedor pode continuar sem metrica; o resumo informa quantos ficaram indisponiveis.
- Compartilhamentos/favoritos dependem dos campos que a Bright Data expor para a plataforma. Instagram pode continuar sem esses valores.
- A reparacao consome creditos Bright Data por perfil afetado; confirmacao explicita na UI antes de iniciar.

## Falhas e telemetria

- Telemetria por dataset sem chave/payload bruto.
- `estimatedCredits` ≈ `recordsReceived` (proxy).
- Resposta final de run pode incluir `postsNew` / `postsUpdated`.
- Auth/conta pausam chave; provider esgota worker neste run; transient re-tenta perfil; not_found nao troca chave.
- "no public posts" / empty content → dataset vazio, nao falha de chave.
- Timeout HTTP request ~90s; poll de snapshot ate **45×2s (~90s)**. Status async: collecting / digesting / ready / failed. Fonte de verdade: `src/lib/scrapers/brightdata-client.ts`.
- Coleta parcial: salva o valido; run pode ser `partial_failed`.

## Teste controlado de dataset

Nao rodar automaticamente. Com autorizacao explicita:

1. Uma chave + um perfil de teste.
2. Saldo no painel BD antes/depois.
3. Um dataset por vez se necessario.
4. Atualizar `CREDIT_USAGE.md` com a medicao.
