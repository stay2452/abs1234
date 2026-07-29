# Extensão browser (import de perfis)

> Contrato behavioral: regras, backend e peças. Para instalação passo a passo, troubleshooting e fluxo de detecção DOM, ver [`extension/README.md`](../extension/README.md).

## Objetivo

Importar um perfil Instagram/TikTok para o tracker local **sem copiar URL**, via:

1. Popup da extensão  
2. Botão na página de perfil  
3. Botão em reels/vídeos (importa o **autor**, não o post)

## Regras

- **Não** usa cookies, login nem scrape de métricas na página.
- Só extrai handle/URL pública e chama o app local.
- Coleta Bright Data **só** se o usuário marcar “Já coletar dados” no popup (default off).
- App precisa estar em `http://127.0.0.1:3000`.

## Código

Pasta `extension/` (Manifest V3, JS puro, load unpacked).

| Peça | Responsabilidade |
|------|------------------|
| `background.js` | Router de mensagens; import + scrape opcional |
| `lib/detect.js` | Parse de URL; autor no DOM (IG reel) |
| `lib/api.js` | HTTP para o Next local |
| `content/shared.js` | `sendImport`, feedback de botão, SPA hooks |
| `content/instagram.js` | Botão único; reels nativo (acima da curtida) vs reel do perfil (barra H) |
| `content/tiktok.js` | Perfil + vídeo |
| `popup/*` | UI do ícone (popup da action **e** side panel — mesmo HTML) |
| `README.md` | Instalação e troubleshooting |

Versão atual do manifest: **1.3.3**. Source of truth: `extension/manifest.json`.

## Side panel (desde 1.3.3)

A extensão registra `side_panel.default_path` apontando para `popup/popup.html`, com permissão `sidePanel`. Mesma UI do popup, persistente no painel lateral do navegador — útil ao navegar IG/TT sem perder o estado do import. Configurado em `manifest.json` → `action.default_popup` e `side_panel.default_path` (ambos apontam para o mesmo HTML).

## Backend

| Rota | Uso |
|------|-----|
| `GET /api/health` | Online/offline |
| `POST /api/profiles/import` | Cadastro/reativação (+ CORS extensão) |
| `POST /api/scrape/run` | Coleta opcional (`stream: false`) |

CORS: `src/lib/extension-cors.ts` — `chrome-extension://`, `moz-extension://`, localhost do app.

## Instalação

Ver `extension/README.md` (Load unpacked em `chrome://extensions`).

## Fluxo de import

```
Botão / popup
  → background import
  → normaliza para URL de perfil (nunca /reel/CODE)
  → GET /api/health
  → POST /api/profiles/import
  → (opcional) POST /api/scrape/run com profileId
```

## Manutenção

- Após editar content scripts: **Recarregar extensão + F5** nas abas IG/TT.
- “Extension context invalidated” = extensão recarregada com aba antiga aberta.
- Preferir um botão por plataforma (`#bdp-ig-tracker-btn` / `#bdp-tt-tracker-btn`).
