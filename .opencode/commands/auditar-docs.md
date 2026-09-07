---
description: Confere divergência entre código e docs/
agent: build
---

Audite a consistência entre código e documentação (lição da migração Apify: docs desatualizados viram bug operacional):

1. Compare `src/lib/scrapers/`, `src/lib/constants.ts` e `prisma/schema.prisma` com `docs/CRITICAL_RULES.md`, `docs/ARCHITECTURE.md`, `docs/SCRAPING_RULES.md`, `docs/SESSION_POOL.md`, `docs/CREDIT_USAGE.md` e `docs/APIFY_API.md`.
2. Liste divergências reais (números, limites, fluxos, nomes de arquivo) com `arquivo:linha` dos dois lados.
3. Ignore `docs/archive/` (histórico) e `tmp_test_token.mjs` (teste local, não commitar).
4. Não edite nada: só o relatório. Correções só com pedido explícito.
