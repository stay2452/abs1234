/* Eye of Zuck v2 — cliente HTTP travado na prod Railway (URL nao configuravel). */
const BASE_URL = "https://abs1234-production.up.railway.app";

async function authHeaders() {
  try {
    const stored = await chrome.storage.sync.get(["apiToken"]);
    const token = String(stored.apiToken || "").trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function loginExtension(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/extension-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || `Login falhou (${res.status})`);
  await chrome.storage.sync.set({ apiToken: data.token });
  await chrome.storage.sync.set({
    account: { name: data.name || "", email: data.email || "", role: data.role || "user" },
  });
  return data;
}

async function logoutExtension() {
  try {
    const stored = await chrome.storage.sync.get(["apiToken"]);
    const token = String(stored.apiToken || "").trim();
    if (token) {
      await fetch(`${BASE_URL}/api/auth/extension-token`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    /* segue para limpeza local */
  }
  await chrome.storage.sync.remove(["apiToken", "account"]);
}

async function me() {
  const headers = await authHeaders();
  if (!headers.Authorization) throw new Error("Nao logado.");
  const res = await fetch(`${BASE_URL}/api/auth/extension-token`, {
    method: "GET",
    headers,
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || `Sessao invalida (${res.status})`);
  await chrome.storage.sync.set({
    account: { name: data.name || "", email: data.email || "", role: data.role || "user" },
  });
  return data;
}

async function health() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { method: "GET" });
    if (!res.ok) return { ok: false, base: BASE_URL, error: `HTTP ${res.status}` };
    const data = await parseJson(res);
    return { ok: Boolean(data.ok), base: BASE_URL, ...data };
  } catch (err) {
    return { ok: false, base: BASE_URL, error: err instanceof Error ? err.message : "App offline" };
  }
}

async function importProfiles(payload) {
  const res = await fetch(`${BASE_URL}/api/profiles/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ defaultPlatform: "instagram", ...payload }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || `Import falhou (${res.status})`);
  return data;
}

async function listFolders() {
  const res = await fetch(`${BASE_URL}/api/folders`, {
    method: "GET",
    headers: { ...(await authHeaders()) },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || `Pastas falhou (${res.status})`);
  return data.folders || [];
}

async function createFolder(payload) {
  const res = await fetch(`${BASE_URL}/api/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || `Criar pasta falhou (${res.status})`);
  return data;
}

async function addProfileToFolder(folderId, profileId) {
  const res = await fetch(`${BASE_URL}/api/folders/${encodeURIComponent(folderId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ profileId, present: true }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || `Pasta falhou (${res.status})`);
  return data;
}

self.EozApi = {
  BASE_URL,
  authHeaders,
  loginExtension,
  logoutExtension,
  me,
  health,
  importProfiles,
  listFolders,
  createFolder,
  addProfileToFolder,
};
