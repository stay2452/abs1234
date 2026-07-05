# Regras criticas

Estas regras protegem a logica central do projeto. Qualquer mudanca que toque nelas deve atualizar este documento no mesmo PR/alteracao.

## Sessoes

- Nao reintroduzir uma unica sessao "padrao" para coleta.
- A coleta deve usar todas as sessoes ativas da plataforma como pool.
- Sessoes pausadas nao podem entrar no pool.
- Cada sessao deve ter `storageKey` unico e diretorio proprio em `.sessions/{storageKey}`.
- Cookies, storage e login nunca devem cruzar entre sessoes.
- Proxy e configuracao de navegador pertencem a sessao, nao ao perfil catalogado.
- Se uma sessao for excluida, o navegador aberto dela deve ser fechado e o diretorio correspondente deve ser removido com validacao de caminho.

## Scraping

- Instagram deve separar grade e Reels como fontes diferentes.
- Na grade do Instagram, coletar os ultimos 5 itens da grade principal.
- Na aba Reels do Instagram, coletar os ultimos 5 itens da rota `/reels/`.
- `sourceType` faz parte da identidade de um post.
- Nao voltar para URL globalmente unica em `Post`.
- A mesma URL pode existir duas vezes para o mesmo perfil se vier de classes diferentes, como `grid` e `reels`.
- A UI de detalhe deve oferecer seletor/botoes para alternar entre Grade e Reels, sem obrigar o usuario a rolar uma lista ate chegar na outra.
- TikTok deve usar `sourceType` proprio, hoje `video`.
- Metricas ausentes devem virar `null`, nunca erro visual ou quebra de ranking.
- Texto automatico de acessibilidade do Instagram, como `Photo by... May be...`, nao pode virar legenda do post.
- Reels deve tentar extrair views tambem do contador visivel na aba Reels, porque a pagina do post nem sempre mostra esse dado no mesmo lugar.
- Chaves de provedores externos, como Bright Data, ficam somente em `.env`; nunca versionar nem imprimir em logs.

## Banco

- `Profile` e unico por `[platform, handle]`.
- `Post` e unico por `[profileId, url, sourceType]`.
- Alteracoes em `schema.prisma` exigem atualizar o banco com `npm run db:push`.
- Em Windows, se o Prisma ou Next travar arquivos durante build ou push, pare o servidor dev antes de rodar o comando.

## Rankings e historico

- Crescimento de perfil exige pelo menos dois snapshots.
- Importar um perfil deve cadastrar/reativar e tentar uma coleta imediata somente dos perfis importados.
- A acao de atualizar cria snapshots para todos os perfis ativos.
- A coleta disparada pelo cadastro cria snapshots apenas para os IDs recem-importados/reativados.
- Rankings devem tolerar dados nulos e mostrar "nao disponivel" quando faltar metrica.
- A UI de ranking so deve renderizar uma tabela quando o `type` da resposta bater com a aba selecionada, para nao tratar itens de perfis como posts durante troca de filtro.

## Documentacao

- Toda regra nova de arquitetura, scraping, sessao ou banco deve entrar em algum `.md`.
- Se uma decisao mudar, atualize `docs/DECISIONS.md`.
- Se uma logica for crucial para nao quebrar o produto, registre aqui.
