import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { POSTS_PER_PROFILE } from "@/lib/constants";
import { runScrape } from "@/lib/scrapers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  profileIds: z.array(z.string().min(1)).max(100).optional(),
});

const globalForScrape = globalThis as unknown as {
  activeScrape?: Promise<unknown>;
};

export async function POST(request: NextRequest) {
  if (globalForScrape.activeScrape) {
    return NextResponse.json({ error: "Já existe uma atualização em andamento." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = runSchema.safeParse(body);
  const limit = parsedBody.success ? parsedBody.data.limit ?? POSTS_PER_PROFILE : POSTS_PER_PROFILE;
  const profileIds = parsedBody.success ? parsedBody.data.profileIds : undefined;

  try {
    const promise = runScrape(limit, profileIds);
    globalForScrape.activeScrape = promise;
    const result = await promise;
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    globalForScrape.activeScrape = undefined;
  }
}
