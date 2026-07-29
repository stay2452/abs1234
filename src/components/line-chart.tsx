"use client";

import { useSyncExternalStore } from "react";
import { formatChartDateTime, formatNumber } from "@/lib/format";

type ChartPoint = {
  label: string;
  value: number | null;
};

function buildPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function ChartSvg({ points }: { points: ChartPoint[] }) {
  const valid = points
    .map((point) => ({ ...point, timestamp: new Date(point.label).getTime() }))
    .filter(
      (point): point is { label: string; value: number; timestamp: number } =>
        point.value !== null && Number.isFinite(point.timestamp),
    );

  if (valid.length < 2) {
    return (
      <div className="empty-state chart-empty">
        <p>Histórico insuficiente.</p>
      </div>
    );
  }

  const width = 760;
  const height = 240;
  const pad = { top: 28, right: 28, bottom: 36, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const min = Math.min(...valid.map((point) => point.value));
  const max = Math.max(...valid.map((point) => point.value));
  const range = max - min || 1;
  const firstTimestamp = Math.min(...valid.map((point) => point.timestamp));
  const lastTimestamp = Math.max(...valid.map((point) => point.timestamp));
  const timeRange = lastTimestamp - firstTimestamp || 1;

  const coords = valid.map((point) => ({
    x: pad.left + ((point.timestamp - firstTimestamp) / timeRange) * plotW,
    y: pad.top + (1 - (point.value - min) / range) * plotH,
    point,
  }));

  const linePath = buildPath(coords);
  const baselineY = pad.top + plotH;
  const areaPath = `${linePath} L ${coords.at(-1)?.x ?? pad.left} ${baselineY} L ${
    coords[0]?.x ?? pad.left
  } ${baselineY} Z`;

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Histórico de seguidores"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(45, 212, 191, 0.28)" />
            <stop offset="100%" stopColor="rgba(45, 212, 191, 0.02)" />
          </linearGradient>
        </defs>

        <line
          className="chart-grid"
          x1={pad.left}
          y1={pad.top}
          x2={width - pad.right}
          y2={pad.top}
        />
        <line
          className="chart-grid"
          x1={pad.left}
          y1={baselineY}
          x2={width - pad.right}
          y2={baselineY}
        />

        <path className="chart-area" d={areaPath} fill="url(#chart-fill)" />
        <path className="chart-line" d={linePath} />

        {coords.map((coord) => (
          <g key={`${coord.point.label}-${coord.point.value}`}>
            <circle className="chart-dot" cx={coord.x} cy={coord.y} r="4">
              <title>
                {formatChartDateTime(coord.point.label)} · {formatNumber(coord.point.value)}
              </title>
            </circle>
          </g>
        ))}

        <text className="chart-label" x={pad.left - 10} y={pad.top + 4} textAnchor="end">
          {formatNumber(max)}
        </text>
        <text className="chart-label" x={pad.left - 10} y={baselineY + 4} textAnchor="end">
          {formatNumber(min)}
        </text>

        <text className="chart-label" x={pad.left} y={height - 10} textAnchor="start">
          {formatChartDateTime(valid[0]?.label)}
        </text>
        <text className="chart-label" x={width - pad.right} y={height - 10} textAnchor="end">
          {formatChartDateTime(valid.at(-1)?.label)}
        </text>
      </svg>
    </div>
  );
}

/**
 * Renderiza o SVG so apos o mount no cliente.
 * Elimina hydration mismatch residual (extensoes / ICU / SSR).
 */
function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function LineChart({ points }: { points: ChartPoint[] }) {
  const ready = useIsClient();

  if (!ready) {
    return (
      <div className="chart-wrap chart-placeholder" aria-hidden>
        <div className="chart chart-skeleton" />
      </div>
    );
  }

  return <ChartSvg points={points} />;
}
