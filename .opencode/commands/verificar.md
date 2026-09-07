---
description: Roda lint + testes + typecheck e mostra falhas
agent: build
---

Verifique o projeto nesta ordem e reporte o resultado de cada etapa:

1. !`npm run lint`
2. !`npm test`
3. !`npx tsc --noEmit`

Se algo falhar, mostre o erro e sugira o fix. Não faça commit, não dispare coleta, não altere o banco.
