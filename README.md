# Biblioteca de Perfis

App local para catalogar perfis de Instagram e TikTok, manter historico de crescimento e organizar rankings de conteudos virais por nicho.

## Documentacao viva

Antes de alterar scraping, sessoes, Prisma ou rankings, leia estes documentos:

- [Arquitetura](docs/ARCHITECTURE.md)
- [Regras criticas](docs/CRITICAL_RULES.md)
- [Pool de sessoes](docs/SESSION_POOL.md)
- [Regras de scraping](docs/SCRAPING_RULES.md)
- [Decisoes do projeto](docs/DECISIONS.md)

Sempre que uma regra importante mudar, atualize um `.md` junto com o codigo.

## Notas operacionais

- As sessoes em `Settings` sao perfis de navegador isolados. Cada uma tem storage/cookies separados e proxy proprio.
- Quando uma sessao tem proxy, todas as abas abertas naquele navegador usam o mesmo proxy.
- Em alguns perfis Chromium isolados, colar uma URL direta pode funcionar enquanto digitar uma pesquisa na barra nao busca. Isso pode acontecer por search provider ausente no perfil ou por bloqueio do proxy contra paginas de busca.
- Para diagnosticar conectividade, use `Testar proxy` na sessao antes de usar a conta para coleta.
- Se alterar proxy/configuracao de uma sessao, feche o navegador isolado dessa sessao e abra novamente.
