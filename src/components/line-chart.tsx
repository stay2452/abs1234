import { formatNumber, formatShortDate } from "@/lib/format";

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

export function LineChart({ points }: { points: ChartPoint[] }) {
  const valid = points.filter((point): point is { label: string; value: number } => point.value !== null);

  if (valid.length < 2) {
    return (
      <div className="empty-state">
        <p>Histórico insuficiente.</p>
      </div>
    );
  }

  const width = 760;
  const height = 220;
  const padding = 22;
  const min = Math.min(...valid.map((point) => point.value));
  const max = Math.max(...valid.map((point) => point.value));
  const range = max - min || 1;
  const coords = valid.map((point, index) => ({
    x: padding + (index / Math.max(valid.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((point.value - min) / range) * (height - padding * 2),
    point,
  }));
  const linePath = buildPath(coords);
  const areaPath = `${linePath} L ${coords.at(-1)?.x ?? padding} ${height - padding} L ${
    coords[0]?.x ?? padding
  } ${height - padding} Z`;

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Histórico">
      <path className="chart-area" d={areaPath} />
      <path className="chart-line" d={linePath} />
      {coords.map((coord) => (
        <g key={`${coord.x}-${coord.point.label}`}>
          <circle cx={coord.x} cy={coord.y} r="4" fill="var(--teal)" />
        </g>
      ))}
      <text x={padding} y={height - 4} fill="var(--muted)" fontSize="12">
        {formatShortDate(valid[0]?.label)}
      </text>
      <text x={width - padding} y={height - 4} fill="var(--muted)" fontSize="12" textAnchor="end">
        {formatShortDate(valid.at(-1)?.label)}
      </text>
      <text x={padding} y="14" fill="var(--muted)" fontSize="12">
        {formatNumber(max)}
      </text>
      <text x={padding} y={height - padding - 6} fill="var(--muted)" fontSize="12">
        {formatNumber(min)}
      </text>
    </svg>
  );
}
