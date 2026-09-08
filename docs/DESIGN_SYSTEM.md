# Design System — Eye of Zuck · Radar (2026-09-08)

Direção vencedora: **Sistema 1 Radar** (`design-proposals/sistema-radar/` + `design-proposals/landing-eye-of-zuck/`).
Rebrand aplicado em produção sobre o tema verde-escuro anterior. Só visual — nenhum comportamento,
rota, coleta ou regra de negócio mudou.

## Tokens (`src/app/globals.css` `:root`)

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#05070f` | fundo |
| `--panel` / `--panel-2` | `#0b1120` / `#111a2e` | cards |
| `--ink` / `--muted` | `#eef2ff` / `#94a3b8` | texto |
| `--line` | `rgba(148,163,184,.16)` | bordas |
| `--teal` | `#22d3ee` | acento primário (era `#2dd4bf`) |
| `--violet` / `--lime` | `#7c3aed` / `#a3e635` | gradientes, status live |
| `--font-display` | Space Grotesk (next/font) | títulos, valores, marca |

Camada Radar no fim do `globals.css`: sidebar fixa, botões primários em gradiente
`#7c3aed → #4f46e5 → #06b6d4`, fio de luz no topo dos cards, dot de sucesso lima,
auth-card em glass. Classes e markup dos componentes **não mudaram** — só CSS.

## Shell (`src/components/app-shell.tsx`)

Topbar horizontal → **sidebar fixa** (240px, colapsa em mobile). Marca `Eye of Zuck`
+ selo `OFM · Viral Intel`, logo `/logo.png` (`public/logo.png`, copiado da landing)
com anel cônico girando em CSS. Item `Vaults` renomeado para `Vault`. Rotas intactas.

## Páginas

Nenhum `page.tsx` precisou de edição: dashboard (KPIs + ranking + aside), biblioteca,
perfil, vault, pastas, auditoria e login herdam o tema via classes existentes
(`.metric-card`, `.panel`, `.ranking-table`, `.auth-card`…).

## Verificação da entrega

`npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm test` (70) ✓ ·
smoke `next dev`: `/login` 200, `/logo.png` 200, `/api/health` 200, `/` 307→login.
QA visual com login real ainda pendente no navegador.
