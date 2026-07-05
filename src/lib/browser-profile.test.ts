import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDefaultSearchProvider } from "@/lib/browser-profile";

describe("ensureDefaultSearchProvider", () => {
  it("writes Google as the default omnibox search provider", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-profile-"));

    try {
      await ensureDefaultSearchProvider(dir);
      const preferences = JSON.parse(
        await fs.readFile(path.join(dir, "Default", "Preferences"), "utf8"),
      ) as { default_search_provider: Record<string, unknown> };

      expect(preferences.default_search_provider.enabled).toBe(true);
      expect(preferences.default_search_provider.search_url).toBe(
        "https://www.google.com/search?q={searchTerms}",
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
