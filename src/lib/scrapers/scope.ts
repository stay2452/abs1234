import { z } from "zod";
import { MAX_SCRAPE_PROFILE_IDS } from "@/lib/constants";
import type { ScrapeScope } from "@/lib/scrapers";

const runSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("all"),
    force: z.boolean().optional(),
    stream: z.boolean().optional(),
  }),
  z.object({
    scope: z.literal("profiles"),
    profileIds: z.array(z.string().min(1)).min(1).max(MAX_SCRAPE_PROFILE_IDS),
    force: z.boolean().optional(),
    stream: z.boolean().optional(),
  }),
]);

export type ScrapeRunRequest = {
  scope: ScrapeScope;
  force: boolean;
  stream: boolean;
};

export function parseScrapeRunRequest(input: unknown): ScrapeRunRequest | null {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  return {
    scope:
      parsed.data.scope === "all"
        ? { kind: "all" }
        : { kind: "profiles", profileIds: [...new Set(parsed.data.profileIds)] },
    force: Boolean(parsed.data.force),
    stream: Boolean(parsed.data.stream),
  };
}
