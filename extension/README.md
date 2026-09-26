# Extensão — Eye of Zuck (Import Instagram)

> Instalação, troubleshooting e fluxo de detecção. Contrato behavioral em `docs/EXTENSION.md`.

Importa perfis do **Instagram** para a prod Railway. **Versão 2.0.0** (`manifest.json` é source of truth).

URL fixa: `https://abs1234-production.up.railway.app` (sem campo configurável).

## O que funciona

| Feature | Como |
|---------|------|
| Botão `+` no reel | Acima da curtida; importa o autor |
| Botão `+ Tracker` no perfil | Ao lado de Seguir/Mensagem |
| Popup / painel lateral | Login → `@` da aba + pasta + import |
| Fixar | Botão Fixar usa side panel (fica aberto ao navegar) |
| Badge user/admin | Popup mostra `painel usuário` ou `painel admin` (+ link Atividade p/ admin) |

## Instalação

1. `chrome://extensions` → Modo desenvolvedor → **Carregar sem compactação** → pasta `extension/`.
2. Clique no ícone → entre com email+senha da sua conta da prod.
3. Abra um perfil ou reel do Instagram → **Importar para o tracker** (com ou sem pasta).
4. Opcional: **Fixar** para usar no painel lateral enquanto navega.

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| Offline | A prod Railway pode estar dormindo — aguarde e clique Atualizar |
| `Sem @` no botão | Espere o reel carregar ou abra o perfil |
| `Nenhum perfil` no popup | Saia de Explore/DMs; abra um perfil ou reel |
| 401 no import | Saia e entre de novo (token revogado/expirado) |
| Context invalidated | Recarregou a extensão com aba antiga → F5 no Instagram |

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `lib/api.js` | HTTP p/ prod (BASE_URL fixo) |
| `lib/ig-detect.js` | URL + autor no DOM (só IG) |
| `background.js` | mensagens, import, pastas, side panel |
| `content/instagram.js` | botão + reancoragem |
| `popup/*` | login, conta, import, pastas, fixar |
