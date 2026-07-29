# Extensão — Biblioteca de Perfis (Import)

> Este README cobre **instalação, troubleshooting e fluxo de detecção da extensão**.  
> Contrato behavioral (rotas backend, CORS, integração com o app) está em [`docs/EXTENSION.md`](../docs/EXTENSION.md).

Importa perfis do **Instagram** e **TikTok** para o tracker local.

**Versão:** ver `manifest.json` (source of truth). Atual **1.3.3**.

## O que funciona

| Feature | Como |
|---------|------|
| Botão `+` no reel | Acima da curtida; reancora no scroll |
| Botão no perfil | `+ Tracker` perto de Seguir |
| Popup / painel | `@` da aba + pasta + import |
| Fixar | Painel lateral Chrome/Edge (sem nova aba) |
| Autor no reel | DOM do **vídeo ativo** (centro/tocando) |

## Instalação

1. `npm run dev` no app (porta 3000)
2. `chrome://extensions` → Modo desenvolvedor → Carregar `extension/`
3. Após editar código: **Recarregar extensão** + **F5** no Instagram

## Fluxo de detecção (reels)

1. Acha o `<video>` mais central / tocando  
2. Procura links de perfil **nessa faixa da tela**  
3. Prioriza texto = `@` e bloco com Seguir  
4. **Não** usa `<title>` / og:meta (grudam no 1º reel)  
5. No clique: re-detecta + 1 retry se o DOM ainda troca  

## Arquivos

| Arquivo | Papel |
|---------|--------|
| `lib/detect.js` | URL + autor no DOM |
| `lib/api.js` | health, import, pastas |
| `background.js` | mensagens, side panel, import |
| `content/instagram.js` | botão + reancoragem |
| `content/shared.js` | import click, detect message |
| `popup/*` | UI pasta / fixar / live detect |

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| `!` vermelho no botão | Passe o mouse: tooltip. Muitas vezes “Sem @” → F5 e espere o reel carregar |
| `@` não muda no scroll | Recarregar extensão + F5; painel atualiza ~0,3s |
| Offline | App em `127.0.0.1:3000` |
| Context invalidated | Recarregou extensão com aba aberta → F5 |
| Botão some | Deve reaparecer sozinho; senão F5 |

## APIs

- `GET /api/health`
- `POST /api/profiles/import`
- `GET/POST /api/folders`
- `PATCH /api/folders/:id` `{ profileId, present: true }`
