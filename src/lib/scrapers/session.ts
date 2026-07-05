import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserSession } from "@prisma/client";
import { chromium, type BrowserContext } from "playwright";
import { ensureDefaultSearchProvider } from "@/lib/browser-profile";
import { PLATFORM_LABELS, PLATFORMS, type Platform } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { maskProxy, parseProxyConfig } from "@/lib/proxy";

const globalForSessions = globalThis as unknown as {
  loginContexts?: Map<string, BrowserContext>;
};

const loginContexts = globalForSessions.loginContexts ?? new Map<string, BrowserContext>();
globalForSessions.loginContexts = loginContexts;

type CreateBrowserSessionInput = {
  platform: Platform;
  name: string;
  proxyUrl?: string | null;
};

type UpdateBrowserSessionInput = {
  id: string;
  name?: string;
  proxyUrl?: string | null;
  status?: string;
};

export type BrowserSessionView = {
  id: string;
  platform: Platform;
  name: string;
  proxyLabel: string;
  hasProxy: boolean;
  hasStorage: boolean;
  status: string;
  lastOpenedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type BrowserSessionTestResult = {
  sessionId: string;
  ok: boolean;
  proxyLabel: string;
  checks: Array<{
    label: string;
    url: string;
    ok: boolean;
    status: number | null;
    detail: string;
  }>;
};

export type ActiveBrowserSession = BrowserSession & { platform: Platform };

function isPlatform(value: string): value is Platform {
  return PLATFORMS.includes(value as Platform);
}

function normalizeName(name: string, platform: Platform) {
  const trimmed = name.trim();
  return trimmed || `${PLATFORM_LABELS[platform]} isolado`;
}

function normalizeProxyUrl(proxyUrl?: string | null) {
  const trimmed = proxyUrl?.trim();
  return trimmed || null;
}

function makeStorageKey(platform: Platform) {
  return `${platform}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getSessionDir(session: Pick<BrowserSession, "storageKey">) {
  return path.join(process.cwd(), ".sessions", session.storageKey);
}

export function getPlatformLoginUrl(platform: Platform) {
  return platform === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/";
}

type PersistentLaunchOptions = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;

function browserArgs(platform: Platform) {
  return [
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    ...(platform === "tiktok" ? ["--lang=pt-BR"] : []),
  ];
}

async function launchSessionContext(
  session: Pick<BrowserSession, "platform" | "proxyUrl" | "storageKey">,
  options: {
    headless: boolean;
    viewport: { width: number; height: number };
  },
) {
  const platform = isPlatform(session.platform) ? session.platform : "instagram";
  const userDataDir = await ensureSessionDir(session);
  await ensureDefaultSearchProvider(userDataDir);

  const baseOptions: PersistentLaunchOptions = {
    headless: options.headless,
    viewport: options.viewport,
    proxy: parseProxyConfig(session.proxyUrl),
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    args: browserArgs(platform),
  };
  const channelCandidates: Array<PersistentLaunchOptions["channel"]> =
    platform === "tiktok" ? ["chrome", undefined] : [undefined];
  let lastError: unknown;

  for (const channel of channelCandidates) {
    try {
      return await chromium.launchPersistentContext(userDataDir, {
        ...baseOptions,
        channel,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function ensureSessionDir(session: Pick<BrowserSession, "storageKey">) {
  const dir = getSessionDir(session);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function removeSessionDir(session: Pick<BrowserSession, "storageKey">) {
  const sessionsRoot = path.resolve(process.cwd(), ".sessions");
  const sessionDir = path.resolve(getSessionDir(session));

  if (sessionDir === sessionsRoot || !sessionDir.startsWith(`${sessionsRoot}${path.sep}`)) {
    throw new Error("Caminho da sessao invalido.");
  }

  await fs.rm(sessionDir, { recursive: true, force: true });
}

export async function hasSavedSession(session: Pick<BrowserSession, "storageKey">) {
  try {
    const entries = await fs.readdir(getSessionDir(session), { recursive: true });
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function ensureSeedBrowserSessions() {
  for (const platform of PLATFORMS) {
    const count = await prisma.browserSession.count({ where: { platform } });

    if (count === 0) {
      await prisma.browserSession.create({
        data: {
          platform,
          name: `${PLATFORM_LABELS[platform]} principal`,
          storageKey: platform,
          status: "active",
        },
      });
    }
  }
}

async function sessionToView(session: BrowserSession): Promise<BrowserSessionView> {
  return {
    id: session.id,
    platform: session.platform as Platform,
    name: session.name,
    proxyLabel: maskProxy(session.proxyUrl),
    hasProxy: Boolean(session.proxyUrl),
    hasStorage: await hasSavedSession(session),
    status: session.status,
    lastOpenedAt: session.lastOpenedAt?.toISOString() ?? null,
    lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
  };
}

export async function listBrowserSessions() {
  await ensureSeedBrowserSessions();
  const sessions = await prisma.browserSession.findMany({
    orderBy: [{ platform: "asc" }, { status: "asc" }, { createdAt: "asc" }],
  });

  return Promise.all(sessions.map(sessionToView));
}

export async function createBrowserSession(input: CreateBrowserSessionInput) {
  const session = await prisma.browserSession.create({
    data: {
      platform: input.platform,
      name: normalizeName(input.name, input.platform),
      proxyUrl: normalizeProxyUrl(input.proxyUrl),
      storageKey: makeStorageKey(input.platform),
      status: "active",
    },
  });

  await ensureSessionDir(session);
  return sessionToView(session);
}

export async function updateBrowserSession(input: UpdateBrowserSessionInput) {
  const existing = await prisma.browserSession.findUniqueOrThrow({
    where: { id: input.id },
  });
  const platform = isPlatform(existing.platform) ? existing.platform : "instagram";
  const session = await prisma.browserSession.update({
    where: { id: input.id },
    data: {
      name: input.name === undefined ? undefined : normalizeName(input.name, platform),
      proxyUrl: input.proxyUrl === undefined ? undefined : normalizeProxyUrl(input.proxyUrl),
      status: input.status,
    },
  });

  return sessionToView(session);
}

export async function deleteBrowserSession(id: string) {
  const session = await getBrowserSession(id);
  const context = loginContexts.get(session.id);

  if (context) {
    await context.close().catch(() => undefined);
    loginContexts.delete(session.id);
  }

  await prisma.browserSession.delete({
    where: { id: session.id },
  });
  await removeSessionDir(session);
  await ensureSeedBrowserSessions();

  return { deleted: true, id: session.id };
}

export async function getActiveBrowserSessions(platform: Platform): Promise<ActiveBrowserSession[]> {
  await ensureSeedBrowserSessions();
  const sessions = await prisma.browserSession.findMany({
    where: { platform, status: "active" },
    orderBy: [{ lastUsedAt: "asc" }, { createdAt: "asc" }],
  });

  if (sessions.length === 0) {
    throw new Error(`Nenhuma sessao ativa de ${PLATFORM_LABELS[platform]} encontrada.`);
  }

  return sessions.map((session) => ({ ...session, platform }));
}

async function getBrowserSession(id: string) {
  const session = await prisma.browserSession.findUniqueOrThrow({
    where: { id },
  });

  if (!isPlatform(session.platform)) {
    throw new Error("Sessao com plataforma invalida.");
  }

  return session as BrowserSession & { platform: Platform };
}

export async function openLoginBrowser(sessionId: string) {
  const session = await getBrowserSession(sessionId);
  const existing = loginContexts.get(session.id);

  if (existing) {
    const page = existing.pages()[0] ?? (await existing.newPage());
    await page.goto(getPlatformLoginUrl(session.platform), { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    await prisma.browserSession.update({
      where: { id: session.id },
      data: { lastOpenedAt: new Date() },
    });
    return { alreadyOpen: true };
  }

  const context = await launchSessionContext(session, {
    headless: false,
    viewport: { width: 1280, height: 860 },
  });

  loginContexts.set(session.id, context);
  context.on("close", () => loginContexts.delete(session.id));

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(getPlatformLoginUrl(session.platform), { waitUntil: "domcontentloaded" });
  await prisma.browserSession.update({
    where: { id: session.id },
    data: { lastOpenedAt: new Date() },
  });

  return { alreadyOpen: false };
}

export async function testBrowserSession(sessionId: string): Promise<BrowserSessionTestResult> {
  const session = await getBrowserSession(sessionId);
  const existing = loginContexts.get(session.id);
  let context = existing;
  let shouldCloseContext = false;

  if (!context) {
    context = await launchSessionContext(session, {
      headless: true,
      viewport: { width: 1280, height: 900 },
    });
    shouldCloseContext = true;
  }

  const checks: BrowserSessionTestResult["checks"] = [];
  const targets = [
    { label: "IP publico", url: "https://api.ipify.org?format=json" },
    { label: "Site neutro", url: "https://example.com/" },
  ];

  try {
    for (const target of targets) {
      const page = await context.newPage();
      try {
        const response = await page.goto(target.url, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        const text = await page.locator("body").textContent({ timeout: 3000 }).catch(() => "");
        checks.push({
          label: target.label,
          url: target.url,
          ok: Boolean(response?.ok()),
          status: response?.status() ?? null,
          detail: (text ?? "").trim().slice(0, 140) || "carregou sem texto",
        });
      } catch (error) {
        checks.push({
          label: target.label,
          url: target.url,
          ok: false,
          status: null,
          detail: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    if (shouldCloseContext) {
      await context.close().catch(() => undefined);
    }
  }

  return {
    sessionId: session.id,
    ok: checks.some((check) => check.ok),
    proxyLabel: maskProxy(session.proxyUrl),
    checks,
  };
}

export async function getScrapeContextForSession(session: ActiveBrowserSession) {
  const existing = loginContexts.get(session.id);

  if (existing) {
    await prisma.browserSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      context: existing,
      shared: true,
      close: async () => undefined,
    };
  }

  const context = await launchSessionContext(session, {
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  await prisma.browserSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    context,
    shared: false,
    close: async () => {
      await context.close();
    },
  };
}
