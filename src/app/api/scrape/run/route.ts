import { NextRequest, NextResponse } from "next/server";
import { optionsCors, withCors } from "@/lib/extension-cors";
import { runScrape } from "@/lib/scrapers";
import { parseScrapeRunRequest } from "@/lib/scrapers/scope";

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

  if (globalForScrape.activeScrape) {
    return withCors(
      NextResponse.json({ error: "Ja existe uma atualizacao em andamento." }, { status: 409 }),
      origin,
    );
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

  if (!parsedBody.stream) {
    try {
      const promise = runScrape(parsedBody.scope, { force: parsedBody.force });
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
          // cliente fechou a aba/stream — coleta segue no servidor
        }
      };
      try {
        await safeWrite({ type: "status", message: "Coleta iniciada. Preparando os perfis..." });
        const result = await runScrape(parsedBody.scope, {
          force: parsedBody.force,
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
