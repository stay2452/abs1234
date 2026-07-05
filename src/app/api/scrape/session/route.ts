import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLATFORMS } from "@/lib/constants";
import {
  createBrowserSession,
  deleteBrowserSession,
  listBrowserSessions,
  openLoginBrowser,
  testBrowserSession,
  updateBrowserSession,
} from "@/lib/scrapers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    platform: z.enum(PLATFORMS),
    name: z.string().min(1).max(80),
    proxyUrl: z.string().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("open"),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal("test"),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().min(1),
    name: z.string().min(1).max(80).optional(),
    proxyUrl: z.string().max(300).nullable().optional(),
    status: z.enum(["active", "paused"]).optional(),
  }),
]);

export async function GET() {
  return NextResponse.json({ sessions: await listBrowserSessions() });
}

export async function POST(request: NextRequest) {
  const parsedBody = sessionSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Dados de sessao invalidos." }, { status: 400 });
  }

  if (parsedBody.data.action === "create") {
    return NextResponse.json(await createBrowserSession(parsedBody.data));
  }

  if (parsedBody.data.action === "open") {
    return NextResponse.json(await openLoginBrowser(parsedBody.data.id));
  }

  if (parsedBody.data.action === "test") {
    return NextResponse.json(await testBrowserSession(parsedBody.data.id));
  }

  if (parsedBody.data.action === "delete") {
    return NextResponse.json(await deleteBrowserSession(parsedBody.data.id));
  }

  return NextResponse.json(await updateBrowserSession(parsedBody.data));
}
