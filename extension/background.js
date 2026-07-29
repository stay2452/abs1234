/* global importScripts, BdpApi, BdpDetect */
importScripts("lib/api.js", "lib/detect.js");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  return true;
});

/** Restaura: ícone abre o painel lateral (fica aberto ao navegar). */
async function applyPanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try {
    const { panelPinned } = await chrome.storage.local.get(["panelPinned"]);
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: Boolean(panelPinned),
    });
  } catch {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void applyPanelBehavior();
});
chrome.runtime.onStartup.addListener(() => {
  void applyPanelBehavior();
});
void applyPanelBehavior();

async function handleMessage(message) {
  if (!message?.action) {
    return { ok: false, error: "Ação inválida." };
  }

  switch (message.action) {
    case "health": {
      const result = await BdpApi.health();
      return { ok: result.ok, ...result };
    }
    case "detectTab":
      return detectActiveTab();
    case "listFolders":
      return listFoldersAction();
    case "createFolder":
      return createFolderAction(message);
    case "import":
      return importFromPayload(message);
    case "pinWindow":
    case "pinPanel":
      return pinSidePanel(message);
    case "unpinWindow":
    case "unpinPanel":
      return unpinSidePanel();
    case "pinStatus":
      return pinStatus();
    default:
      return { ok: false, error: "Ação desconhecida." };
  }
}

/**
 * Aba real do browser (não a janela fixa da extensão).
 */
async function getTargetTab() {
  const isHttpTab = (t) =>
    t?.url &&
    !t.url.startsWith("chrome-extension://") &&
    !t.url.startsWith("chrome://") &&
    !t.url.startsWith("edge://") &&
    !t.url.startsWith("about:");

  // 1) última janela focada que seja "normal"
  try {
    const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const ordered = [
      ...wins.filter((w) => w.focused),
      ...wins.filter((w) => !w.focused),
    ];
    for (const w of ordered) {
      const active = (w.tabs || []).find((t) => t.active && isHttpTab(t));
      if (active) return active;
      const social = (w.tabs || []).find(
        (t) =>
          isHttpTab(t) &&
          (t.url.includes("instagram.com") || t.url.includes("tiktok.com")),
      );
      if (social) return social;
    }
  } catch {
    /* fall through */
  }

  // 2) fallback
  const tabs = await chrome.tabs.query({ active: true });
  return (
    tabs.find(
      (t) =>
        isHttpTab(t) &&
        (t.url.includes("instagram.com") || t.url.includes("tiktok.com")),
    ) ||
    tabs.find((t) => isHttpTab(t)) ||
    null
  );
}

function hasHandle(detected) {
  return Boolean(detected?.handle);
}

async function detectViaContentMessage(tabId) {
  try {
    const fromPage = await chrome.tabs.sendMessage(tabId, { action: "bdp-detect" });
    if (fromPage?.ok && fromPage.detected) {
      return { detected: fromPage.detected, source: "dom" };
    }
  } catch {
    /* content script ausente */
  }
  return null;
}

/** Injeta detect.js e roda no tab (fallback se content script morto). */
async function detectViaScripting(tabId) {
  if (!chrome.scripting?.executeScript) return null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["lib/detect.js"],
    });
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const api = globalThis.BdpDetect;
        if (!api?.detectCurrentPage) return null;
        return api.detectCurrentPage(location.href, document);
      },
    });
    const detected = injected?.[0]?.result || null;
    if (detected) return { detected, source: "script" };
  } catch {
    /* sem permissão / página bloqueada */
  }
  return null;
}

async function detectActiveTab() {
  const tab = await getTargetTab();
  if (!tab?.url) {
    return { ok: false, error: "Nenhuma aba do Instagram/TikTok encontrada." };
  }

  const isSocial =
    tab.url.includes("instagram.com") || tab.url.includes("tiktok.com");
  const fromUrl = BdpDetect.detectFromUrl(tab.url);

  // Perfil na URL → confiável, não depende do scroll
  if (hasHandle(fromUrl) && fromUrl.pageType === "profile") {
    return { ok: true, tabUrl: tab.url, detected: fromUrl, source: "url" };
  }

  let best = null;

  if (tab.id != null && isSocial) {
    // 1) content script (rápido, mesmo mundo do botão +)
    const fromMsg = await detectViaContentMessage(tab.id);
    if (fromMsg && hasHandle(fromMsg.detected)) {
      return {
        ok: true,
        tabUrl: tab.url,
        detected: fromMsg.detected,
        source: "dom",
        reelKey: fromMsg.detected.reelKey || null,
      };
    }
    if (fromMsg) best = fromMsg;

    // 2) inject detect.js fresco se content falhou / desatualizado
    const fromScript = await detectViaScripting(tab.id);
    if (fromScript && hasHandle(fromScript.detected)) {
      return {
        ok: true,
        tabUrl: tab.url,
        detected: fromScript.detected,
        source: "script",
        reelKey: fromScript.detected.reelKey || null,
      };
    }
    if (fromScript) best = fromScript;
  }

  if (hasHandle(fromUrl)) {
    return { ok: true, tabUrl: tab.url, detected: fromUrl, source: "url" };
  }

  return {
    ok: true,
    tabUrl: tab.url,
    detected: best?.detected || fromUrl,
    source: best?.source || "url",
  };
}

async function listFoldersAction() {
  const health = await BdpApi.health();
  if (!health.ok) {
    return { ok: false, offline: true, folders: [], error: `App offline em ${health.base}` };
  }
  try {
    const folders = await BdpApi.listFolders();
    return { ok: true, folders };
  } catch (err) {
    return {
      ok: false,
      folders: [],
      error: err instanceof Error ? err.message : "Falha ao listar pastas",
    };
  }
}

async function createFolderAction(message) {
  const name = String(message.name || "").trim();
  if (!name) return { ok: false, error: "Nome da pasta obrigatório." };
  try {
    const folder = await BdpApi.createFolder({ name, color: message.color || "teal" });
    return { ok: true, folder };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao criar pasta",
    };
  }
}

function profileUrl(platform, handle) {
  const h = BdpDetect.normalizeHandle(handle);
  if (!h) return null;
  return platform === "tiktok"
    ? `https://www.tiktok.com/@${h}`
    : `https://www.instagram.com/${h}/`;
}

function isReelLikePath(text) {
  try {
    const u = new URL(text.startsWith("http") ? text : `https://${text}`);
    const first = u.pathname.split("/").filter(Boolean)[0];
    return first === "reel" || first === "reels" || first === "p" || first === "tv";
  } catch {
    return false;
  }
}

async function resolveTargetFromTab() {
  const info = await detectActiveTab();
  const d = info.detected;
  if (d?.handle && d?.url) {
    return {
      text: d.url,
      handle: d.handle,
      platform: d.platform || "instagram",
    };
  }
  if (d?.handle) {
    const platform = d.platform || "instagram";
    return {
      text: profileUrl(platform, d.handle),
      handle: d.handle,
      platform,
    };
  }
  if (d?.pageType === "reel" || d?.pageType === "post") {
    return {
      error: "Não achei o @ do autor neste reel. Use o botão + na página.",
    };
  }
  return { error: "Abra um perfil ou reel do Instagram/TikTok." };
}

async function importFromPayload(message) {
  let text = String(message.text || message.url || "").trim();
  let platform =
    message.platform === "tiktok"
      ? "tiktok"
      : message.platform === "instagram"
        ? "instagram"
        : null;
  let handle = message.handle ? BdpDetect.normalizeHandle(message.handle) : null;

  if (handle) {
    platform = platform || "instagram";
    if (!text || isReelLikePath(text)) {
      text = profileUrl(platform, handle);
    }
  }

  if (!text && !handle) {
    const resolved = await resolveTargetFromTab();
    if (resolved.error) return { ok: false, error: resolved.error };
    text = resolved.text;
    handle = resolved.handle;
    platform = resolved.platform;
  }

  if (!text) {
    return { ok: false, error: "Nenhum perfil detectado na aba." };
  }

  if (isReelLikePath(text) && !handle) {
    return {
      ok: false,
      error: "URL de reel sem @ do autor. Use o botão + na página.",
    };
  }

  const health = await BdpApi.health();
  if (!health.ok) {
    return {
      ok: false,
      error: `App offline em ${health.base}. Rode: npm run dev`,
      offline: true,
    };
  }

  const importBody = { text };
  if (message.defaultPlatform === "instagram" || message.defaultPlatform === "tiktok") {
    importBody.defaultPlatform = message.defaultPlatform;
  }

  const result = await BdpApi.importProfiles(importBody);

  if (!result.totalValid || result.totalValid === 0) {
    const reason = result.invalid?.[0]?.reason || "URL/perfil inválido.";
    return { ok: false, error: reason, result };
  }

  const first = result.profiles?.[0];
  const profileId = result.profileIds?.[0] || first?.id || null;
  const outHandle = first?.handle || handle;
  const outPlatform = first?.platform || platform;

  // pasta: existente ou criar nova
  let folderName = null;
  let folderId = message.folderId || null;
  const newFolderName = String(message.newFolderName || "").trim();

  if (newFolderName && profileId) {
    try {
      const created = await BdpApi.createFolder({ name: newFolderName });
      folderId = created.id;
      folderName = created.name;
    } catch (err) {
      return {
        ok: true,
        imported: true,
        created: result.created,
        updated: result.updated,
        profileId,
        handle: outHandle,
        platform: outPlatform,
        folderError: err instanceof Error ? err.message : String(err),
        message:
          result.created > 0
            ? `@${outHandle} no tracker, mas a pasta não foi criada.`
            : `@${outHandle} já no tracker; pasta não criada.`,
      };
    }
  }

  if (folderId && profileId) {
    try {
      await BdpApi.addProfileToFolder(folderId, profileId);
      if (!folderName) {
        try {
          const folders = await BdpApi.listFolders();
          folderName = folders.find((f) => f.id === folderId)?.name || null;
        } catch {
          folderName = null;
        }
      }
    } catch (err) {
      return {
        ok: true,
        imported: true,
        created: result.created,
        updated: result.updated,
        profileId,
        handle: outHandle,
        platform: outPlatform,
        folderError: err instanceof Error ? err.message : String(err),
        message: `@${outHandle} no tracker, mas não entrou na pasta.`,
      };
    }
  }

  let scrape = null;
  if (message.scrape && profileId) {
    try {
      scrape = await BdpApi.scrapeProfile(profileId, { force: Boolean(message.force) });
    } catch (err) {
      return {
        ok: true,
        imported: true,
        scrapeError: err instanceof Error ? err.message : String(err),
        created: result.created,
        updated: result.updated,
        profileId,
        handle: outHandle,
        platform: outPlatform,
        folderId,
        folderName,
        message:
          result.created > 0
            ? `@${outHandle} importado, mas a coleta falhou.`
            : `@${outHandle} já estava no tracker; coleta falhou.`,
      };
    }
  }

  const created = (result.created || 0) > 0;
  let messageText = created
    ? `@${outHandle} adicionado ao tracker.`
    : `@${outHandle} já estava no tracker.`;
  if (folderName) {
    messageText = created
      ? `@${outHandle} → pasta “${folderName}”.`
      : `@${outHandle} atualizado → pasta “${folderName}”.`;
  }

  return {
    ok: true,
    imported: true,
    created: result.created,
    updated: result.updated,
    profileId,
    handle: outHandle,
    platform: outPlatform,
    folderId,
    folderName,
    scrape,
    message: messageText,
  };
}

/**
 * Painel lateral do Chrome/Edge — fica aberto enquanto você navega (não é nova aba).
 */
async function pinStatus() {
  const { panelPinned } = await chrome.storage.local.get(["panelPinned"]);
  return { ok: true, pinned: Boolean(panelPinned), mode: "sidePanel" };
}

async function pinSidePanel(message) {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return {
      ok: false,
      error: "Painel lateral não disponível neste navegador. Use Chrome/Edge atualizado.",
    };
  }

  await chrome.storage.local.set({ panelPinned: true });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // abre o painel na janela atual (se soubermos o id)
  try {
    let windowId = message?.windowId;
    if (windowId == null) {
      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      windowId = win?.id;
    }
    if (windowId != null) {
      await chrome.sidePanel.open({ windowId });
    }
  } catch {
    /* open pode falhar se chamado de contexto sem user gesture em alguns casos */
  }

  return {
    ok: true,
    pinned: true,
    mode: "sidePanel",
    message: "Painel fixo: o ícone abre o painel e ele fica ao lado enquanto você navega.",
  };
}

async function unpinSidePanel() {
  await chrome.storage.local.set({ panelPinned: false });
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    } catch {
      /* ignore */
    }
  }
  return { ok: true, pinned: false, mode: "sidePanel" };
}
