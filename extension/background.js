/* Eye of Zuck v2 — service worker: router import + pastas + side panel. IG-only. */
importScripts("lib/api.js", "lib/ig-detect.js");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true;
});

async function applyPanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try {
    const { panelPinned } = await chrome.storage.local.get(["panelPinned"]);
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: Boolean(panelPinned) });
  } catch {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(() => void applyPanelBehavior());
chrome.runtime.onStartup.addListener(() => void applyPanelBehavior());
void applyPanelBehavior();

async function handleMessage(message) {
  if (!message?.action) return { ok: false, error: "Acao invalida." };
  switch (message.action) {
    case "health":
      return EozApi.health();
    case "login":
      return loginAction(message);
    case "logout":
      await EozApi.logoutExtension();
      return { ok: true };
    case "me":
      return meAction();
    case "detectTab":
      return detectActiveTab();
    case "listFolders":
      return listFoldersAction();
    case "import":
      return importAction(message);
    case "pinPanel":
      return pinSidePanel(message);
    case "unpinPanel":
      return unpinSidePanel();
    case "pinStatus":
      return pinStatus();
    default:
      return { ok: false, error: "Acao desconhecida." };
  }
}

async function loginAction(message) {
  const email = String(message.email || "").trim();
  const password = String(message.password || "");
  if (!email || !password) return { ok: false, error: "Informe email e senha." };
  try {
    const data = await EozApi.loginExtension(email, password);
    return { ok: true, name: data.name, email: data.email, role: data.role || "user" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Login falhou." };
  }
}

async function meAction() {
  try {
    const stored = await chrome.storage.sync.get(["apiToken", "account"]);
    if (!stored.apiToken) return { ok: false, logged: false };
    if (stored.account?.email) {
      try {
        const fresh = await EozApi.me();
        return { ok: true, logged: true, ...fresh };
      } catch {
        return { ok: true, logged: true, ...stored.account };
      }
    }
    const fresh = await EozApi.me();
    return { ok: true, logged: true, ...fresh };
  } catch (err) {
    return { ok: false, logged: false, error: err instanceof Error ? err.message : "Sessao invalida." };
  }
}

async function getTargetTab() {
  const isHttp = (t) => Boolean(t?.url) && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("chrome://") && !t.url.startsWith("edge://") && !t.url.startsWith("about:");
  try {
    const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const ordered = [...wins.filter((w) => w.focused), ...wins.filter((w) => !w.focused)];
    for (const w of ordered) {
      const active = (w.tabs || []).find((t) => t.active && isHttp(t));
      if (active) return active;
      const ig = (w.tabs || []).find((t) => isHttp(t) && t.url.includes("instagram.com"));
      if (ig) return ig;
    }
  } catch {
    /* fallback */
  }
  const tabs = await chrome.tabs.query({ active: true });
  return tabs.find((t) => isHttp(t) && t.url.includes("instagram.com")) || tabs.find((t) => isHttp(t)) || null;
}

async function detectActiveTab() {
  const tab = await getTargetTab();
  if (!tab?.url) return { ok: false, error: "Nenhuma aba do Instagram encontrada." };
  const fromUrl = EozDetect.detectFromUrl(tab.url);
  if (fromUrl.handle && fromUrl.pageType === "profile") {
    return { ok: true, tabUrl: tab.url, detected: fromUrl, source: "url" };
  }
  if (tab.id != null && tab.url.includes("instagram.com")) {
    try {
      const fromPage = await chrome.tabs.sendMessage(tab.id, { action: "eoz-detect" });
      if (fromPage?.ok && fromPage.detected?.handle) {
        return { ok: true, tabUrl: tab.url, detected: fromPage.detected, source: "dom" };
      }
    } catch {
      /* content ausente */
    }
  }
  return { ok: true, tabUrl: tab.url, detected: fromUrl, source: "url" };
}

async function listFoldersAction() {
  const health = await EozApi.health();
  if (!health.ok) return { ok: false, offline: true, folders: [], error: "App offline na Railway." };
  try {
    const folders = await EozApi.listFolders();
    return { ok: true, folders };
  } catch (err) {
    return { ok: false, folders: [], error: err instanceof Error ? err.message : "Falha ao listar pastas" };
  }
}

function toProfileUrl(handle) {
  const h = EozDetect.normalizeHandle(handle);
  return h ? `https://www.instagram.com/${h}/` : null;
}

async function importAction(message) {
  let text = String(message.text || "").trim();
  let handle = message.handle ? EozDetect.normalizeHandle(message.handle) : null;
  if (handle && !EozDetect.isValidHandle(handle)) {
    return { ok: false, error: "Perfil invalido." };
  }
  if (handle && (!text || /^\/(reel|reels|p|tv)(\/|$)/i.test(new URL(text.startsWith("http") ? text : `https://${text}`).pathname))) {
    text = toProfileUrl(handle);
  }
  if (!text && handle) text = toProfileUrl(handle);
  if (!text) {
    const info = await detectActiveTab();
    const d = info.detected;
    if (d?.handle && d?.url) {
      text = d.url;
      handle = d.handle;
    } else {
      return { ok: false, error: "Abra um perfil ou reel do Instagram." };
    }
  }

  const health = await EozApi.health();
  if (!health.ok) return { ok: false, offline: true, error: "App offline na Railway. Tente de novo." };

  let result;
  try {
    result = await EozApi.importProfiles({ text, defaultPlatform: "instagram" });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao importar." };
  }
  if (!result.totalValid) {
    return { ok: false, error: result.invalid?.[0]?.reason || "URL/perfil invalido.", result };
  }

  const first = result.profiles?.[0];
  const profileId = result.profileIds?.[0] || first?.id || null;
  const outHandle = first?.handle || handle;

  let folderId = message.folderId || null;
  let folderName = null;
  const newFolderName = String(message.newFolderName || "").trim();
  if (newFolderName && profileId) {
    try {
      const created = await EozApi.createFolder({ name: newFolderName });
      folderId = created.id;
      folderName = created.name;
    } catch (err) {
      return {
        ok: true, imported: true, profileId, handle: outHandle, platform: "instagram",
        created: result.created, updated: result.updated,
        folderError: err instanceof Error ? err.message : String(err),
        message: `@${outHandle} no tracker, mas a pasta nao foi criada.`,
      };
    }
  }
  if (folderId && profileId) {
    try {
      await EozApi.addProfileToFolder(folderId, profileId);
      if (!folderName) {
        try {
          const folders = await EozApi.listFolders();
          folderName = folders.find((f) => f.id === folderId)?.name || null;
        } catch {
          folderName = null;
        }
      }
    } catch (err) {
      return {
        ok: true, imported: true, profileId, handle: outHandle, platform: "instagram",
        created: result.created, updated: result.updated,
        folderError: err instanceof Error ? err.message : String(err),
        message: `@${outHandle} no tracker, mas nao entrou na pasta.`,
      };
    }
  }

  const created = (result.created || 0) > 0;
  let messageText = created ? `@${outHandle} adicionado ao tracker.` : `@${outHandle} ja estava no tracker.`;
  if (folderName) {
    messageText = created ? `@${outHandle} → pasta "${folderName}".` : `@${outHandle} atualizado → pasta "${folderName}".`;
  }
  return {
    ok: true, imported: true, created: result.created, updated: result.updated,
    profileId, handle: outHandle, platform: "instagram", folderId, folderName, message: messageText,
  };
}

async function pinStatus() {
  const { panelPinned } = await chrome.storage.local.get(["panelPinned"]);
  return { ok: true, pinned: Boolean(panelPinned) };
}

async function pinSidePanel(message) {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return { ok: false, error: "Painel lateral indisponivel neste navegador." };
  }
  await chrome.storage.local.set({ panelPinned: true });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  try {
    let windowId = message?.windowId;
    if (windowId == null) {
      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      windowId = win?.id;
    }
    if (windowId != null) await chrome.sidePanel.open({ windowId });
  } catch {
    /* open pode falhar sem user gesture */
  }
  return { ok: true, pinned: true, message: "Fixado! O icone abre o painel ao lado." };
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
  return { ok: true, pinned: false };
}
