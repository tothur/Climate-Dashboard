import type { EChartsOption } from "echarts";
import type { EnergyHistoryPoint } from "../data/energy-source";
import { domainColor, type ChartDomain } from "../theme/domainColors";
import { trendContextPalette } from "./trendContext";

/**
 * Hungarian domestic generation by source over the last 24 hours, as stacked
 * areas (MW). Each source takes one of the dashboard's domain colours (the
 * --domain-* tokens shared by every chart), and "other" the neutral context
 * grey, so the chart reads as part of the same system. MAVIR's small "other"
 * and "not itemised" plant categories share one band.
 */

export type EnergyMixSeriesKey = "nuclear" | "fossil" | "renewable" | "solar" | "other";

// Neutral context grey of the daily charts' past years (charts/dailyContext.ts).
const CONTEXT_GREY = { light: "#9c9a92", dark: "#7d8784" };

export const ENERGY_MIX_SERIES: Array<{
  key: EnergyMixSeriesKey;
  value: (point: EnergyHistoryPoint) => number;
  domain: ChartDomain | null;
}> = [
  { key: "nuclear", value: (point) => point.nuclearMW, domain: "ocean" },
  { key: "fossil", value: (point) => point.fossilMW, domain: "temperature" },
  { key: "renewable", value: (point) => point.renewableMW, domain: "ice" },
  { key: "solar", value: (point) => point.solarMW, domain: "forcing" },
  { key: "other", value: (point) => point.otherMW + point.unallocatedMW, domain: null },
];

export function energyMixColor(key: EnergyMixSeriesKey, dark: boolean): string {
  const series = ENERGY_MIX_SERIES.find((entry) => entry.key === key);
  if (!series?.domain) return dark ? CONTEXT_GREY.dark : CONTEXT_GREY.light;
  return domainColor(series.domain, dark);
}

export interface EnergyMixOptionArgs {
  history: EnergyHistoryPoint[];
  labels: Record<EnergyMixSeriesKey, string> & { total: string };
  compact: boolean;
  dark: boolean;
  formatNumber: (value: number) => string;
  formatTime: (time: number) => string;
  formatTooltipTime: (time: number) => string;
}

// Plot height the end labels are spaced for (the 420 px chart minus its grid margins).
const PLOT_HEIGHT_PX = 360;
const LABEL_GAP_PX = 16;

function niceMax(value: number): number {
  const step = value > 4000 ? 1000 : value > 1500 ? 500 : 250;
  return Math.max(step, Math.ceil(value / step) * step);
}

/**
 * Vertical positions for labels that should sit at `targets` but stay at
 * least `gap` apart, kept inside [0, max]. Labels keep their order.
 */
function spreadLabels(targets: number[], gap: number, max: number): number[] {
  const order = targets.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const placed = order.map((entry) => entry.value);
  for (let i = 1; i < placed.length; i += 1) placed[i] = Math.max(placed[i], placed[i - 1] + gap);
  const overflow = placed[placed.length - 1] - (max - gap / 2);
  if (overflow > 0) for (let i = 0; i < placed.length; i += 1) placed[i] -= overflow;
  for (let i = placed.length - 2; i >= 0; i -= 1) placed[i] = Math.min(placed[i], placed[i + 1] - gap);
  const result = new Array<number>(targets.length);
  order.forEach((entry, i) => {
    result[entry.index] = placed[i];
  });
  return result;
}

function tooltipBase(palette: ReturnType<typeof trendContextPalette>) {
  return {
    trigger: "axis" as const,
    confine: true,
    axisPointer: { type: "line" as const, lineStyle: { color: palette.zero, width: 1 } },
    backgroundColor: palette.tooltipBg,
    borderColor: palette.tooltipBorder,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: palette.tooltipText, fontSize: 12, lineHeight: 18 },
    extraCssText: "box-shadow: 0 10px 24px rgba(2, 6, 23, 0.16); border-radius: 8px;",
  };
}

function timeAxis(palette: ReturnType<typeof trendContextPalette>, min: number | undefined, max: number | undefined, formatTime: (time: number) => string) {
  return {
    type: "time" as const,
    min,
    max,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    minInterval: 3 * 3_600_000,
    axisLabel: { color: palette.axisLabel, fontSize: 11, hideOverlap: true, formatter: (value: number) => formatTime(value) },
  };
}

function valueAxis(palette: ReturnType<typeof trendContextPalette>, max: number, formatNumber: (value: number) => string) {
  return {
    type: "value" as const,
    min: 0,
    max,
    name: "MW",
    nameLocation: "end" as const,
    nameGap: 10,
    nameTextStyle: { color: palette.axisLabel, fontSize: 11, align: "right" as const, padding: [0, 6, 0, 0] },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: (value: number) => formatNumber(value) },
    splitLine: { lineStyle: { color: palette.grid, width: 1 } },
  };
}

/**
 * Stacked bands drawn like the dashboard's other charts: each source a
 * coloured edge line over a light tint of the same colour, with its latest
 * value labelled directly at the right end (labels spaced so thin bands
 * never collide). On narrow screens the legend above the chart does that job.
 */
export function buildEnergyMixOption({
  history,
  labels,
  compact,
  dark,
  formatNumber,
  formatTime,
  formatTooltipTime,
}: EnergyMixOptionArgs): EChartsOption {
  const palette = trendContextPalette(dark);
  const points = history
    .map((point) => ({ time: Date.parse(point.time), point }))
    .filter(({ time }) => Number.isFinite(time))
    .sort((a, b) => a.time - b.time);
  const muted = (text: string) => `<span style="color:${palette.tooltipMuted};font-weight:400">${text}</span>`;
  const swatch = (color: string) =>
    `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${color}"></span>`;
  const totals = points.map(({ point }) => ENERGY_MIX_SERIES.reduce((sum, series) => sum + series.value(point), 0));
  const yMax = niceMax(Math.max(...totals, 1) * 1.04);

  // Direct labels at the middle of each band at the latest time.
  const last = points[points.length - 1];
  let below = 0;
  const middles = ENERGY_MIX_SERIES.map((series) => {
    const value = last ? series.value(last.point) : 0;
    const middle = below + value / 2;
    below += value;
    return middle;
  });
  const labelY = spreadLabels(middles, (yMax * LABEL_GAP_PX) / PLOT_HEIGHT_PX, yMax);

  return {
    animation: false,
    aria: { enabled: true },
    grid: { left: compact ? 50 : 58, right: compact ? 16 : 132, top: 28, bottom: 32 },
    tooltip: {
      ...tooltipBase(palette),
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? (params as Array<{ dataIndex?: number; seriesId?: string }>) : [];
        const index = rows.find((row) => row.seriesId !== "labels")?.dataIndex;
        if (index == null || !points[index]) return "";
        const { time, point } = points[index];
        // Top of the stack first, matching the order on the chart.
        const lines = [...ENERGY_MIX_SERIES]
          .reverse()
          .map((series) => `${swatch(energyMixColor(series.key, dark))}${labels[series.key]}: <b>${formatNumber(series.value(point))} MW</b>`);
        return `<b>${formatTooltipTime(time)}</b><br/>${lines.join("<br/>")}<br/>${muted(`${labels.total}: ${formatNumber(totals[index])} MW`)}`;
      },
    },
    xAxis: timeAxis(palette, points[0]?.time, last?.time, formatTime),
    yAxis: valueAxis(palette, yMax, formatNumber),
    series: [
      ...ENERGY_MIX_SERIES.map((series) => {
        const color = energyMixColor(series.key, dark);
        return {
          id: series.key,
          name: labels[series.key],
          type: "line" as const,
          stack: "generation",
          data: points.map(({ time, point }) => [time, series.value(point)]),
          showSymbol: false,
          color,
          lineStyle: { color, width: 1.6 },
          areaStyle: { color, opacity: dark ? 0.26 : 0.22 },
          emphasis: { disabled: true },
        };
      }),
      ...(!compact && last
        ? [
            {
              id: "labels",
              type: "line" as const,
              data: [] as Array<[number, number]>,
              silent: true,
              tooltip: { show: false },
              markPoint: {
                silent: true,
                symbol: "circle",
                symbolSize: 0,
                data: ENERGY_MIX_SERIES.map((series, index) => ({
                  name: series.key,
                  coord: [last.time, labelY[index]],
                  label: {
                    show: true,
                    position: "right" as const,
                    distance: 10,
                    formatter: `{dot|●} {name|${labels[series.key]}} {value|${formatNumber(series.value(last.point))}}`,
                    rich: {
                      dot: { color: energyMixColor(series.key, dark), fontSize: 10 },
                      name: { color: palette.tooltipMuted, fontSize: 11 },
                      value: { color: palette.tooltipText, fontSize: 11, fontWeight: 600 },
                    },
                  },
                })),
              },
            },
          ]
        : []),
    ],
  };
}

export interface PaksOutputOptionArgs {
  /** [time ms, MW] of MAVIR's nuclear category: Paks is Hungary's only nuclear plant. */
  points: Array<[number, number]>;
  capacityMW: number;
  labels: { output: string; capacity: string };
  compact: boolean;
  dark: boolean;
  formatNumber: (value: number) => string;
  formatTime: (time: number) => string;
  formatTooltipTime: (time: number) => string;
}

/**
 * Paks output over 24 hours in the dashboard's single-series style: the
 * signal line over a light tint, a hollow ring and label on the latest value,
 * and the installed capacity as a dashed reference line.
 */
export function buildPaksOutputOption({
  points,
  capacityMW,
  labels,
  compact,
  dark,
  formatNumber,
  formatTime,
  formatTooltipTime,
}: PaksOutputOptionArgs): EChartsOption {
  const palette = trendContextPalette(dark, "ocean");
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const last = sorted[sorted.length - 1];
  const yMax = niceMax(Math.max(capacityMW, ...sorted.map(([, value]) => value)) * 1.08);
  const swatch = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${palette.signal}"></span>`;
  const muted = (text: string) => `<span style="color:${palette.tooltipMuted};font-weight:400">${text}</span>`;

  return {
    animation: false,
    aria: { enabled: true },
    grid: { left: compact ? 50 : 58, right: compact ? 52 : 70, top: 28, bottom: 32 },
    tooltip: {
      ...tooltipBase(palette),
      formatter: (params: unknown) => {
        const row = (Array.isArray(params) ? params : [])[0] as { value?: [number, number] } | undefined;
        if (!row?.value) return "";
        const [time, value] = row.value;
        return (
          `<b>${formatTooltipTime(time)}</b><br/>${swatch}<b>${formatNumber(value)} MW</b>` +
          `<br/>${muted(`${labels.capacity}: ${formatNumber(capacityMW)} MW`)}`
        );
      },
    },
    xAxis: timeAxis(palette, sorted[0]?.[0], last?.[0], formatTime),
    yAxis: valueAxis(palette, yMax, formatNumber),
    series: [
      {
        id: "signal",
        name: labels.output,
        type: "line",
        data: sorted,
        showSymbol: false,
        z: 3,
        lineStyle: { color: palette.signal, width: 2 },
        areaStyle: { color: palette.signalArea },
        emphasis: { disabled: true },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: palette.trend, type: "dashed", width: 1.2 },
          label: {
            show: !compact,
            position: "insideStartTop",
            formatter: `${labels.capacity} · ${formatNumber(capacityMW)} MW`,
            color: palette.axisLabel,
            fontSize: 11,
          },
          data: [{ yAxis: capacityMW }],
        },
        markPoint: last
          ? {
              silent: true,
              symbol: "circle",
              symbolSize: 8,
              itemStyle: { color: palette.surface, borderColor: palette.signal, borderWidth: 2 },
              label: {
                show: true,
                position: "right",
                distance: 6,
                formatter: () => formatNumber(last[1]),
                color: palette.tooltipText,
                fontSize: 12,
                fontWeight: 600,
              },
              data: [{ name: "latest", coord: last }],
            }
          : undefined,
      },
    ],
  };
}
