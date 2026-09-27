import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DailyPoint } from "../domain/model";

const DAY_MS = 86_400_000;
const MAX_SAMPLES = 90;
const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 32;
const VERTICAL_PADDING = 3;
const SAME_DAY_TOLERANCE_DAYS = 3;

export interface SparklineReadout {
  /** Series name announced to screen readers, e.g. "Arctic Sea Ice Extent". */
  label: string;
  formatValue: (value: number) => string;
  formatDate: (dateIso: string) => string;
  /** Label for the same-day-last-year comparison, e.g. "Last year". */
  previousYearLabel: string;
}

interface SparklineProps {
  points: DailyPoint[];
  days?: number;
  className?: string;
  strokeWidth?: number;
  ariaLabel?: string;
  /** Enables hover, touch-drag and keyboard scrubbing with a value readout. */
  readout?: SparklineReadout;
}

function pointTimestamp(point: DailyPoint): number {
  return Date.parse(`${point.date}T00:00:00Z`);
}

function sameDayPreviousYear(series: DailyPoint[], point: DailyPoint): DailyPoint | null {
  const target = new Date(`${point.date}T00:00:00Z`);
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  const targetMs = target.getTime();
  let best: DailyPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of series) {
    const distance = Math.abs(pointTimestamp(candidate) - targetMs);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best && bestDistance <= SAME_DAY_TOLERANCE_DAYS * DAY_MS ? best : null;
}

export function Sparkline({ points, days = 365, className, strokeWidth = 2, ariaLabel, readout }: SparklineProps) {
  const readoutId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);

  const chart = useMemo(() => {
    const finite = points.filter((point) => Number.isFinite(point.value) && Number.isFinite(pointTimestamp(point)));
    if (finite.length < 2) return null;

    const cutoff = pointTimestamp(finite[finite.length - 1]) - days * DAY_MS;
    let recent = finite.filter((point) => pointTimestamp(point) >= cutoff);
    if (recent.length < 2) recent = finite.slice(-12);

    const values = recent.map((point) => point.value);
    const min = Math.min(...values);
    const span = Math.max(...values) - min || 1;
    const drawableHeight = VIEWBOX_HEIGHT - VERTICAL_PADDING * 2;
    const xAt = (index: number) => (index / (recent.length - 1)) * VIEWBOX_WIDTH;
    const yAt = (value: number) => VIEWBOX_HEIGHT - VERTICAL_PADDING - ((value - min) / span) * drawableHeight;

    // Draw a thinned line, but keep every point for the readout so scrubbed values are exact.
    const step = Math.max(1, Math.floor(recent.length / MAX_SAMPLES));
    const coords = recent
      .map((point, index) => ({ point, index }))
      .filter(({ index }) => index % step === 0 || index === recent.length - 1)
      .map(({ point, index }) => `${xAt(index).toFixed(2)},${yAt(point.value).toFixed(2)}`)
      .join(" ");

    return { finite, recent, coords, xAt, yAt };
  }, [points, days]);

  if (!chart) return null;

  const { finite, recent, coords, xAt, yAt } = chart;
  const svg = (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      role={!readout && ariaLabel ? "img" : undefined}
      aria-label={!readout ? ariaLabel : undefined}
      aria-hidden={readout || !ariaLabel ? true : undefined}
      focusable={false}
      className={readout ? undefined : className}
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

  if (!readout) return svg;

  const lastIndex = recent.length - 1;
  const indexFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 1;
    return Math.round(Math.min(1, Math.max(0, fraction)) * lastIndex);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = activeIndex ?? lastIndex;
    const jump = Math.max(1, Math.round(recent.length / 12));
    const next =
      event.key === "ArrowLeft"
        ? current - (event.shiftKey ? jump : 1)
        : event.key === "ArrowRight"
          ? current + (event.shiftKey ? jump : 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : event.key === "Escape"
                ? null
                : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setActiveIndex(next === null ? null : Math.min(lastIndex, Math.max(0, next)));
  };

  const active = activeIndex == null ? null : recent[activeIndex];
  const previous = active ? sameDayPreviousYear(finite, active) : null;
  const xPercent = activeIndex == null ? 0 : xAt(activeIndex);
  const yPercent = active ? (yAt(active.value) / VIEWBOX_HEIGHT) * 100 : 0;
  const announcement = active && keyboardActive
    ? `${readout.formatDate(active.date)}: ${readout.formatValue(active.value)}${
        previous ? `. ${readout.previousYearLabel}: ${readout.formatValue(previous.value)}` : ""
      }`
    : "";

  return (
    <div
      className={`sparkline-scrub${className ? ` ${className}` : ""}${active ? " is-active" : ""}`}
      tabIndex={0}
      role="group"
      aria-label={readout.label}
      aria-describedby={readoutId}
      onPointerMove={(event) => {
        setKeyboardActive(false);
        setActiveIndex(indexFromPointer(event));
      }}
      onPointerDown={(event) => {
        setKeyboardActive(false);
        setActiveIndex(indexFromPointer(event));
      }}
      onPointerLeave={() => setActiveIndex(null)}
      onPointerCancel={() => setActiveIndex(null)}
      onKeyDown={(event) => {
        setKeyboardActive(true);
        handleKeyDown(event);
      }}
      onFocus={() => setActiveIndex((current) => current ?? lastIndex)}
      onBlur={() => {
        setKeyboardActive(false);
        setActiveIndex(null);
      }}
    >
      {svg}
      {active ? (
        <>
          <span className="sparkline-crosshair" style={{ left: `${xPercent}%` }} aria-hidden="true" />
          <span className="sparkline-dot" style={{ left: `${xPercent}%`, top: `${yPercent}%` }} aria-hidden="true" />
          <span
            className={`sparkline-readout${xPercent > 60 ? " is-left" : ""}`}
            style={{ left: `${xPercent}%` }}
            aria-hidden="true"
          >
            <span className="sparkline-readout-date">{readout.formatDate(active.date)}</span>
            <strong>{readout.formatValue(active.value)}</strong>
            {previous ? (
              <span className="sparkline-readout-previous">
                {readout.previousYearLabel}: {readout.formatValue(previous.value)}
              </span>
            ) : null}
          </span>
        </>
      ) : null}
      <span id={readoutId} className="visually-hidden" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
