/**
 * Roda automaticamente quando o servidor Next.js inicia (dev e prod).
 * Garante que runs zumbis sejam limpos sem ação manual do usuário.
 * Ver docs/PLAN_FIX_AUDITORIA.md — P0
 */
export async function register() {
  // Só no servidor Node.js, não no Edge
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { reconcileZombieRuns } = await import("@/lib/scrape-reconcile");
      const count = await reconcileZombieRuns();
      if (count > 0) console.log(`[instrumentation] ${count} run(s) zumbi reconciliado(s) no boot`);
    } catch (error) {
      console.warn("[instrumentation] falha ao reconciliar:", error instanceof Error ? error.message : String(error));
    }
  }
}
