# Extensão browser (import de perfis) — v2 IG-only Railway-only

> Rebuild total em 2026-09-26 (v2.0.0): apagada a v1 e refeita do zero.
> Contrato behavioral: regras, backend e peças. Instalação em `extension/README.md`.

## Objetivo

Importar um perfil **Instagram** para a biblioteca Supabase do dono **sem copiar URL**, via:

1. Popup da extensão
2. Botão na página de perfil (`+ Tracker`)
3. Botão em reels/posts (importa o **autor**, não o post)

## Regras (v2)

- **Instagram-only.** Sem TikTok (código, matches e docs TT removidos; backend segue IG-only).
- **Railway-only, URL fixa:** `https://abs1234-production.up.railway.app` hardcoded em
  `extension/lib/api.js` (`BASE_URL`) e nos links do popup. **Sem campo configurável de URL.**
- **Não** usa cookies, login nem scrape de métricas na página. Só extrai handle/URL pública e chama a prod.
- Sem coleta Apify automática no import (default off; v2 nem expõe o botão de coleta).
- Login com **email+senha** (`POST /api/auth/extension-token`); Bearer `eoz_...` em
  `chrome.storage.sync`; import/pastas caem na biblioteca **do dono logado**.
- Popup mostra o papel: badge **painel usuário** (`role=user`) ou **painel admin** (`role=admin`,
  com link p/ `/admin/atividade`). Logout revoga (`DELETE /api/auth/extension-token`).

## Código (v2.0.0)

Pasta `extension/` (Manifest V3, JS puro, load unpacked). Source of truth: `extension/manifest.json`.

| Peça | Responsabilidade |
|------|------------------|
| `background.js` | Router de mensagens; import + pastas + side panel |
| `lib/api.js` | HTTP p/ a prod Railway (BASE_URL fixo, Bearer em tudo) |
| `lib/ig-detect.js` | Parse de URL IG + autor do reel ativo (espelha `src/lib/profile-url.ts`) |
| `content/instagram.js` | Botão único perfil/reel, reancoragem simples |
| `content/inject.css` | Visual do botão (`.eoz-*`) |
| `popup/*` | Login, conta com badge user/admin, `@` detectado, pastas, fixar |
| `README.md` | Instalação e troubleshooting |

## Side panel

`side_panel.default_path` = `popup/popup.html` (mesmo HTML do popup), com o botão **Fixar**.
`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick })` + flag `panelPinned` no
`chrome.storage.local`. Útil para navegar no IG sem perder o estado do import.

## Backend

| Rota | Uso |
|------|-----|
| `GET /api/health` | Online/offline (prod Railway) |
| `POST /api/auth/extension-token` | Login → `{ token, name, email, role }` |
| `GET /api/auth/extension-token` | Sessão (valida Bearer → `{ name, email, role }`) |
| `DELETE /api/auth/extension-token` | Logout (revoga o próprio Bearer) |
| `POST /api/profiles/import` | Cadastro/reativação (+ CORS extensão; `defaultPlatform: instagram`) |
| `GET/POST /api/folders` | Listar/criar pastas do dono (Bearer obrigatório) |
| `PATCH /api/folders/[id]` | Vincular perfil à pasta (`{ profileId, present: true }`) |

CORS: `src/lib/extension-cors.ts` — aceita origens `chrome-extension://`/`moz-extension://`
e localhost do app; métodos `GET, POST, PATCH, DELETE, OPTIONS`; headers
`Content-Type, Authorization, X-Confirm-Force`. Manifesto autoriza
`abs1234-production.up.railway.app` + `*.up.railway.app` (sem `onrender.com`).

## Fluxo de import

```
Botão / popup
  → background import (normaliza p/ URL de perfil, nunca /reel/CODE)
  → GET /api/health (prod Railway)
  → POST /api/profiles/import { text, defaultPlatform: "instagram" }
  → (opcional) PATCH /api/folders/[id] { profileId, present: true }
```

## Manutenção

- Após editar content scripts: **Recarregar extensão + F5** no Instagram.
- “Extension context invalidated” = extensão recarregada com aba antiga aberta.
- Um botão só: `#eoz-ig-btn` (+ slot `#eoz-ig-slot`).
