export const PLATFORMS = ["instagram", "tiktok"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

export const PROFILE_STATUS = ["active", "paused"] as const;

export type ProfileStatus = (typeof PROFILE_STATUS)[number];

export const POST_METRICS = ["views", "likes", "comments", "shares", "engagement"] as const;
export const PROFILE_METRICS = ["followers_absolute", "followers_percent"] as const;
export const RANKING_PERIODS = ["3d", "7d", "30d", "90d", "all"] as const;

export type PostMetric = (typeof POST_METRICS)[number];
export type ProfileMetric = (typeof PROFILE_METRICS)[number];
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

export const INSTAGRAM_GRID_LIMIT = 5;
export const INSTAGRAM_REELS_LIMIT = 5;
export const TIKTOK_VIDEO_LIMIT = 10;
/** Teto do body de POST /api/scrape/run com scope profiles. */
export const MAX_SCRAPE_PROFILE_IDS = 100;
/** Teto para scope:all — evita 1 clique queimar 400+ perfis ×11 créditos. */
export const MAX_SCRAPE_ALL_PROFILES = 200;
/** Custo máximo estimado por perfil (IG 3 datasets 1+5+5=11, TT 1+10=11). */
export const ESTIMATED_CREDITS_PER_PROFILE = 11;
/**
 * Lotes menores na importacao em massa: conexao stream + free tier 5k.
 * Continua respeitando MAX_SCRAPE_PROFILE_IDS na API.
 */
export const MASS_IMPORT_SCRAPE_CHUNK = 20;
/** Teto de perfis validos por POST /api/profiles/import. */
export const MAX_IMPORT_PROFILES = 500;
/** Tamanho maximo do texto colado no import (caracteres). */
export const MAX_IMPORT_TEXT_CHARS = 200_000;
export const SCRAPE_FRESHNESS_WINDOW_MINUTES = 30;
/**
 * Quantas chaves Bright Data processam perfis ao mesmo tempo.
 * Cada chave ainda faz 1 perfil por vez; com N chaves boas, ~N× mais rápido (até o teto).
 * 1 = fila estrita (lenta). Padrão atual: pool multi-conta (ex.: 20 chaves).
 */
export const SCRAPE_MAX_PARALLEL_KEYS = 10;

/**
 * Numero maximo de retentativas por perfil quando todas as chaves saudaveis falham
 * com erros transient/provider/authentication/account. Backoff exponencial aplicado
 * entre rounds (`min(30s, 1s × 2^(round-1))` = 1s, 2s, 4s). Evita que 20 contas instaveis gerem 20
 * tentativas seguidas sem pausa num cenario de rate limit prolongado.
 */
export const SCRAPE_MAX_RETRIES_PER_PROFILE = 3;
