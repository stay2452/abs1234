# Pool de sessoes

O app deve funcionar como um gerenciador local de navegadores isolados. A ideia e parecida com multi-login: cada sessao abre um Chromium persistente com cookies, storage e proxy proprios.

## Conceito

Uma `BrowserSession` representa um navegador isolado para uma plataforma.

Campos importantes:

- `platform`: `instagram` ou `tiktok`.
- `name`: nome humano da sessao.
- `storageKey`: chave unica do diretorio persistente.
- `proxyUrl`: proxy opcional.
- `status`: `active` ou `paused`.
- `lastOpenedAt`: ultima abertura manual de login.
- `lastUsedAt`: ultimo uso pela coleta.

## Isolamento

- Cada sessao usa `.sessions/{storageKey}`.
- O Playwright abre `chromium.launchPersistentContext` nesse diretorio.
- Uma sessao nao deve ler nem reutilizar dados de outra.
- Abrir varias abas dentro da mesma sessao compartilha o mesmo storage daquela sessao.
- Abrir outra sessao cria outro contexto persistente separado.

## Pool de coleta

- Para cada plataforma, a coleta busca somente sessoes com `status = active`.
- Perfis ativos sao distribuidos entre as sessoes por round-robin.
- As sessoes rodam em paralelo.
- Dentro de cada sessao, os perfis atribuidos rodam em sequencia.
- Se uma sessao falhar, o erro deve ficar registrado no `ScrapeRun` sem apagar dados antigos.

## Sem sessao padrao

Nao existe mais o conceito de uma sessao padrao escolhida manualmente para tudo.

O botao antigo de "Padrao" nao deve voltar porque ele enfraquece o modelo de pool. O controle correto e:

- `active`: entra no pool.
- `paused`: fica salva, mas nao processa.
- `delete`: remove sessao e storage isolado.

## Proxy

O proxy e configurado por sessao. Formatos aceitos:

- `host:port`
- `host:port:user:pass`
- `user:pass@host:port`
- `http://user:pass@host:port`
- `socks5://user:pass@host:port`

Quando uma sessao usa proxy, todas as abas e coletas daquela sessao usam o mesmo proxy.

## Teste de proxy

O botao `Testar proxy` deve validar conectividade com alvos simples:

- IP publico.
- Site neutro.

Falha em busca pela barra do navegador nao significa necessariamente falha geral do proxy. Em alguns perfis Chromium isolados, colar uma URL direta funciona enquanto pesquisa na barra falha por search provider ou bloqueio de busca no proxy.

## Exclusao

Excluir sessao deve:

1. Fechar o contexto aberto se existir.
2. Remover o registro do banco.
3. Apagar somente `.sessions/{storageKey}` validado.
4. Recriar sessoes iniciais da plataforma apenas se a plataforma ficar sem nenhuma sessao.
