import { PLATFORMS, type Platform } from "@/lib/constants";

export type ParsedProfileUrl = {
  platform: Platform;
  handle: string;
  url: string;
  input: string;
};

export type InvalidProfileUrl = {
  input: string;
  reason: string;
};

const INSTAGRAM_RESERVED = new Set([
  "accounts",
  "direct",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
]);

function cleanInput(input: string) {
  return input.trim().replace(/,$/, "");
}

function normalizeHandle(handle: string) {
  return handle.replace(/^@/, "").replace(/\/+$/, "").trim().toLowerCase();
}

function hasPlatform(value: string): value is Platform {
  return PLATFORMS.includes(value as Platform);
}

function toUrl(input: string) {
  if (/^https?:\/\//i.test(input)) {
    return new URL(input);
  }

  if (/^(www\.)?(instagram|tiktok)\.com/i.test(input)) {
    return new URL(`https://${input}`);
  }

  return null;
}

export function parseProfileUrl(rawInput: string): ParsedProfileUrl | InvalidProfileUrl {
  const input = cleanInput(rawInput);

  if (!input) {
    return { input: rawInput, reason: "linha vazia" };
  }

  const platformHandle = input.match(/^(instagram|tiktok)\s*[:/@]\s*@?([a-zA-Z0-9._-]+)$/i);
  if (platformHandle) {
    const platform = platformHandle[1].toLowerCase();
    const handle = normalizeHandle(platformHandle[2]);
    if (hasPlatform(platform) && handle) {
      return {
        platform,
        handle,
        url:
          platform === "instagram"
            ? `https://www.instagram.com/${handle}/`
            : `https://www.tiktok.com/@${handle}`,
        input,
      };
    }
  }

  const url = toUrl(input);
  if (!url) {
    return { input, reason: "use uma URL de Instagram/TikTok ou plataforma:@perfil" };
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (host === "instagram.com") {
    const rawHandle = pathParts[0];
    const handle = normalizeHandle(rawHandle ?? "");

    if (!handle || INSTAGRAM_RESERVED.has(handle)) {
      return { input, reason: "URL do Instagram não parece ser de perfil" };
    }

    return {
      platform: "instagram",
      handle,
      url: `https://www.instagram.com/${handle}/`,
      input,
    };
  }

  if (host === "tiktok.com") {
    const rawHandle = pathParts.find((part) => part.startsWith("@"));
    const handle = normalizeHandle(rawHandle ?? "");

    if (!handle) {
      return { input, reason: "URL do TikTok precisa conter @perfil" };
    }

    return {
      platform: "tiktok",
      handle,
      url: `https://www.tiktok.com/@${handle}`,
      input,
    };
  }

  return { input, reason: "domínio não suportado" };
}

export function parseProfileImport(text: string) {
  const seen = new Set<string>();
  const valid: ParsedProfileUrl[] = [];
  const invalid: InvalidProfileUrl[] = [];

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parsed = parseProfileUrl(line);

      if ("reason" in parsed) {
        invalid.push(parsed);
        return;
      }

      const key = `${parsed.platform}:${parsed.handle}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      valid.push(parsed);
    });

  return { valid, invalid };
}
