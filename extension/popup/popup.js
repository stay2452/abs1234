/* Eye of Zuck v2 — popup + side panel (mesmo HTML). Railway fixo, IG-only. */
const el = {
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
  previewMeta: document.getElementById("preview-meta"),
  folder: document.getElementById("folder"),
  newFolderWrap: document.getElementById("new-folder-wrap"),
  newFolderName: document.getElementById("new-folder-name"),
  importBtn: document.getElementById("import"),
  actions: document.getElementById("actions"),
  abaCard: document.getElementById("aba-card"),
  folderCard: document.getElementById("folder-card"),
  refreshBtn: document.getElementById("refresh"),
  pinBtn: document.getElementById("pin"),
  feedback: document.getElementById("feedback"),
  links: document.getElementById("links"),
  openAdmin: document.getElementById("open-admin"),
  loginCard: document.getElementById("login-card"),
  accountCard: document.getElementById("account-card"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginBtn: document.getElementById("login-btn"),
  accountName: document.getElementById("account-name"),
  accountRole: document.getElementById("account-role"),
  logoutBtn: document.getElementById("logout-btn"),
};

document.body.classList.add("is-panel");

let detected = null;
let folders = [];
let online = false;
let busy = false;
let account = null;
let lastDetectKey = "";

function msg(action, payload) {
  return chrome.runtime.sendMessage({ action, ...(payload || {}) });
}

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
  el.importBtn.disabled =
    busy || !account || !online || !detected?.handle || el.folder.value === "__new__"
      ? el.folder.value === "__new__" && !el.newFolderName.value.trim()
        ? true
        : !account || !online || !detected?.handle || busy
      : false;
  if (!account) el.importBtn.title = "Entre com sua conta para importar";
  else if (!online) el.importBtn.title = "App offline na Railway";
  else if (!detected?.handle) el.importBtn.title = "Abra um perfil ou reel do Instagram";
  else el.importBtn.title = `Importar @${detected.handle}`;
}

function renderAccount(acc) {
  account = acc || null;
  const logged = Boolean(account);
  el.loginCard.hidden = logged;
  el.accountCard.hidden = !logged;
  el.abaCard.hidden = !logged;
  el.folderCard.hidden = !logged;
  el.actions.hidden = !logged;
  el.links.hidden = !logged;
  if (logged) {
    el.accountName.textContent = account.name || account.email || "Conectado";
    const isAdmin = account.role === "admin";
    el.accountRole.innerHTML = "";
    const badge = document.createElement("span");
    badge.className = `badge ${isAdmin ? "badge-admin" : "badge-user"}`;
    badge.textContent = isAdmin ? "painel admin" : "painel usuário";
    el.accountRole.appendChild(badge);
    el.openAdmin.hidden = !isAdmin;
  }
  updateImportEnabled();
}

function detectKey(payload) {
  const d = payload?.detected;
  if (!d) return "";
  return [d.platform || "", d.handle || "", d.pageType || "", payload?.tabUrl || ""].join(":");
}

function renderDetected(payload, quiet) {
  const key = detectKey(payload);
  if (quiet && key && key === lastDetectKey) return;
  const next = payload?.detected || null;
  if (quiet && detected?.handle && !next?.handle && payload?.tabUrl && lastDetectKey.includes(payload.tabUrl.split("?")[0])) {
    return;
  }
  lastDetectKey = key;
  detected = next;
  if (detected?.handle) {
    el.preview.textContent = `@${detected.handle}`;
    el.previewMeta.textContent = `instagram · ${detected.pageType || "perfil"}`;
  } else if (detected?.pageType === "reel" || detected?.pageType === "post") {
    el.preview.textContent = "Reel sem @";
    el.previewMeta.textContent = "Espere o autor carregar ou abra o perfil.";
  } else {
    el.preview.textContent = "Nenhum perfil";
    el.previewMeta.textContent = "Abra um perfil ou reel do Instagram.";
  }
  updateImportEnabled();
}

function renderFolders(list) {
  folders = Array.isArray(list) ? list : [];
  const current = el.folder.value || "";
  el.folder.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Sem pasta";
  el.folder.appendChild(none);
  for (const f of folders) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.profileCount != null ? `${f.name} (${f.profileCount})` : f.name;
    el.folder.appendChild(opt);
  }
  const neu = document.createElement("option");
  neu.value = "__new__";
  neu.textContent = "+ Criar pasta nova…";
  el.folder.appendChild(neu);
  el.folder.value = current === "__new__" || folders.some((f) => f.id === current) ? current : "";
  el.newFolderWrap.hidden = el.folder.value !== "__new__";
  if (el.folder.value !== "__new__") el.newFolderName.value = "";
  updateImportEnabled();
}

async function loadPinUi() {
  try {
    const st = await msg("pinStatus");
    const on = Boolean(st?.pinned);
    el.pinBtn.textContent = on ? "Fixado" : "Fixar";
    el.pinBtn.classList.toggle("is-on", on);
  } catch {
    /* ignore */
  }
}

async function liveDetect() {
  if (busy) return;
  try {
    const tabInfo = await msg("detectTab");
    if (tabInfo?.ok) renderDetected(tabInfo, true);
  } catch {
    /* ignore */
  }
}

async function refresh(full) {
  if (full) setFeedback("");
  try {
    if (full) {
      const health = await msg("health");
      setStatus(Boolean(health?.ok));
      const me = await msg("me");
      renderAccount(me?.logged ? me : null);
      if (health?.ok && me?.logged) {
        const folderRes = await msg("listFolders");
        renderFolders(folderRes?.ok ? folderRes.folders : []);
      } else {
        renderFolders([]);
      }
    }
    const tabInfo = await msg("detectTab");
    renderDetected(tabInfo?.ok ? tabInfo : null);
  } catch (err) {
    if (full) {
      setStatus(false);
      setFeedback(err instanceof Error ? err.message : "Falha na extensao.", "err");
      renderDetected(null);
      renderFolders([]);
    }
  } finally {
    updateImportEnabled();
    void loadPinUi();
  }
}

async function doLogin() {
  if (busy) return;
  const email = String(el.loginEmail.value || "").trim();
  const password = String(el.loginPassword.value || "");
  if (!email || !password) {
    setFeedback("Informe email e senha.", "err");
    return;
  }
  busy = true;
  updateImportEnabled();
  setFeedback("Entrando…");
  try {
    const data = await msg("login", { email, password });
    if (!data?.ok) throw new Error(data?.error || "Login falhou.");
    el.loginPassword.value = "";
    renderAccount({ name: data.name, email: data.email, role: data.role });
    setFeedback(`Conectado como ${data.name || data.email}.`, "ok");
    await refresh(true);
  } catch (err) {
    setFeedback(err instanceof Error ? err.message : "Login falhou.", "err");
  } finally {
    busy = false;
    updateImportEnabled();
  }
}

async function doLogout() {
  setFeedback("Saindo…");
  try {
    await msg("logout");
  } catch {
    /* limpeza local ja feita */
  }
  renderAccount(null);
  renderFolders([]);
  setFeedback("Desconectado. Token revogado no servidor.", "ok");
}

el.folder.addEventListener("change", () => {
  el.newFolderWrap.hidden = el.folder.value !== "__new__";
  if (el.folder.value !== "__new__") el.newFolderName.value = "";
  updateImportEnabled();
});
el.newFolderName.addEventListener("input", updateImportEnabled);
el.refreshBtn.addEventListener("click", () => void refresh(true));
el.loginBtn.addEventListener("click", () => void doLogin());
el.loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void doLogin();
});
el.logoutBtn.addEventListener("click", () => void doLogout());

el.pinBtn.addEventListener("click", async () => {
  try {
    const st = await msg("pinStatus");
    if (st?.pinned) {
      await msg("unpinPanel");
      await loadPinUi();
      setFeedback("Painel solto. O icone volta a abrir o popup.", "ok");
      return;
    }
    let windowId;
    try {
      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      windowId = win?.id;
    } catch {
      windowId = undefined;
    }
    const res = await msg("pinPanel", { windowId });
    if (!res?.ok) {
      setFeedback(res?.error || "Nao foi possivel fixar.", "err");
      return;
    }
    await loadPinUi();
    setFeedback("Fixado! Feche o popup e clique no icone — o painel fica ao lado.", "ok");
  } catch (err) {
    setFeedback(err instanceof Error ? err.message : "Erro ao fixar.", "err");
  }
});

el.importBtn.addEventListener("click", async () => {
  if (busy) return;
  if (!account) {
    setFeedback("Entre com sua conta para importar.", "err");
    el.loginEmail.focus();
    return;
  }
  if (el.folder.value === "__new__" && !el.newFolderName.value.trim()) {
    setFeedback("Digite o nome da pasta nova.", "err");
    el.newFolderName.focus();
    return;
  }
  busy = true;
  updateImportEnabled();
  setFeedback("Detectando perfil…");
  try {
    const tabInfo = await msg("detectTab");
    if (tabInfo?.ok) renderDetected(tabInfo);
    if (!detected?.handle) {
      setFeedback("Nao achei o @. Abra o perfil ou espere o reel carregar.", "err");
      return;
    }
    setFeedback(`Importando @${detected.handle}…`);
    const payload = { handle: detected.handle, platform: "instagram", text: detected.url || undefined };
    if (el.folder.value === "__new__") payload.newFolderName = el.newFolderName.value.trim();
    else if (el.folder.value) payload.folderId = el.folder.value;
    const result = await msg("import", payload);
    if (!result?.ok) {
      setFeedback(result?.error || "Falha ao importar.", "err");
      return;
    }
    setFeedback(result.message || "Importado.", "ok");
    if (result.folderId || payload.newFolderName) {
      const folderRes = await msg("listFolders");
      if (folderRes?.ok) {
        renderFolders(folderRes.folders);
        if (result.folderId) {
          el.folder.value = result.folderId;
          el.newFolderWrap.hidden = true;
        }
      }
    }
  } catch (err) {
    setFeedback(err instanceof Error ? err.message : "Erro.", "err");
  } finally {
    busy = false;
    updateImportEnabled();
  }
});

if (chrome.tabs?.onActivated) chrome.tabs.onActivated.addListener(() => void liveDetect());
if (chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.status === "complete" || info.url) void liveDetect();
  });
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void liveDetect();
});
window.addEventListener("focus", () => void liveDetect());

setInterval(() => void liveDetect(), 800);
void refresh(true);
