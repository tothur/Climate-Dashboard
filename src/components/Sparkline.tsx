import type { DailyPoint } from "../domain/model";

const DAY_MS = 86_400_000;
const MAX_SAMPLES = 90;
const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 32;
const VERTICAL_PADDING = 3;

interface SparklineProps {
  points: DailyPoint[];
  days?: number;
  className?: string;
  strokeWidth?: number;
  ariaLabel?: string;
}

function pointTimestamp(point: DailyPoint): number {
  return Date.parse(`${point.date}T00:00:00Z`);
}

export function Sparkline({ points, days = 365, className, strokeWidth = 2, ariaLabel }: SparklineProps) {
  const finite = points.filter((point) => Number.isFinite(point.value) && Number.isFinite(pointTimestamp(point)));
  if (finite.length < 2) return null;

  const cutoff = pointTimestamp(finite[finite.length - 1]) - days * DAY_MS;
  let recent = finite.filter((point) => pointTimestamp(point) >= cutoff);
  if (recent.length < 2) recent = finite.slice(-12);

  const step = Math.max(1, Math.floor(recent.length / MAX_SAMPLES));
  const sampled = recent.filter((_, index) => index % step === 0 || index === recent.length - 1);
  const values = sampled.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const drawableHeight = VIEWBOX_HEIGHT - VERTICAL_PADDING * 2;
  const coords = sampled
    .map((point, index) => {
      const x = (index / (sampled.length - 1)) * VIEWBOX_WIDTH;
      const y = VIEWBOX_HEIGHT - VERTICAL_PADDING - ((point.value - min) / span) * drawableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className={className}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable={false}
    >
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
