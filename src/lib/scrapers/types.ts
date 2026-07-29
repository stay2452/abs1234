import type { Platform } from "@/lib/constants";

export type ScrapeProfileInput = {
  id: string;
  platform: Platform;
  handle: string;
  url: string;
};

export type ScrapedMetric = number | null;

export type ScrapedPost = {
  externalId?: string | null;
  url: string;
  sourceType?: string;
  caption?: string | null;
  publishedAt?: Date | null;
  metrics: {
    views?: ScrapedMetric;
    likes?: ScrapedMetric;
    comments?: ScrapedMetric;
    shares?: ScrapedMetric;
    favorites?: ScrapedMetric;
  };
};

export type ScrapeDatasetUsage = {
  datasetId: string;
  status: "success" | "failed" | "no_data";
  requestsMade: number;
  recordsReceived: number;
  recordsKept: number;
  errorCode?: string;
  errorMessage?: string;
};

export type ScrapePartialError = {
  message: string;
  errorCode: string;
  /**
   * True quando o dataset falhado e essencial (perfil principal — sem ele nao
   * faz sentido o perfil). False quando e opcional (Grade/Reels/Videos) — virou
   * warning, nao falha estrutural do run. Default true para preservar semantica
   * historica quando o adaptador nao especificar.
   */
  essential?: boolean;
};

export type ScrapeDatasetProgress = {
  datasetId: string;
  status: "success" | "failed";
  recordsReceived: number;
  errorCode?: string;
};

export type DatasetProgressReporter = (progress: ScrapeDatasetProgress) => void | Promise<void>;

export type ScrapeProgressEvent =
  | {
      type: "started";
      profilesTotal: number;
      profilesAttempted: number;
      profilesSkipped: number;
      datasetsTotal: number;
    }
  | {
      type: "dataset";
      profileId: string;
      handle: string;
      platform: Platform;
      datasetId: string;
      status: "success" | "failed";
      recordsReceived: number;
      datasetsCompleted: number;
      datasetsTotal: number;
      errorCode?: string;
    };

export type ScrapedProfileResult = {
  followers?: ScrapedMetric;
  following?: ScrapedMetric;
  likes?: ScrapedMetric;
  postsCount?: number | null;
  posts: ScrapedPost[];
  profileDataFound: boolean;
  datasets: ScrapeDatasetUsage[];
  partialError?: ScrapePartialError;
};

export class ScrapeCollectionError extends Error {
  constructor(
    message: string,
    readonly datasets: ScrapeDatasetUsage[],
    readonly errorCode: string,
  ) {
    super(message);
    this.name = "ScrapeCollectionError";
  }
}

export function getScrapeDatasetUsage(error: unknown) {
  return error instanceof ScrapeCollectionError ? error.datasets : [];
}

export function getScrapeErrorCode(error: unknown) {
  if (error instanceof ScrapeCollectionError) {
    return error.errorCode;
  }
  // Erros de SQLite/Prisma (database is locked, SQLITE_BUSY, timeout): sao transient
  // — uma retentativa com outra chave ou em outro momento resolves. Sem isso o perfil
  // terminaria como "unknown" sem retry, descartando coletas sob 20 workers em paralelo.
  const msg = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|locked|busy|SQLITE_BUSY|database is locked|Socket timeout|Unable to open/i.test(msg)) {
    return "transient";
  }
  return "unknown";
}
