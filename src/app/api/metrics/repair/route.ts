import { NextRequest, NextResponse } from "next/server";
import { optionsCors, withCors } from "@/lib/extension-cors";
import {
  REPAIRABLE_POST_METRICS,
  repairMissingPostMetrics,
  type RepairablePostMetric,
} from "@/lib/missing-metrics-repair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForRepair = globalThis as unknown as { activeMetricsRepair?: Promise<unknown> };

function parseMetrics(value: unknown): RepairablePostMetric[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > REPAIRABLE_POST_METRICS.length) {
    return null;
  }
  const metrics = [...new Set(value)];
  return metrics.every((metric): metric is RepairablePostMetric =>
    typeof metric === "string" && REPAIRABLE_POST_METRICS.includes(metric as RepairablePostMetric),
  )
    ? metrics
    : null;
}

export async function OPTIONS(request: NextRequest) {
  return optionsCors(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (globalForRepair.activeMetricsRepair) {
    return withCors(
      NextResponse.json({ error: "Ja existe uma reparacao de metricas em andamento." }, { status: 409 }),
      origin,
    );
  }

  const body = await request.json().catch(() => null);
  const metrics = parseMetrics(body?.metrics);
  if (!metrics) {
    return withCors(
      NextResponse.json({ error: "Selecione uma ou mais metricas validas para reparar." }, { status: 400 }),
      origin,
    );
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const send = async (event: unknown) => {
    try {
      await writer.write(encoder.encode(`${JSON.stringify(event)}\n`));
    } catch {
      // O cliente pode fechar a aba; a reparacao continua no servidor.
    }
  };

  const promise = (async () => {
    try {
      await send({ type: "status", message: "Analisando videos com metricas ausentes..." });
      const result = await repairMissingPostMetrics(metrics, async (progress) => {
        if (progress.type === "started") {
          await send({
            type: "status",
            message: `Encontrados ${progress.profilesTotal} perfil(is) com videos irregulares.`,
          });
          return;
        }
        await send({ type: "progress", progress });
      });
      await send({ type: "complete", result });
    } catch (error) {
      await send({
        type: "error",
        error: error instanceof Error ? error.message : "Falha ao reparar metricas.",
      });
    } finally {
      try {
        await writer.close();
      } catch {
        // stream ja encerrado
      }
    }
  })();

  globalForRepair.activeMetricsRepair = promise;
  void promise.finally(() => {
    globalForRepair.activeMetricsRepair = undefined;
  });

  const headers = new Headers({
    "Cache-Control": "no-cache, no-transform",
    "Content-Type": "application/x-ndjson; charset=utf-8",
  });
  const cors = optionsCors(origin);
  cors.headers.forEach((value, key) => headers.set(key, value));
  return new Response(readable, { headers });
}
