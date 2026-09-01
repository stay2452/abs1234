import { NextRequest, NextResponse } from "next/server";
import { optionsCors, withCors } from "@/lib/extension-cors";
import { prisma } from "@/lib/db";
import { runScrape } from "@/lib/scrapers";
import { parseScrapeRunRequest } from "@/lib/scrapers/scope";
import { hasActiveRunningRun, reconcileZombieRuns } from "@/lib/scrape-reconcile";
import { isAuthorizedByToken } from "@/lib/access-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForScrape = globalThis as unknown as {
  activeScrape?: Promise<unknown>;
};

export async function OPTIONS(request: NextRequest) {
  return optionsCors(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isAuthorizedByToken(request)) {
    return withCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), origin);
  }

  // Reconcilia zumbis antes de checar lock — evita 409 falso por run travado
  try {
    await reconcileZombieRuns();
  } catch {
    // não bloqueia request se reconciliação falhar
  }

  // Lock persistente no DB (source of truth) + lock em memória (fast path)
  if (globalForScrape.activeScrape) {
    return withCors(
      NextResponse.json({ error: "Ja existe uma atualizacao em andamento (memória)." }, { status: 409 }),
      origin,
    );
  }
  try {
    const { hasActive, activeRunId } = await hasActiveRunningRun();
    if (hasActive) {
      return withCors(
        NextResponse.json(
          { error: "Ja existe uma atualizacao em andamento.", runId: activeRunId },
          { status: 409 },
        ),
        origin,
      );
    }
  } catch {
    // se check no DB falhar, segue com lock em memória apenas
  }

  const body = await request.json().catch(() => null);
  const parsedBody = parseScrapeRunRequest(body);

  if (!parsedBody) {
    return withCors(
      NextResponse.json(
        {
          error: "Escopo de coleta invalido. Informe scope: all ou uma lista de perfis valida.",
        },
        { status: 400 },
      ),
      origin,
    );
  }

  if (parsedBody.force) {
    const confirm = request.headers.get("x-confirm-force");
    if (confirm !== "1") {
      return withCors(
        NextResponse.json(
          { error: "force:true exige header X-Confirm-Force: 1 (proteção contra re-coleta que queima crédito)." },
          { status: 400 },
        ),
        origin,
      );
    }
  }

  if (!parsedBody.stream) {
    try {
      const promise = runScrape(parsedBody.scope, { force: parsedBody.force, signal: request.signal });
      globalForScrape.activeScrape = promise;
      const result = await promise;
      return withCors(NextResponse.json(result), origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return withCors(NextResponse.json({ error: message }, { status: 500 }), origin);
    } finally {
      globalForScrape.activeScrape = undefined;
    }
  }

  try {
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const writeEvent = (event: unknown) =>
      writer.write(encoder.encode(`${JSON.stringify(event)}\n`));

    const promise = (async () => {
      const safeWrite = async (event: unknown) => {
        try {
          await writeEvent(event);
        } catch {
          // stream fechado/cancelado — request.signal aborta o run (workers param de agendar).
        }
      };
      try {
        await safeWrite({ type: "status", message: "Coleta iniciada. Preparando os perfis..." });
        const result = await runScrape(parsedBody.scope, {
          force: parsedBody.force,
          signal: request.signal,
          onRunCreated: (runId) => {
            void safeWrite({ type: "run", runId });
          },
          onProgress: (event) => {
            void safeWrite({ type: "progress", event });
          },
        });
        await safeWrite({ type: "complete", result });
      } catch (error) {
        await safeWrite({
          type: "error",
          error: error instanceof Error ? error.message : "Falha ao atualizar.",
        });
      } finally {
        try {
          await writer.close();
        } catch {
          /* stream ja fechado */
        }
      }
    })();

    globalForScrape.activeScrape = promise;
    void promise.finally(() => {
      globalForScrape.activeScrape = undefined;
    });

    const headers = new Headers({
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    });
    const cors = optionsCors(origin);
    cors.headers.forEach((value, key) => {
      headers.set(key, value);
    });

    return new Response(readable, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return withCors(NextResponse.json({ error: message }, { status: 500 }), origin);
  }
}
