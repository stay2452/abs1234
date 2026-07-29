import {
  PLATFORMS,
  POST_METRICS,
  RANKING_PERIODS,
  type Platform,
  type PostMetric,
  type RankingPeriod,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatChartDateTime, formatNumber, toNumber } from "@/lib/format";
import { PLATFORM_LABELS } from "@/lib/constants";
import { rankPosts } from "@/lib/rankings";
import type { PostRankingItem } from "@/lib/rankings";

export type DiscordNotifySettings = {
  id: string;
  name: string;
  serverLabel: string | null;
  webhookUrl: string | null;
  /** URL mascarada para listagem (nunca logar a URL completa). */
  webhookUrlMasked: string | null;
  enabled: boolean;
  topN: number;
  metric: PostMetric;
  period: RankingPeriod;
  platform: Platform | "all";
  folderId: string | null;
  minViews: number | null;
  minLikes: number | null;
  minEngagement: number | null;
  skipAlreadySent: boolean;
  lastSentAt: string | null;
  lastError: string | null;
  lastResult: DiscordSendResult | null;
  createdAt: string;
  updatedAt: string;
};

export type DiscordSendResult = {
  ok: boolean;
  configId: string;
  configName: string;
  sent: number;
  skipped: number;
  candidates: number;
  posts: Array<{
    id: string;
    handle: string | null;
    platform: string;
    url: string;
    score: number | null;
  }>;
  message: string;
  at: string;
};

const DEFAULTS = {
  topN: 5,
  metric: "views" as PostMetric,
  period: "7d" as RankingPeriod,
  platform: "all" as Platform | "all",
  minViews: null as number | null,
  minLikes: null as number | null,
  minEngagement: null as number | null,
  skipAlreadySent: true,
};

function isPostMetric(value: string): value is PostMetric {
  return (POST_METRICS as readonly string[]).includes(value);
}

function isPeriod(value: string): value is RankingPeriod {
  return (RANKING_PERIODS as readonly string[]).includes(value);
}

function isPlatformFilter(value: string): value is Platform | "all" {
  return value === "all" || (PLATFORMS as readonly string[]).includes(value);
}

function parseLastResult(raw: string | null): DiscordSendResult | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as DiscordSendResult;
  } catch {
    return null;
  }
}

function maskWebhookUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  if (trimmed.length < 20) {
    return "••••••••";
  }
  return `…${trimmed.slice(-12)}`;
}

function assertWebhookUrl(url: string) {
  if (!url.startsWith("https://discord.com/api/webhooks/") && !url.startsWith("https://discordapp.com/api/webhooks/")) {
    throw new Error("URL do webhook Discord invalida.");
  }
}

function mapRow(row: {
  id: string;
  name: string;
  serverLabel: string | null;
  webhookUrl: string | null;
  enabled: boolean;
  topN: number;
  metric: string;
  period: string;
  platform: string;
  folderId: string | null;
  minViews: number | null;
  minLikes: number | null;
  minEngagement: number | null;
  skipAlreadySent: boolean;
  lastSentAt: Date | null;
  lastError: string | null;
  lastResultJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DiscordNotifySettings {
  return {
    id: row.id,
    name: row.name,
    serverLabel: row.serverLabel,
    webhookUrl: row.webhookUrl,
    webhookUrlMasked: maskWebhookUrl(row.webhookUrl),
    enabled: row.enabled,
    topN: row.topN,
    metric: isPostMetric(row.metric) ? row.metric : DEFAULTS.metric,
    period: isPeriod(row.period) ? row.period : DEFAULTS.period,
    platform: isPlatformFilter(row.platform) ? row.platform : DEFAULTS.platform,
    folderId: row.folderId,
    minViews: row.minViews,
    minLikes: row.minLikes,
    minEngagement: row.minEngagement,
    skipAlreadySent: row.skipAlreadySent,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    lastError: row.lastError,
    lastResult: parseLastResult(row.lastResultJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDiscordWebhooks(): Promise<DiscordNotifySettings[]> {
  const rows = await prisma.discordNotifyConfig.findMany({
    orderBy: [{ createdAt: "asc" }],
  });
  return rows.map(mapRow);
}

export async function getDiscordWebhook(id: string): Promise<DiscordNotifySettings | null> {
  const row = await prisma.discordNotifyConfig.findUnique({ where: { id } });
  return row ? mapRow(row) : null;
}

export type DiscordWebhookInput = {
  name?: string;
  serverLabel?: string | null;
  webhookUrl?: string | null;
  enabled?: boolean;
  topN?: number;
  metric?: PostMetric;
  period?: RankingPeriod;
  platform?: Platform | "all";
  folderId?: string | null;
  minViews?: number | null;
  minLikes?: number | null;
  minEngagement?: number | null;
  skipAlreadySent?: boolean;
};

function normalizeInput(input: DiscordWebhookInput) {
  const data: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 80);
    if (!name) {
      throw new Error("Nome do webhook e obrigatorio.");
    }
    data.name = name;
  }
  if (input.serverLabel !== undefined) {
    data.serverLabel = input.serverLabel?.trim().slice(0, 80) || null;
  }
  if (input.webhookUrl !== undefined) {
    const url = input.webhookUrl?.trim() || null;
    if (url) {
      assertWebhookUrl(url);
    }
    data.webhookUrl = url;
  }
  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
  }
  if (input.topN !== undefined) {
    data.topN = Math.min(Math.max(Math.trunc(input.topN), 1), 25);
  }
  if (input.metric !== undefined) {
    if (!isPostMetric(input.metric)) {
      throw new Error("Metrica invalida.");
    }
    data.metric = input.metric;
  }
  if (input.period !== undefined) {
    if (!isPeriod(input.period)) {
      throw new Error("Periodo invalido.");
    }
    data.period = input.period;
  }
  if (input.platform !== undefined) {
    if (!isPlatformFilter(input.platform)) {
      throw new Error("Plataforma invalida.");
    }
    data.platform = input.platform;
  }
  if (input.folderId !== undefined) {
    data.folderId = input.folderId?.trim() || null;
  }
  if (input.minViews !== undefined) {
    data.minViews = input.minViews;
  }
  if (input.minLikes !== undefined) {
    data.minLikes = input.minLikes;
  }
  if (input.minEngagement !== undefined) {
    data.minEngagement = input.minEngagement;
  }
  if (input.skipAlreadySent !== undefined) {
    data.skipAlreadySent = input.skipAlreadySent;
  }

  return data;
}

export async function createDiscordWebhook(input: DiscordWebhookInput) {
  const name = input.name?.trim() || "Novo webhook";
  const data = normalizeInput({ ...input, name });
  const row = await prisma.discordNotifyConfig.create({
    data: {
      name,
      serverLabel: (data.serverLabel as string | null | undefined) ?? null,
      webhookUrl: (data.webhookUrl as string | null | undefined) ?? null,
      enabled: (data.enabled as boolean | undefined) ?? false,
      topN: (data.topN as number | undefined) ?? DEFAULTS.topN,
      metric: (data.metric as string | undefined) ?? DEFAULTS.metric,
      period: (data.period as string | undefined) ?? DEFAULTS.period,
      platform: (data.platform as string | undefined) ?? DEFAULTS.platform,
      folderId: (data.folderId as string | null | undefined) ?? null,
      minViews: (data.minViews as number | null | undefined) ?? null,
      minLikes: (data.minLikes as number | null | undefined) ?? null,
      minEngagement: (data.minEngagement as number | null | undefined) ?? null,
      skipAlreadySent: (data.skipAlreadySent as boolean | undefined) ?? true,
    },
  });
  return mapRow(row);
}

export async function updateDiscordWebhook(id: string, input: DiscordWebhookInput) {
  const data = normalizeInput(input);
  if (Object.keys(data).length === 0) {
    const existing = await getDiscordWebhook(id);
    if (!existing) {
      throw new Error("Webhook nao encontrado.");
    }
    return existing;
  }
  try {
    const row = await prisma.discordNotifyConfig.update({
      where: { id },
      data,
    });
    return mapRow(row);
  } catch {
    throw new Error("Webhook nao encontrado.");
  }
}

export async function deleteDiscordWebhook(id: string) {
  try {
    await prisma.discordNotifyConfig.delete({ where: { id } });
    return { deleted: true, id };
  } catch {
    throw new Error("Webhook nao encontrado.");
  }
}

async function loadRankedPosts(config: DiscordNotifySettings): Promise<PostRankingItem[]> {
  const posts = await prisma.post.findMany({
    where: {
      profile: {
        status: "active",
        ...(config.platform !== "all" ? { platform: config.platform } : {}),
        ...(config.folderId
          ? { profileFolders: { some: { folderId: config.folderId } } }
          : {}),
      },
    },
    include: {
      profile: {
        select: {
          id: true,
          handle: true,
          platform: true,
        },
      },
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
      },
    },
  });

  const ranked = rankPosts(
    posts.map((post) => ({
      id: post.id,
      platform: post.platform,
      url: post.url,
      caption: post.caption,
      publishedAt: post.publishedAt,
      profile: post.profile,
      snapshots: post.snapshots.map((snap) => ({
        views: toNumber(snap.views),
        likes: toNumber(snap.likes),
        comments: toNumber(snap.comments),
        shares: toNumber(snap.shares),
        favorites: toNumber(snap.favorites),
        capturedAt: snap.capturedAt,
      })),
    })),
    config.metric,
    config.period,
    config.platform,
  );

  return ranked.filter((item) => {
    if (config.minViews != null && (item.views == null || item.views < config.minViews)) {
      return false;
    }
    if (config.minLikes != null && (item.likes == null || item.likes < config.minLikes)) {
      return false;
    }
    if (
      config.minEngagement != null &&
      (item.engagement == null || item.engagement < config.minEngagement)
    ) {
      return false;
    }
    return item.score != null;
  });
}

function metricLabel(metric: PostMetric) {
  const labels: Record<PostMetric, string> = {
    views: "Views",
    likes: "Curtidas",
    comments: "Comentários",
    shares: "Compartilhamentos",
    engagement: "Engajamento",
  };
  return labels[metric];
}

function periodLabel(period: RankingPeriod) {
  if (period === "all") {
    return "todo o período";
  }
  return `últimos ${period.replace("d", "")} dias`;
}

function buildEmbeds(items: PostRankingItem[], config: DiscordNotifySettings) {
  return items.map((item, index) => {
    const platform =
      item.platform === "instagram" || item.platform === "tiktok"
        ? PLATFORM_LABELS[item.platform]
        : item.platform;
    const handle = item.profile?.handle ? `@${item.profile.handle}` : "perfil";
    const caption = (item.caption?.trim() || "Sem legenda").slice(0, 180);
    const published = item.publishedAt
      ? formatChartDateTime(item.publishedAt)
      : "sem data";

    return {
      title: `#${index + 1} · ${handle} · ${platform}`,
      description: caption,
      url: item.url,
      color: item.platform === "tiktok" ? 0x69c9d0 : 0xe1306c,
      fields: [
        { name: "Views", value: formatNumber(item.views), inline: true },
        { name: "Curtidas", value: formatNumber(item.likes), inline: true },
        { name: "Coment.", value: formatNumber(item.comments), inline: true },
        { name: "Compart.", value: formatNumber(item.shares), inline: true },
        { name: "Engaj.", value: formatNumber(item.engagement), inline: true },
        {
          name: metricLabel(config.metric),
          value: formatNumber(item.score),
          inline: true,
        },
      ],
      footer: {
        text: `${config.name}${config.serverLabel ? ` · ${config.serverLabel}` : ""} · Publicado ${published} · ${periodLabel(config.period)} · ${metricLabel(config.metric)}`,
      },
    };
  });
}

async function postWebhook(webhookUrl: string, body: Record<string, unknown>) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Discord respondeu ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
}

export async function testDiscordWebhookById(id: string, webhookUrlOverride?: string | null) {
  const config = await getDiscordWebhook(id);
  if (!config) {
    throw new Error("Webhook nao encontrado.");
  }
  const url = (webhookUrlOverride?.trim() || config.webhookUrl || "").trim();
  if (!url) {
    throw new Error("Informe a URL do webhook Discord.");
  }
  assertWebhookUrl(url);

  const label = config.serverLabel
    ? `${config.name} (${config.serverLabel})`
    : config.name;

  await postWebhook(url, {
    content: `✅ **Biblioteca de Perfis** — webhook OK: **${label}**. Este canal pode receber tops virais.`,
  });

  return { ok: true as const, message: `Teste enviado: ${label}.`, configId: id };
}

export async function testDiscordWebhookUrl(webhookUrl: string) {
  const url = webhookUrl.trim();
  if (!url) {
    throw new Error("Informe a URL do webhook Discord.");
  }
  assertWebhookUrl(url);
  await postWebhook(url, {
    content: "✅ **Biblioteca de Perfis** — webhook OK. Este canal pode receber tops virais.",
  });
  return { ok: true as const, message: "Mensagem de teste enviada ao Discord." };
}

export async function sendDiscordTopPostsForConfig(
  configId: string,
  options?: { force?: boolean; ignoreEnabled?: boolean },
) {
  const config = await getDiscordWebhook(configId);
  if (!config) {
    throw new Error("Webhook nao encontrado.");
  }
  const at = new Date().toISOString();

  if (!options?.ignoreEnabled && !config.enabled) {
    throw new Error(`Envio desligado para “${config.name}”. Ative ou use envio manual.`);
  }
  if (!config.webhookUrl) {
    throw new Error(`Configure a URL do webhook “${config.name}”.`);
  }

  const ranked = await loadRankedPosts(config);
  let pool = ranked;

  if (config.skipAlreadySent && !options?.force) {
    const already = await prisma.discordDelivery.findMany({
      where: {
        configId: config.id,
        postId: { in: ranked.map((item) => item.id) },
      },
      select: { postId: true },
    });
    const sentIds = new Set(already.map((row) => row.postId));
    pool = ranked.filter((item) => !sentIds.has(item.id));
  }

  const toSend = pool.slice(0, config.topN);
  const skipped = ranked.length - toSend.length;
  const headerName = config.serverLabel
    ? `${config.name} · ${config.serverLabel}`
    : config.name;

  if (toSend.length === 0) {
    const result: DiscordSendResult = {
      ok: true,
      configId: config.id,
      configName: config.name,
      sent: 0,
      skipped,
      candidates: ranked.length,
      posts: [],
      message:
        ranked.length === 0
          ? `“${config.name}”: nenhum post atende aos critérios.`
          : `“${config.name}”: nada novo para enviar (já enviados ou filtros sem resultado).`,
      at,
    };
    await prisma.discordNotifyConfig.update({
      where: { id: config.id },
      data: {
        lastError: null,
        lastResultJson: JSON.stringify(result),
      },
    });
    return result;
  }

  try {
    const embeds = buildEmbeds(toSend, config);
    for (let i = 0; i < embeds.length; i += 10) {
      const chunk = embeds.slice(i, i + 10);
      await postWebhook(config.webhookUrl, {
        content:
          i === 0
            ? `🔥 **Tops virais** · ${headerName} · ${metricLabel(config.metric)} · ${periodLabel(config.period)}${
                config.platform !== "all" ? ` · ${config.platform}` : ""
              }`
            : undefined,
        embeds: chunk,
      });
    }

    await prisma.$transaction(
      toSend.map((item) =>
        prisma.discordDelivery.upsert({
          where: {
            postId_configId: {
              postId: item.id,
              configId: config.id,
            },
          },
          create: {
            postId: item.id,
            configId: config.id,
            metric: config.metric,
            score: item.score,
            period: config.period,
          },
          update: {
            metric: config.metric,
            score: item.score,
            period: config.period,
            sentAt: new Date(),
          },
        }),
      ),
    );

    const result: DiscordSendResult = {
      ok: true,
      configId: config.id,
      configName: config.name,
      sent: toSend.length,
      skipped,
      candidates: ranked.length,
      posts: toSend.map((item) => ({
        id: item.id,
        handle: item.profile?.handle ?? null,
        platform: item.platform,
        url: item.url,
        score: item.score,
      })),
      message: `“${config.name}”: enviados ${toSend.length} post(s).`,
      at,
    };

    await prisma.discordNotifyConfig.update({
      where: { id: config.id },
      data: {
        lastSentAt: new Date(),
        lastError: null,
        lastResultJson: JSON.stringify(result),
      },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar ao Discord.";
    await prisma.discordNotifyConfig.update({
      where: { id: config.id },
      data: {
        lastError: message,
        lastResultJson: JSON.stringify({
          ok: false,
          configId: config.id,
          configName: config.name,
          sent: 0,
          skipped,
          candidates: ranked.length,
          posts: [],
          message,
          at,
        } satisfies DiscordSendResult),
      },
    });
    throw error;
  }
}

/** Envia em todos os webhooks com enabled=true (para cron futuro). */
export async function sendDiscordTopPostsAllEnabled(options?: { force?: boolean }) {
  const all = await listDiscordWebhooks();
  const enabled = all.filter((item) => item.enabled && item.webhookUrl);
  const results: DiscordSendResult[] = [];
  for (const config of enabled) {
    try {
      results.push(
        await sendDiscordTopPostsForConfig(config.id, {
          force: options?.force,
          ignoreEnabled: false,
        }),
      );
    } catch (error) {
      results.push({
        ok: false,
        configId: config.id,
        configName: config.name,
        sent: 0,
        skipped: 0,
        candidates: 0,
        posts: [],
        message: error instanceof Error ? error.message : "Falha.",
        at: new Date().toISOString(),
      });
    }
  }
  return {
    total: enabled.length,
    results,
  };
}
