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

/** Paths / “usuários” do Instagram que não são perfis criadores. */
const INSTAGRAM_RESERVED = new Set([
  "about",
  "accounts",
  "api",
  "blog",
  "challenge",
  "create",
  "developer",
  "direct",
  "directory",
  "emails",
  "explore",
  "graphql",
  "help",
  "legal",
  "lite",
  "locations",
  "nametag",
  "p",
  "popular",
  "press",
  "privacy",
  "reel",
  "reels",
  "session",
  "static",
  "stories",
  "tags",
  "tv",
  "web",
  "your_activity",
  "youractivity",
  "settings",
  "support",
  "terms",
  "safety",
  "community",
  "features",
  "download",
  "meta",
]);

function cleanInput(input: string) {
  return input.trim().replace(/,$/, "");
}

function normalizeHandle(handle: string) {
  return handle.replace(/^@/, "").replace(/\/+$/, "").trim().toLowerCase();
}

function isReservedInstagramHandle(handle: string) {
  return INSTAGRAM_RESERVED.has(handle);
}

function toParsedProfile(
  platform: Platform,
  rawHandle: string,
  input: string,
): ParsedProfileUrl | InvalidProfileUrl {
  const handle = normalizeHandle(rawHandle);
  if (!handle) {
    return { input, reason: "@perfil invalido" };
  }

  if (platform === "instagram" && isReservedInstagramHandle(handle)) {
    return { input, reason: "URL do Instagram não parece ser de perfil" };
  }

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

export function parseProfileUrl(
  rawInput: string,
  defaultPlatform?: Platform,
): ParsedProfileUrl | InvalidProfileUrl {
  const input = cleanInput(rawInput);

  if (!input) {
    return { input: rawInput, reason: "linha vazia" };
  }

  const bareHandle = input.match(/^@([a-zA-Z0-9._-]+)$/);
  if (bareHandle) {
    if (!defaultPlatform) {
      return { input, reason: "selecione Instagram ou TikTok para usar somente @perfil" };
    }

    return toParsedProfile(defaultPlatform, bareHandle[1], input);
  }

  const platformHandle = input.match(/^(instagram|tiktok)\s*[:/@]\s*@?([a-zA-Z0-9._-]+)$/i);
  if (platformHandle) {
    const platform = platformHandle[1].toLowerCase();
    if (hasPlatform(platform)) {
      return toParsedProfile(platform, platformHandle[2], input);
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

export function parseProfileImport(text: string, defaultPlatform?: Platform) {
  const seen = new Set<string>();
  const valid: ParsedProfileUrl[] = [];
  const invalid: InvalidProfileUrl[] = [];

  text
    .split(/[\r\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parsed = parseProfileUrl(line, defaultPlatform);

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
