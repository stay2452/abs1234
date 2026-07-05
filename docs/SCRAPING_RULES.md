# Regras de scraping

Este documento define como os coletores devem interpretar plataformas e fontes de conteudo.

## Principios

- Scraping e sob demanda, iniciado pelo usuario.
- Scraping usa sessoes salvas e isoladas.
- Cada coleta cria snapshots novos.
- A importacao de URLs dispara uma coleta imediata apenas dos perfis importados/reativados.
- O botao global de atualizar coleta todos os perfis ativos.
- Posts ja conhecidos nao devem ser duplicados dentro da mesma fonte.
- Dados ausentes devem ser salvos como `null`.
- Erros de plataforma devem ser registrados no `ScrapeRun`.

## Instagram

O Instagram tem fontes de conteudo diferentes e elas devem ficar separadas.

### Perfil

Ao abrir o perfil, tentar coletar:

- seguidores;
- seguindo;
- quantidade de posts;
- metadados disponiveis em scripts JSON e meta tags.

### Grade

Fonte: pagina principal do perfil.

Regra:

- coletar os ultimos 5 itens encontrados na grade principal;
- aceitar links `/p/`, `/reel/` e `/tv/` quando aparecem na grade;
- salvar com `sourceType = "grid"`.

### Reels

Fonte: aba de Reels em `/reels/`.

Regra:

- navegar para `{profile.url}/reels/`;
- coletar os ultimos 5 links de Reels;
- salvar com `sourceType = "reels"`.

### Identidade do post

O mesmo conteudo pode aparecer em mais de uma fonte. Por isso:

- `Post.url` nao pode ser unico globalmente.
- A chave de identidade e `[profileId, url, sourceType]`.
- A UI de detalhe deve mostrar "Posts da grade" separado de "Posts da aba Reels".
- Essa separacao deve aparecer como botoes/abas de alternancia, nao como duas listas empilhadas que exigem rolagem longa.

### Metricas

Para cada post, tentar coletar:

- views;
- likes;
- comentarios;
- caption;
- data de publicacao.

Compartilhamentos e favoritos podem ficar `null` quando nao forem publicos.

Legendas geradas automaticamente pelo Instagram para acessibilidade, como textos no formato `Photo by... May be an image...`, nao devem ser tratadas como legenda real do criador. A UI tambem deve esconder esse tipo de texto se ele ja existir salvo no banco.

Views de Reels devem tentar estas fontes, nesta ordem:

- JSON/metadados da pagina do post;
- texto visivel da pagina do post;
- contador exibido no card da aba Reels.

## TikTok

O TikTok usa uma fonte inicial unica no MVP:

- coletar videos recentes do perfil;
- salvar com `sourceType = "video"`;
- metricas indisponiveis ficam `null`.

Quando `BRIGHTDATA_API_KEY` existir e `BRIGHTDATA_TIKTOK_ENABLED="true"`, o coletor TikTok deve usar a Bright Data TikTok Scraper API antes do scraper local. A chave fica apenas no `.env` local e nao deve ser versionada.

Datasets usados:

- Perfil: `gd_l1villgoiiidt09ci`.
- Posts por perfil: `gd_m7n5v2gq296pex2f5m`.

Se a Bright Data responder erro de conta, permissao, credito ou produto inativo, desative `BRIGHTDATA_TIKTOK_ENABLED` ate resolver no painel da Bright Data.

## Quantidade por varredura

- Instagram: ate 5 da grade e ate 5 da aba Reels.
- TikTok: respeita o limite configurado pelo coletor.

## Manutencao

Se uma plataforma mudar HTML, seletores ou JSON embarcado:

- ajustar o adaptador da plataforma, nao a logica generica do ranking;
- preservar `sourceType`;
- preservar tolerancia a metricas nulas;
- atualizar este documento se a regra de coleta mudar.
