/**
 * Cliente HTTP do app local ou publicado (usado no service worker).
 */
const DEFAULT_BASE = "http://127.0.0.1:3000";

async function getBaseUrl() {
  try {
    const stored = await chrome.storage.sync.get(["baseUrl"]);
    return (stored.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE;
  }
}

/** Token opcional (API_ACCESS_TOKEN no app). Enviado como Bearer se configurado. */
async function authHeaders() {
  try {
    const stored = await chrome.storage.sync.get(["apiToken"]);
    const token = (stored.apiToken || "").trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function health() {
  const base = await getBaseUrl();
  try {
    const res = await fetch(`${base}/api/health`, { method: "GET" });
    if (!res.ok) {
      return { ok: false, base, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: Boolean(data.ok), base, ...data };
  } catch (err) {
    return {
      ok: false,
      base,
      error: err instanceof Error ? err.message : "App offline",
    };
  }
}

/**
 * @param {{ text: string, defaultPlatform?: string }} payload
 */
async function importProfiles(payload) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/profiles/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Import falhou (${res.status})`);
  }
  return data;
}

/**
 * @param {string} profileId
 * @param {{ force?: boolean }} [opts]
 */
async function scrapeProfile(profileId, opts = {}) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/scrape/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      scope: "profiles",
      profileIds: [profileId],
      stream: false,
      force: Boolean(opts.force),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Coleta falhou (${res.status})`);
  }
  return data;
}

async function listFolders() {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/folders`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Pastas falhou (${res.status})`);
  }
  return data.folders || [];
}

/**
 * @param {{ name: string, color?: string }} payload
 */
async function createFolder(payload) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Criar pasta falhou (${res.status})`);
  }
  return data;
}

/**
 * Coloca perfil numa pasta (sem remover de outras).
 * @param {string} folderId
 * @param {string} profileId
 */
async function addProfileToFolder(folderId, profileId) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/folders/${encodeURIComponent(folderId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId, present: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Pasta falhou (${res.status})`);
  }
  return data;
}

self.BdpApi = {
  getBaseUrl,
  health,
  importProfiles,
  scrapeProfile,
  listFolders,
  createFolder,
  addProfileToFolder,
  DEFAULT_BASE,
};
