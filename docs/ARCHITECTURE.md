# Arquitetura

Este projeto e um app local para biblioteca de perfis, historico de crescimento e ranking viral de Instagram e TikTok. O foco do MVP e uso interno no computador, sem autenticacao propria do app.

## Stack

- Next.js com App Router e TypeScript.
- SQLite como banco local.
- Prisma para schema, consultas e migracao local via `db:push`.
- Playwright para navegadores persistentes e coletores.
- Vitest para testes de normalizacao, ranking e logicas de apoio.

## Fluxo principal

1. O usuario importa URLs de perfis em lote.
2. O app normaliza plataforma, handle e URL.
3. Os perfis ficam ativos na biblioteca.
4. Depois do cadastro, o app tenta coletar imediatamente somente os perfis importados.
5. O usuario cria sessoes isoladas em `/settings` e faz login em cada navegador quando necessario.
6. Ao clicar em atualizar, o app usa o pool de sessoes ativas por plataforma para todos os perfis ativos.
7. Cada perfil coletado gera um `ProfileSnapshot`.
8. Cada conteudo encontrado gera ou atualiza um `Post` e cria um `PostSnapshot`.
9. Rankings e detalhes leem os snapshots para mostrar crescimento e viralizacao.

## Paginas

- `/`: dashboard com rankings e estado recente.
- `/profiles`: biblioteca, busca e importacao em lote.
- `/profiles/[id]`: detalhe do perfil, historico, notas, tags e conteudos separados.
- `/settings`: pool de sessoes, login, proxy, teste, pausa e exclusao.

## APIs internas

- `POST /api/profiles/import`: importa URLs em lote.
- `PATCH /api/profiles/[id]`: altera tags, notas e status.
- `GET /api/rankings`: retorna rankings filtrados.
- `POST /api/scrape/run`: inicia uma varredura sob demanda, opcionalmente limitada por `profileIds`.
- `/api/scrape/session`: cria, lista, abre, testa, pausa, ativa e exclui sessoes de navegador.

## Modelos principais

- `Profile`: perfil catalogado, com plataforma, handle, URL, tags, notas e status.
- `BrowserSession`: navegador isolado, com storage proprio, status e proxy opcional.
- `ProfileSnapshot`: historico de seguidores, seguindo e quantidade de posts.
- `Post`: conteudo encontrado em uma fonte especifica, como grade ou Reels.
- `PostSnapshot`: historico de views, curtidas, comentarios, compartilhamentos e favoritos.
- `ScrapeRun`: registro de cada varredura, status, contadores e erros.

## Limites do MVP

- O app e local e depende do estado do PC do usuario.
- O scraping e melhor esforco: Instagram e TikTok podem mudar DOM, bloqueios e metricas visiveis.
- Metricas nao disponiveis publicamente devem ser salvas como `null`, sem quebrar rankings ou telas.
- Dados de login ficam nos perfis persistentes em `.sessions`.
