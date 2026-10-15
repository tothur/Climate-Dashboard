import type { EChartsOption } from "echarts";
import type { DailyPoint } from "../domain/model";
import { trendContextPalette } from "./trendContext";

/**
 * Warming pathways to 2100 in the trend-chart language: the observed annual
 * record (faint values under a bold 10-year mean, the latest year ringed),
 * then each pathway's central estimate with a direct end label and a marker
 * where it crosses 2 °C. The Paris 1.5–2 °C range is a soft band and the
 * projected future a faint tint, so the measured past and the modelled
 * future read apart.
 */

const RUNNING_MEAN_YEARS = 10;
const PARIS_RANGE: [number, number] = [1.5, 2];
export const PATHWAY_CROSSING_LEVEL = 2;

export interface PathwayScenario {
  key: string;
  label: string;
  colorLight: string;
  colorDark: string;
  /** [year, warming] central-estimate anchors, interpolated linearly between. */
  anchors: Array<[number, number]>;
}

export interface PathwaysData {
  observed: Array<[number, number]>;
  /** Trailing 10-year mean of the observed annual values. */
  runningMean: Array<[number, number]>;
  latest: { year: number; value: number };
  firstYear: number;
  endYear: number;
  scenarios: Array<
    PathwayScenario & {
      /** Interpolated value for every year of the pathway. */
      values: Array<[number, number]>;
      end: number;
      peak: { year: number; value: number };
      /** First year at or above 2 °C, if the pathway gets there. */
      crossing: number | null;
    }
  >;
}

function interpolate(anchors: Array<[number, number]>, year: number): number | null {
  for (let index = 1; index < anchors.length; index += 1) {
    const [x0, v0] = anchors[index - 1];
    const [x1, v1] = anchors[index];
    if (year >= x0 && year <= x1) return v0 + ((v1 - v0) * (year - x0)) / (x1 - x0);
  }
  return null;
}

export function buildPathwaysData(observedPoints: DailyPoint[], scenarios: PathwayScenario[]): PathwaysData | null {
  const observed = observedPoints
    .map((point) => [Number(point.date.slice(0, 4)), point.value] as [number, number])
    .filter(([year, value]) => Number.isFinite(year) && Number.isFinite(value))
    .sort((a, b) => a[0] - b[0]);
  if (observed.length < 2 || !scenarios.length) return null;

  const runningMean: Array<[number, number]> = [];
  for (let index = RUNNING_MEAN_YEARS - 1; index < observed.length; index += 1) {
    const window = observed.slice(index - RUNNING_MEAN_YEARS + 1, index + 1);
    runningMean.push([observed[index][0], window.reduce((sum, [, value]) => sum + value, 0) / window.length]);
  }

  const built = scenarios.map((scenario) => {
    const anchors = [...scenario.anchors].sort((a, b) => a[0] - b[0]);
    const values: Array<[number, number]> = [];
    for (let year = anchors[0][0]; year <= anchors[anchors.length - 1][0]; year += 1) {
      const value = interpolate(anchors, year);
      if (value != null) values.push([year, Math.round(value * 1000) / 1000]);
    }
    const peak = values.reduce((best, [year, value]) => (value > best.value ? { year, value } : best), { year: values[0][0], value: values[0][1] });
    const crossing = values.find(([, value]) => value >= PATHWAY_CROSSING_LEVEL)?.[0] ?? null;
    return { ...scenario, anchors, values, end: values[values.length - 1][1], peak, crossing };
  });

  const [latestYear, latestValue] = observed[observed.length - 1];
  return {
    observed,
    runningMean,
    latest: { year: latestYear, value: latestValue },
    firstYear: observed[0][0],
    endYear: Math.max(...built.map((scenario) => scenario.values[scenario.values.length - 1][0])),
    scenarios: built,
  };
}

export interface PathwaysOptionArgs {
  data: PathwaysData;
  hidden: ReadonlySet<string>;
  /** A pathway to emphasise (hovering its toggle); the others fade. */
  focus: string | null;
  partialLatest: boolean;
  unit: string;
  compact: boolean;
  dark: boolean;
  formatNumber: (value: number, decimals: number, signed?: boolean) => string;
  labels: {
    observed: string;
    runningMean: string;
    partial: string;
    parisRange: string;
    future: string;
  };
}

export function buildPathwaysOption({ data, hidden, focus, partialLatest, unit, compact, dark, formatNumber, labels }: PathwaysOptionArgs): EChartsOption {
  const palette = trendContextPalette(dark, "temperature");
  const signed = (value: number, digits = 2) => formatNumber(value, digits, value > 0);
  const visible = data.scenarios.filter((scenario) => !hidden.has(scenario.key));
  const faded = (key: string) => focus != null && focus !== key;
  const observedFaint = dark ? "rgba(238, 243, 239, 0.32)" : "rgba(25, 39, 34, 0.26)";
  const futureTint = dark ? "rgba(255, 255, 255, 0.025)" : "rgba(25, 39, 34, 0.025)";
  const parisBand = dark ? "rgba(242, 130, 115, 0.09)" : "rgba(197, 76, 64, 0.065)";
  const muted = (text: string) => `<span style="color:${palette.tooltipMuted};font-weight:400">${text}</span>`;
  const dot = (color: string) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${color}"></span>`;
  const observedByYear = new Map(data.observed);
  const meanByYear = new Map(data.runningMean);

  return {
    animation: false,
    aria: { enabled: true },
    // Room on the right for the pathway end labels (about 7 px a character at 12 px).
    grid: {
      left: compact ? 40 : 50,
      right: compact ? 48 : Math.max(60, ...visible.map((scenario) => `${scenario.label} ${signed(scenario.end)}`.length * 7 + 14)),
      top: 22,
      bottom: 32,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "line", lineStyle: { color: palette.zero, width: 1 }, snap: true },
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: palette.tooltipText, fontSize: 12, lineHeight: 18 },
      extraCssText: "box-shadow: 0 10px 24px rgba(2, 6, 23, 0.16); border-radius: 8px;",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? (params as Array<{ axisValue?: number }>) : [];
        const year = Math.round(Number(rows[0]?.axisValue));
        if (!Number.isFinite(year)) return "";
        const lines = [`<b>${year}</b>`];
        const observed = observedByYear.get(year);
        if (observed != null) {
          const partial = partialLatest && year === data.latest.year ? ` ${muted(labels.partial)}` : "";
          lines.push(`${dot(palette.context)}${labels.observed}: <b>${signed(observed)} ${unit}</b>${partial}`);
          const mean = meanByYear.get(year);
          if (mean != null) lines.push(muted(`${labels.runningMean}: ${signed(mean)} ${unit}`));
        }
        const pathwayRows = visible
          .map((scenario) => ({ scenario, value: scenario.values.find(([entry]) => entry === year)?.[1] }))
          .filter((row): row is { scenario: (typeof visible)[number]; value: number } => row.value != null)
          .sort((a, b) => b.value - a.value);
        for (const { scenario, value } of pathwayRows) {
          lines.push(`${dot(dark ? scenario.colorDark : scenario.colorLight)}${scenario.label}: <b>${signed(value)} ${unit}</b>`);
        }
        return lines.join("<br/>");
      },
    },
    xAxis: {
      type: "value",
      min: data.firstYear,
      max: data.endYear,
      interval: compact ? 40 : 20,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: (value: number) => String(value) },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 4,
      interval: 1,
      name: unit,
      nameLocation: "end",
      nameGap: 10,
      nameTextStyle: { color: palette.axisLabel, fontSize: 11, align: "right", padding: [0, 6, 0, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: (value: number) => signed(value, 0) },
      splitLine: { lineStyle: { color: palette.grid, width: 1 } },
    },
    series: [
      {
        id: "observed",
        name: labels.observed,
        type: "line",
        data: data.observed,
        showSymbol: false,
        z: 2,
        lineStyle: { color: observedFaint, width: 1 },
        emphasis: { disabled: true },
        markArea: {
          silent: true,
          data: [
            [
              {
                xAxis: data.latest.year,
                itemStyle: { color: futureTint },
                label: { show: !compact, formatter: labels.future, position: "insideTopLeft", color: palette.axisLabel, fontSize: 11, padding: [2, 0, 0, 8] },
              },
              { xAxis: data.endYear },
            ],
            [
              {
                yAxis: PARIS_RANGE[0],
                itemStyle: { color: parisBand },
                // Phones: the legend names the band; inside the plot the label would cross the pathways.
                label: { show: !compact, formatter: labels.parisRange, position: "insideTopLeft", color: palette.axisLabel, fontSize: 11, padding: [4, 0, 0, 6] },
              },
              { yAxis: PARIS_RANGE[1] },
            ],
          ],
        },
        // The latest year, which the headline reports; provisional while it is in progress.
        markPoint: {
          silent: true,
          symbol: "circle",
          symbolSize: 10,
          itemStyle: { color: palette.surface, borderColor: palette.context, borderWidth: 2 },
          label: { show: false },
          data: [{ coord: [data.latest.year, data.latest.value] }],
        },
      },
      {
        id: "running-mean",
        name: labels.runningMean,
        type: "line",
        data: data.runningMean,
        showSymbol: false,
        z: 3,
        lineStyle: { color: palette.context, width: 2.2, cap: "round", join: "round" },
        emphasis: { disabled: true },
      },
      ...visible.map((scenario) => {
        const color = dark ? scenario.colorDark : scenario.colorLight;
        const opacity = faded(scenario.key) ? 0.22 : 1;
        return {
          id: `pathway-${scenario.key}`,
          name: scenario.label,
          type: "line" as const,
          data: scenario.values,
          showSymbol: false,
          z: focus === scenario.key ? 6 : 4,
          lineStyle: { color, width: focus === scenario.key ? 3 : 2.2, cap: "round" as const, join: "round" as const, opacity },
          itemStyle: { color },
          emphasis: { disabled: true },
          endLabel: {
            show: true,
            formatter: () => (compact ? signed(scenario.end) : `${scenario.label} ${signed(scenario.end)}`),
            color,
            opacity,
            fontSize: compact ? 11 : 12,
            fontWeight: 600,
            distance: 6,
          },
          labelLayout: { moveOverlap: "shiftY" as const },
          markPoint:
            scenario.crossing != null
              ? {
                  silent: true,
                  symbol: "circle",
                  symbolSize: 8,
                  itemStyle: { color: palette.surface, borderColor: color, borderWidth: 2, opacity },
                  label: {
                    show: !compact,
                    position: "top" as const,
                    distance: 5,
                    formatter: String(scenario.crossing),
                    color,
                    opacity,
                    fontSize: 10,
                    fontWeight: 600,
                  },
                  data: [{ coord: [scenario.crossing, PATHWAY_CROSSING_LEVEL] }],
                }
              : undefined,
        };
      }),
    ],
  } as EChartsOption;
}
