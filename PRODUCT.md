# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Donos de agência de OFM (OnlyFans Management). Gerenciam várias contas/clientes e usam o app para achar perfis virais e padrões de conteúdo para escalar tráfico. O admin (dono do app) aprova cada conta manualmente; usuários pendentes não logam.

## Product Purpose

Biblioteca pessoal por usuário de perfis de Instagram: cada conta cadastra os próprios perfis, coleta seguidores/posts/reels via Apify (IG-only), acumula histórico em snapshots, ranqueia crescimento e conteúdo por período real de publicação, e detecta outliers (winners) por Creator no Pattern Vault. Sucesso = usuário achar em minutos qual perfil/post replicar.

## Positioning

Biblioteca acumulativa por dono (não feed genérico): mesmo @handle pode existir em contas diferentes; ranking de posts por data REAL de publicação (publishedAt), não data de scrape; winners por outlier 6x6 direto, sem IA.

## Operating Context

- Usuário loga (email/senha), aprovação manual de contas pelo admin.
- Fluxo: cadastra perfis (lista/CSV) → dispara coleta (gasta crédito Apify em pool global do admin) → consulta rankings 3d/7d/30d/90d → organiza em pastas → monta vault por Creator com winners.
- Anti-recoleta 30min; cap 200 perfis por rodada `all`; lotes de 20 no import.
- Extensão Chrome/Edge opcional importa handle/URL via API_ACCESS_TOKEN.
- Admin além do comum: chaves Apify (Sessões), auditoria de coletas, Discord, aprovação de usuários.

## Capabilities and Constraints

- IG-only: TikTok aceito no tracker mas pulado (unsupported_platform, sem custo).
- Supabase PostgreSQL only — sem banco local, sem SQLite, sem navegador/Playwright.
- Coleta = Apify Actors API (3 actors: profile + 5 grade + 5 reels).
- Conta nova entra pendente; primeira conta criada vira admin.
- Sem coleta automática: cada run é pedido explícito.

## Brand Commitments

- Nome candidato: "Eye of Zuck" (o usuário gosta; propostas podem sugerir alternativas, mas essa é a âncora).
- Público interno de agências OFM; linguagem direta, sem corporativês.

## Evidence on Hand

- App real rodando em produção (Render + Supabase) com 240+ perfis e snapshots reais.
- Ranking e vault funcionando; screenshots existentes = telas atuais (visual legado serve de anti-referência no rebrand).
- Números de exemplo para mocks: seguidores, views, growth — usar faixas plausíveis do nicho OFM (dezenas de milhares a milhões).

## Product Principles

1. Número com contexto: toda métrica carrega a data real (publicação/captura) — nunca dado solto.
2. Custo visível: coleta gasta crédito; a interface sempre deixa isso explícito.
3. Biblioteca pessoal: o usuário só vê o que é dele; sem comparação forçada entre contas.
4. Velocidade de decisão: a tela responde "o que eu replico agora?" em segundos.

## Accessibility & Inclusion

Uso prolongado diário em desktop; contraste legível para números pequenos (métricas). Mobile funcional para consulta rápida.
