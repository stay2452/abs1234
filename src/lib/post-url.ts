import type { Platform } from "@/lib/constants";

function cleanFallbackUrl(value: string) {
  try {
    const parsed = new URL(value);
    parsed.protocol = "https:";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "www.");
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

export function canonicalizePostUrl(
  platform: Platform,
  rawUrl: string,
  externalId?: string | null,
) {
  const fallback = cleanFallbackUrl(rawUrl);

  if (platform === "instagram") {
    const match = /\/(p|reel|tv)\/([^/?#]+)/i.exec(fallback);
    const route = match?.[1]?.toLowerCase() ?? "p";
    const id = externalId?.trim() || match?.[2];
    return id ? `https://www.instagram.com/${route}/${id}/` : fallback;
  }

  const match = /\/@([^/?#]+)\/video\/(\d+)/i.exec(fallback);
  const id = externalId?.trim() || match?.[2];
  const handle = match?.[1];
  return id && handle ? `https://www.tiktok.com/@${handle.toLowerCase()}/video/${id}` : fallback;
}
