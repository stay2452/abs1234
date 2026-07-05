# Decisoes do projeto

Registro curto das decisoes importantes para evitar que a gente quebre sem querer uma logica combinada.

## 2026-07-05

### App local primeiro

O MVP e local, roda no computador do usuario e nao tem autenticacao propria. Login de Instagram/TikTok acontece nos navegadores persistentes controlados pelo Playwright.

### Importar tambem coleta

O botao `Importar` cadastra ou reativa perfis e tenta coletar imediatamente apenas esses perfis. O botao `Atualizar` continua sendo a varredura global de todos os perfis ativos.

### Sessoes como pool, nao como padrao unico

O app deve permitir varias sessoes por plataforma. Todas as sessoes ativas participam da coleta. Sessoes pausadas ficam salvas, mas fora do processamento.

Motivo: se uma conta, proxy ou sessao tiver restricao, as outras continuam isoladas e o sistema escala melhor para muitos perfis.

### Proxy por sessao

Cada sessao pode ter proxy proprio. O proxy nao pertence ao perfil catalogado. Isso permite trocar, pausar ou excluir uma sessao sem alterar a biblioteca de perfis.

### Isolamento forte de navegador

Cada sessao tem um diretorio em `.sessions/{storageKey}`. Nao pode haver compartilhamento de cookies, localStorage ou login entre sessoes.

### Excluir sessoes

O usuario deve poder excluir sessoes. A exclusao fecha navegador aberto, apaga registro no banco e remove apenas o diretorio daquela sessao.

### Instagram separado por classe de conteudo

Grade e Reels sao classes diferentes. A coleta deve buscar ate 5 posts da grade e ate 5 da aba Reels, mantendo grupos separados no banco e na UI.

### `sourceType` faz parte da identidade

A chave de `Post` e `[profileId, url, sourceType]`. Uma URL nao deve ser unica sozinha, porque o mesmo conteudo pode aparecer em fontes diferentes.

### UI de conteudo em abas

Na tela de detalhe do perfil, Grade e Reels devem aparecer como botoes/abas lado a lado. O usuario escolhe qual colecao visualizar sem precisar rolar ate a outra.

### Legendas e views do Instagram

Textos de acessibilidade gerados pelo Instagram nao sao considerados legenda. Para Reels, views podem vir da pagina do post ou do card da aba Reels, porque a plataforma muda onde exibe esse contador.

### Documentacao como contrato

Toda regra crucial deve ir para `.md`. Antes de mudar sessoes, scraping, schema ou ranking, consultar `docs/CRITICAL_RULES.md` e atualizar a documentacao junto com o codigo.
