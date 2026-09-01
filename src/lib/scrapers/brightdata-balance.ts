/**
 * Saldo Bright Data via Account Management API.
 * GET https://api.brightdata.com/customer/balance
 * Requer chave com permissao de billing; chaves so de scraper costumam retornar 403.
 */

/** Free tier: 5000 creditos ≈ $7.50 (doc BD). */
export const FREE_TIER_CREDITS = 5_000;
export const FREE_TIER_USD_VALUE = 7.5;
export const CREDITS_PER_USD = FREE_TIER_CREDITS / FREE_TIER_USD_VALUE;

export type CreditStatus = "has_credit" | "no_credit" | "unknown" | "permission_denied";

export type BalanceProbeResult = {
  creditStatus: CreditStatus;
  balanceUsd: number | null;
  pendingBalanceUsd: number | null;
  /** Creditos restantes estimados a partir do saldo USD (free tier). */
  creditsFromBalance: number | null;
  message: string | null;
};

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function usdToEstimatedCredits(usd: number) {
  return Math.max(0, Math.round(usd * CREDITS_PER_USD));
}

/**
 * Consulta saldo oficial da conta ligada a esta API key.
 * Nao e cobrado como coleta de dataset; e read-only de account management.
 */
export async function fetchBrightDataBalance(apiKey: string): Promise<BalanceProbeResult> {
  const key = apiKey.trim();
  if (!key) {
    return {
      creditStatus: "unknown",
      balanceUsd: null,
      pendingBalanceUsd: null,
      creditsFromBalance: null,
      message: "Chave vazia.",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch("https://api.brightdata.com/customer/balance", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const text = await response.text();

    if (response.status === 401 || response.status === 403) {
      const detailLower = text.toLowerCase();
      if (/customer is not active|suspended|inactive|no credit|insufficient|balance/.test(detailLower)) {
        return {
          creditStatus: "no_credit",
          balanceUsd: null,
          pendingBalanceUsd: null,
          creditsFromBalance: null,
          message: `Bright Data conta inativa/sem crédito (HTTP ${response.status}): ${text.slice(0,120)}`,
        };
      }
      return {
        creditStatus: "permission_denied",
        balanceUsd: null,
        pendingBalanceUsd: null,
        creditsFromBalance: null,
        message:
          "Esta chave nao tem permissao de billing. Em Bright Data > Users, habilite permissao de conta/saldo ou use uma chave admin. Enquanto isso usamos estimativa local.",
      };
    }

    if (!response.ok) {
      const detail = text.replace(/[\r\n\t]+/g, " ").trim().slice(0, 180);
      const looksEmpty =
        response.status === 402 ||
        /credit|balance|funds|insufficient|payment|customer is not active|suspended|inactive/i.test(detail);
      return {
        creditStatus: looksEmpty ? "no_credit" : "unknown",
        balanceUsd: null,
        pendingBalanceUsd: null,
        creditsFromBalance: null,
        message: `Bright Data HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      return {
        creditStatus: "unknown",
        balanceUsd: null,
        pendingBalanceUsd: null,
        creditsFromBalance: null,
        message: "Resposta de saldo nao e JSON.",
      };
    }

    const record =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {};
    const balanceUsd = numberOrNull(record.balance);
    const pendingBalanceUsd = numberOrNull(record.pending_balance);

    if (balanceUsd === null) {
      return {
        creditStatus: "unknown",
        balanceUsd: null,
        pendingBalanceUsd,
        creditsFromBalance: null,
        message: "Campo balance ausente na resposta.",
      };
    }

    // Doc oficial: /customer/balance retorna saldo em USD (Account Management API).
    // Heuristica defensiva para contas que possam retornar creditos diretos em vez
    // de USD: se o valor for >= 100 (>5000 free tier raramente cabe em USD de
    // conta free), assumimos que ja vem em creditos e nao multiplicamos por
    // CREDITS_PER_USD. Prevencao contra classificar errado o estado de credito.
    const looksLikeCredits = balanceUsd >= 100;
    const creditStatus: CreditStatus = balanceUsd > 0 ? "has_credit" : "no_credit";
    const estimatedCreditsFromBalance = looksLikeCredits
      ? Math.round(balanceUsd)
      : usdToEstimatedCredits(balanceUsd);

    return {
      creditStatus,
      balanceUsd,
      pendingBalanceUsd,
      creditsFromBalance: estimatedCreditsFromBalance,
      message: looksLikeCredits
        ? "Saldo retornado como creditos (nao USD) — conversao USD pulada."
        : null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout ao consultar saldo Bright Data."
        : error instanceof Error
          ? error.message
          : "Falha ao consultar saldo.";
    return {
      creditStatus: "unknown",
      balanceUsd: null,
      pendingBalanceUsd: null,
      creditsFromBalance: null,
      message,
    };
  }
}

export function isInsufficientCreditError(message: string) {
  return /credit|balance|funds|insufficient|payment required|402|sem credito|no credit|customer is not active|suspended|inactive/i.test(
    message,
  );
}
