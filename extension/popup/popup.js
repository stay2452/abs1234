const el = {
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
  previewMeta: document.getElementById("preview-meta"),
  folder: document.getElementById("folder"),
  newFolderWrap: document.getElementById("new-folder-wrap"),
  newFolderName: document.getElementById("new-folder-name"),
  importBtn: document.getElementById("import"),
  refreshBtn: document.getElementById("refresh"),
  pinBtn: document.getElementById("pin"),
  feedback: document.getElementById("feedback"),
  openApp: document.getElementById("open-app"),
};

// painel lateral = página normal da extensão (sem ?pinned=)
document.body.classList.add("is-panel");

let detected = null;
let folders = [];
let lastFolderId = "";
let online = false;
let busy = false;
let lastDetectKey = "";
let liveTimer = null;

function setFeedback(text, kind) {
  el.feedback.textContent = text || "";
  el.feedback.className = "feedback" + (kind ? ` ${kind}` : "");
}

function setStatus(isOnline) {
  online = Boolean(isOnline);
  el.status.textContent = online ? "Online" : "Offline";
  el.status.className = `status ${online ? "status-on" : "status-off"}`;
}

function updateImportEnabled() {
  el.importBtn.disabled = busy;
  const folderMode = el.folder.value;
  const needsName = folderMode === "__new__" && !el.newFolderName.value.trim();
  if (needsName && !busy) {
    el.importBtn.title = "Digite o nome da pasta nova";
  } else if (!online && !busy) {
    el.importBtn.title = "App offline — rode npm run dev";
  } else if (!detected?.handle && !busy) {
    el.importBtn.title = "Clique para tentar detectar o @ de novo";
  } else {
    el.importBtn.title = detected?.handle
      ? `Importar @${detected.handle}`
      : "Importar para o tracker";
  }
}

function detectKey(payload) {
  const d = payload?.detected;
  if (!d) return "";
  // inclui reelKey (src do vídeo) p/ forçar UI a trocar no scroll
  return [
    d.platform || "",
    d.handle || "",
    d.pageType || "",
    d.reelKey || payload?.reelKey || "",
    payload?.tabUrl || "",
  ].join(":");
}

function renderDetected(payload, { quiet } = {}) {
  const key = detectKey(payload);
  // evita reescrever DOM se nada mudou
  if (quiet && key && key === lastDetectKey) return;

  // no scroll: se um frame falhou a detecção, mantém o último @ bom
  // (só limpa se a URL da aba mudou de verdade)
  const next = payload?.detected || null;
  if (
    quiet &&
    detected?.handle &&
    !next?.handle &&
    payload?.tabUrl &&
    lastDetectKey.includes(payload.tabUrl.split("?")[0])
  ) {
    return;
  }

  lastDetectKey = key;
  detected = next;
  const d = detected;

  if (d?.handle) {
    el.preview.textContent = `@${d.handle}`;
    const bits = [d.platform || "?", d.pageType || "page"];
    if (payload?.source === "dom" || payload?.source === "script") {
      bits.push("ao vivo");
    }
    el.previewMeta.textContent = bits.join(" · ");
    updateImportEnabled();
    return;
  }

  if (d?.pageType === "reel" || d?.pageType === "post" || d?.pageType === "video") {
    el.preview.textContent = "Reel/post sem @";
    el.previewMeta.textContent =
      "Role o reel ou clique em Importar para tentar de novo.";
    updateImportEnabled();
    return;
  }

  el.preview.textContent = "Nenhum perfil";
  el.previewMeta.textContent = payload?.tabUrl
    ? "Abra um perfil ou reel do Instagram/TikTok."
    : "Abra Instagram ou TikTok.";
  updateImportEnabled();
}

function renderFolders(list) {
  folders = Array.isArray(list) ? list : [];
  const current = el.folder.value || lastFolderId || "";

  el.folder.innerHTML = "";
  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "Sem pasta";
  el.folder.appendChild(optNone);

  for (const f of folders) {
    const opt = document.createElement("option");
    opt.value = f.id;
    const n = f.profileCount != null ? ` (${f.profileCount})` : "";
    opt.textContent = `${f.name}${n}`;
    el.folder.appendChild(opt);
  }

  const optNew = document.createElement("option");
  optNew.value = "__new__";
  optNew.textContent = "+ Criar pasta nova…";
  el.folder.appendChild(optNew);

  if (current === "__new__" || folders.some((f) => f.id === current)) {
    el.folder.value = current;
  } else {
    el.folder.value = "";
  }
  syncNewFolderUi();
}

function syncNewFolderUi() {
  const isNew = el.folder.value === "__new__";
  el.newFolderWrap.hidden = !isNew;
  if (!isNew) el.newFolderName.value = "";
  updateImportEnabled();
}

async function loadPinUi() {
  try {
    const st = await chrome.runtime.sendMessage({ action: "pinStatus" });
    const on = Boolean(st?.pinned);
    el.pinBtn.textContent = on ? "Fixado" : "Fixar";
    el.pinBtn.classList.toggle("is-on", on);
    el.pinBtn.title = on
      ? "Painel lateral fixo: o ícone abre o painel (clique para soltar)"
      : "Fixar no painel lateral — fica aberto enquanto você navega (sem nova aba)";
  } catch {
    /* ignore */
  }
}

/** Só atualiza o @ (leve, para o scroll dos reels). */
async function liveDetect() {
  if (busy) return;
  try {
    const tabInfo = await chrome.runtime.sendMessage({ action: "detectTab" });
    if (tabInfo?.ok) renderDetected(tabInfo, { quiet: true });
  } catch {
    /* ignore */
  }
}

function startLiveLoop() {
  if (liveTimer) return;
  // mais rápido no scroll de reels
  liveTimer = setInterval(() => {
    void liveDetect();
  }, 350);
}

function stopLiveLoop() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}

async function refresh({ full } = { full: true }) {
  if (full) setFeedback("");
  try {
    if (full) {
      const health = await chrome.runtime.sendMessage({ action: "health" });
      setStatus(Boolean(health?.ok));
      if (health?.base) el.openApp.href = `${health.base}/`;
      if (!health?.ok) {
        el.previewMeta.textContent = health?.base
          ? `App offline em ${health.base}`
          : "App offline";
      }

      if (health?.ok) {
        const folderRes = await chrome.runtime.sendMessage({ action: "listFolders" });
        if (folderRes?.ok) renderFolders(folderRes.folders);
        else renderFolders([]);
      } else {
        renderFolders([]);
      }

      try {
        const stored = await chrome.storage.local.get(["lastFolderId"]);
        if (stored.lastFolderId && folders.some((f) => f.id === stored.lastFolderId)) {
          lastFolderId = stored.lastFolderId;
          el.folder.value = lastFolderId;
          syncNewFolderUi();
        }
      } catch {
        /* ignore */
      }
    }

    const tabInfo = await chrome.runtime.sendMessage({ action: "detectTab" });
    renderDetected(tabInfo?.ok ? tabInfo : null);
  } catch (err) {
    if (full) {
      setStatus(false);
      setFeedback(
        err instanceof Error ? err.message : "Falha ao falar com a extensão.",
        "err",
      );
      renderDetected(null);
      renderFolders([]);
    }
  } finally {
    updateImportEnabled();
    void loadPinUi();
  }
}

el.folder.addEventListener("change", () => {
  lastFolderId = el.folder.value === "__new__" ? "" : el.folder.value;
  if (lastFolderId) {
    void chrome.storage.local.set({ lastFolderId });
  }
  syncNewFolderUi();
});

el.newFolderName.addEventListener("input", () => {
  updateImportEnabled();
});

el.refreshBtn.addEventListener("click", () => {
  void refresh({ full: true });
});

el.pinBtn.addEventListener("click", async () => {
  try {
    const st = await chrome.runtime.sendMessage({ action: "pinStatus" });
    if (st?.pinned) {
      await chrome.runtime.sendMessage({ action: "unpinPanel" });
      await loadPinUi();
      setFeedback("Painel solto. O ícone volta a abrir o popup normal.", "ok");
      return;
    }

    // precisa do windowId da janela normal (não da extensão)
    let windowId;
    try {
      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      windowId = win?.id;
    } catch {
      windowId = undefined;
    }

    const res = await chrome.runtime.sendMessage({
      action: "pinPanel",
      windowId,
    });
    if (!res?.ok) {
      setFeedback(res?.error || "Não foi possível fixar o painel.", "err");
      return;
    }
    await loadPinUi();
    setFeedback(
      res.message ||
        "Fixado! Feche este popup e clique de novo no ícone — o painel fica aberto do lado.",
      "ok",
    );
  } catch (err) {
    setFeedback(err instanceof Error ? err.message : "Erro ao fixar.", "err");
  }
});

el.importBtn.addEventListener("click", async () => {
  if (busy) return;

  const folderVal = el.folder.value;
  if (folderVal === "__new__" && !el.newFolderName.value.trim()) {
    setFeedback("Digite o nome da pasta nova.", "err");
    el.newFolderName.focus();
    return;
  }

  busy = true;
  updateImportEnabled();
  setFeedback("Detectando perfil…");
  el.importBtn.textContent = "Detectando…";

  try {
    const tabInfo = await chrome.runtime.sendMessage({ action: "detectTab" });
    if (tabInfo?.ok) renderDetected(tabInfo);

    if (!detected?.handle) {
      setFeedback(
        "Não achei o @. Role o reel até o autor aparecer ou abra o perfil.",
        "err",
      );
      return;
    }

    setFeedback(`Importando @${detected.handle}…`);
    el.importBtn.textContent = "Importando…";

    /** @type {Record<string, unknown>} */
    const payload = {
      action: "import",
      handle: detected.handle,
      platform: detected.platform,
      text: detected.url || undefined,
    };

    if (folderVal === "__new__") {
      payload.newFolderName = el.newFolderName.value.trim();
    } else if (folderVal) {
      payload.folderId = folderVal;
    }

    const result = await chrome.runtime.sendMessage(payload);
    if (!result?.ok) {
      setFeedback(result?.error || "Falha ao importar.", "err");
      return;
    }

    if (result.folderId) {
      lastFolderId = result.folderId;
      await chrome.storage.local.set({ lastFolderId: result.folderId });
    }

    setFeedback(result.message || "Importado.", "ok");

    if (result.folderId || payload.newFolderName) {
      const folderRes = await chrome.runtime.sendMessage({ action: "listFolders" });
      if (folderRes?.ok) {
        renderFolders(folderRes.folders);
        if (result.folderId) el.folder.value = result.folderId;
        syncNewFolderUi();
      }
    }
  } catch (err) {
    setFeedback(err instanceof Error ? err.message : "Erro.", "err");
  } finally {
    busy = false;
    el.importBtn.textContent = "Importar para o tracker";
    updateImportEnabled();
  }
});

// troca de aba / URL → atualiza @
if (chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    void liveDetect();
  });
}
if (chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.status === "complete" || info.url) void liveDetect();
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void liveDetect();
});

window.addEventListener("focus", () => {
  void liveDetect();
});

startLiveLoop();
void refresh({ full: true });

window.addEventListener("unload", () => {
  stopLiveLoop();
});
