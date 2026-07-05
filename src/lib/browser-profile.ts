import fs from "node:fs/promises";
import path from "node:path";

type Preferences = {
  default_search_provider?: Record<string, unknown>;
  [key: string]: unknown;
};

const GOOGLE_SEARCH_PROVIDER = {
  enabled: true,
  name: "Google",
  keyword: "google.com",
  search_url: "https://www.google.com/search?q={searchTerms}",
  suggest_url: "https://www.google.com/complete/search?client=chrome&q={searchTerms}",
  favicon_url: "https://www.google.com/favicon.ico",
  encoding: "UTF-8",
};

async function readJsonFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as Preferences;
  } catch {
    return {};
  }
}

export async function ensureDefaultSearchProvider(userDataDir: string) {
  const defaultProfileDir = path.join(userDataDir, "Default");
  const preferencesPath = path.join(defaultProfileDir, "Preferences");
  await fs.mkdir(defaultProfileDir, { recursive: true });

  const preferences = await readJsonFile(preferencesPath);
  preferences.default_search_provider = {
    ...(typeof preferences.default_search_provider === "object"
      ? preferences.default_search_provider
      : {}),
    ...GOOGLE_SEARCH_PROVIDER,
  };

  await fs.writeFile(preferencesPath, JSON.stringify(preferences, null, 2), "utf8");
}
