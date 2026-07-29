import { SCRAPE_MAX_PARALLEL_KEYS } from "@/lib/constants";

/**
 * Estimativas de tempo maximo de coleta para a UI.
 * Base: ~3 min/perfil no pior caso (datasets + snapshot async).
 * Com K chaves boas em paralelo (ate SCRAPE_MAX_PARALLEL_KEYS), o tempo de parede
 * cai para ceil(N/K) * 3 min.
 */
export const SCRAPE_MAX_MINUTES_PER_PROFILE = 3;
export const SCRAPE_MAX_SECONDS_PER_PROFILE = SCRAPE_MAX_MINUTES_PER_PROFILE * 60;

export function estimateScrapeMaxSeconds(profileCount: number, activeSessionCount = 1) {
  const count = Math.max(0, Math.trunc(profileCount));
  if (count === 0) {
    return 0;
  }

  const keys = Math.max(1, Math.min(Math.trunc(activeSessionCount), SCRAPE_MAX_PARALLEL_KEYS));
  const waves = Math.ceil(count / keys);
  return waves * SCRAPE_MAX_SECONDS_PER_PROFILE;
}

export function formatDurationSeconds(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) {
    return rest > 0 ? `${minutes} min ${rest}s` : `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const minutesRest = minutes % 60;
  return minutesRest > 0 ? `${hours}h ${minutesRest} min` : `${hours}h`;
}

export function formatMaxDurationLabel(profileCount: number, activeSessionCount = 1) {
  const seconds = estimateScrapeMaxSeconds(profileCount, activeSessionCount);
  if (seconds === 0) {
    return "—";
  }

  if (profileCount === 1) {
    return `ate ${formatDurationSeconds(seconds)} por perfil`;
  }

  const keys = Math.max(1, Math.min(Math.trunc(activeSessionCount), SCRAPE_MAX_PARALLEL_KEYS));
  if (keys <= 1) {
    return `ate ${formatDurationSeconds(seconds)} no pior caso (${profileCount} perfis, 1 chave)`;
  }

  return `ate ${formatDurationSeconds(seconds)} no pior caso (${profileCount} perfis, ~${keys} chaves em paralelo)`;
}
