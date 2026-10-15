import type { EChartsOption } from "echarts";
import type { DailyPoint } from "../domain/model";

/**
 * Long-term trend charts in the same visual language as the daily context
 * charts: one highlighted series, quiet context, a headline and direct labels.
 *
 * - "line": a continuous record (sea level, ocean heat, energy imbalance,
 *   cumulative ice-sheet loss) with a dashed linear trend for context.
 * - "annual-bars": yearly balances (glaciers), losses and gains as bars with a
 *   10-year average line.
 */

const YEAR_MS = 365.25 * 86_400_000;
const RECENT_YEARS = 10;
const RUNNING_MEAN_YEARS = 10;

export type TrendContextKind = "line" | "annual-bars";
export type TrendContextRange = "all" | "recent";

export interface TrendContextData {
  kind: TrendContextKind;
  /** [time ms, value] in date order. */
  points: Array<[number, number]>;
  /** Unsmoothed values by time, when the plotted line is a running mean. */
  raw: Map<number, number> | null;
  first: { time: number; value: number };
  latest: { date: string; time: number; value: number };
  /** Least-squares slope per year over the whole record, and over the last 10 years. */
  fullRatePerYear: number | null;
  recentRatePerYear: number | null;
  fullFit: { slope: number; intercept: number } | null;
  /** Annual series only. */
  annual: {
    rankOfLatest: number;
    total: number;
    lossYearsInRecent: number;
    recentYearCount: number;
    cumulative: number;
    runningMean: Array<[string, number]>;
  } | null;
}

function toTime(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function linearFit(points: Array<[number, number]>): { slope: number; intercept: number } | null {
  if (points.length < 3) return null;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: meanY - slope * meanX };
}

export function buildTrendContextData(
  points: DailyPoint[],
  options: { kind: TrendContextKind; rawPoints?: DailyPoint[] }
): TrendContextData | null {
  const series = points
    .map((point) => [toTime(point.date), point.value, point.date] as const)
    .filter(([time, value]) => Number.isFinite(time) && Number.isFinite(value))
    .sort((a, b) => a[0] - b[0]);
  if (series.length < 2) return null;

  const plotted: Array<[number, number]> = series.map(([time, value]) => [time, value]);
  const [lastTime, lastValue, lastDate] = series[series.length - 1];
  const fullFit = linearFit(plotted);
  const recentFit = linearFit(plotted.filter(([time]) => time >= lastTime - RECENT_YEARS * YEAR_MS));

  let annual: TrendContextData["annual"] = null;
  if (options.kind === "annual-bars") {
    const values = plotted.map(([, value]) => value);
    const recent = values.slice(-RECENT_YEARS);
    const runningMean: Array<[string, number]> = [];
    for (let index = RUNNING_MEAN_YEARS - 1; index < series.length; index += 1) {
      const window = values.slice(index - RUNNING_MEAN_YEARS + 1, index + 1);
      runningMean.push([series[index][2].slice(0, 4), window.reduce((sum, value) => sum + value, 0) / window.length]);
    }
    annual = {
      // 1 = the most negative balance (largest loss) on record.
      rankOfLatest: values.filter((value) => value < lastValue).length + 1,
      total: values.length,
      lossYearsInRecent: recent.filter((value) => value < 0).length,
      recentYearCount: recent.length,
      cumulative: values.reduce((sum, value) => sum + value, 0),
      runningMean,
    };
  }

  const raw = options.rawPoints
    ? new Map(
        options.rawPoints
          .map((point) => [toTime(point.date), point.value] as const)
          .filter(([time, value]) => Number.isFinite(time) && Number.isFinite(value))
      )
    : null;

  return {
    kind: options.kind,
    points: plotted,
    raw,
    first: { time: plotted[0][0], value: plotted[0][1] },
    latest: { date: lastDate, time: lastTime, value: lastValue },
    fullRatePerYear: fullFit ? fullFit.slope * YEAR_MS : null,
    recentRatePerYear: recentFit ? recentFit.slope * YEAR_MS : null,
    fullFit,
    annual,
  };
}

/** Mean of the plotted values within [startYear, endYear]. */
export function meanBetweenYears(data: TrendContextData, startYear: number, endYear: number): number | null {
  const values = data.points
    .filter(([time]) => {
      const year = new Date(time).getUTCFullYear();
      return year >= startYear && year <= endYear;
    })
    .map(([, value]) => value);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const STEP_CANDIDATES = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];

function niceScale(min: number, max: number, maxTicks = 6): { min: number; max: number; step: number; decimals: number } {
  const span = Math.max(max - min, 1e-6);
  const step = STEP_CANDIDATES.find((candidate) => span / candidate <= maxTicks) ?? STEP_CANDIDATES[STEP_CANDIDATES.length - 1];
  const decimals = step >= 1 ? 0 : step >= 0.1 && Number.isInteger(step * 10) ? 1 : 2;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step, decimals };
}

export function trendContextPalette(dark: boolean) {
  return dark
    ? {
        signal: "#f08a8a",
        signalArea: "rgba(240, 138, 138, 0.14)",
        gain: "#91b7e4",
        context: "#a9b4b0",
        trend: "rgba(165, 180, 176, 0.75)",
        axisLabel: "#a5b4b0",
        grid: "rgba(148, 163, 184, 0.14)",
        zero: "rgba(165, 180, 176, 0.55)",
        surface: "#141e1e",
        tooltipBg: "rgba(20, 30, 30, 0.96)",
        tooltipBorder: "rgba(148, 163, 184, 0.40)",
        tooltipText: "#eef3ef",
        tooltipMuted: "#a5b4b0",
      }
    : {
        signal: "#c55353",
        signalArea: "rgba(197, 83, 83, 0.10)",
        gain: "#4f86bf",
        context: "#4a4945",
        trend: "rgba(89, 102, 95, 0.7)",
        axisLabel: "#59665f",
        grid: "rgba(25, 39, 34, 0.08)",
        zero: "rgba(89, 102, 95, 0.5)",
        surface: "#ffffff",
        tooltipBg: "rgba(255, 255, 255, 0.98)",
        tooltipBorder: "rgba(25, 39, 34, 0.16)",
        tooltipText: "#192722",
        tooltipMuted: "#59665f",
      };
}

export interface TrendContextOptionArgs {
  data: TrendContextData;
  range: TrendContextRange;
  unit: string;
  axisUnit?: string;
  decimals: number;
  compact: boolean;
  dark: boolean;
  /** Plot larger values lower, e.g. cumulative ice loss so the line falls as ice is lost. */
  inverse?: boolean;
  /** Shade between the line and zero (energy imbalance). */
  zeroArea?: boolean;
  showTrend?: boolean;
  formatNumber: (value: number, decimals: number, signed?: boolean) => string;
  formatTooltipDate: (time: number) => string;
  labels: {
    trend: string;
    runningMean: string;
    tooltipExtra: (time: number, value: number) => string | null;
  };
}

export function buildTrendContextOption(args: TrendContextOptionArgs): EChartsOption {
  return args.data.kind === "annual-bars" ? buildAnnualBarsOption(args) : buildLineOption(args);
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

function buildLineOption({
  data,
  range,
  unit,
  axisUnit,
  decimals,
  compact,
  dark,
  inverse = false,
  zeroArea = false,
  showTrend = true,
  formatNumber,
  formatTooltipDate,
  labels,
}: TrendContextOptionArgs): EChartsOption {
  const palette = trendContextPalette(dark);
  const xMax = data.latest.time;
  const xMin = range === "recent" ? Math.max(data.first.time, xMax - RECENT_YEARS * YEAR_MS) : data.first.time;
  const fit = showTrend ? data.fullFit : null;
  const trendLine: Array<[number, number]> = fit ? [data.first.time, xMax].map((time) => [time, fit.slope * time + fit.intercept] as [number, number]) : [];

  const visible = data.points.filter(([time]) => time >= xMin).map(([, value]) => value);
  if (fit) visible.push(fit.slope * xMin + fit.intercept, fit.slope * xMax + fit.intercept);
  if (zeroArea) visible.push(0);
  const rawMin = Math.min(...visible);
  const rawMax = Math.max(...visible);
  const pad = Math.max((rawMax - rawMin) * 0.06, 1e-6);
  // A record that never goes negative (cumulative loss) shouldn't be padded below zero.
  const neverNegative = data.points.every(([, value]) => value >= 0);
  const scale = niceScale(neverNegative ? Math.max(0, rawMin - pad) : rawMin - pad, rawMax + pad);

  const muted = (text: string) => `<span style="color:${palette.tooltipMuted};font-weight:400">${text}</span>`;
  const lastPoint = data.points[data.points.length - 1];

  return {
    animation: false,
    aria: { enabled: true },
    grid: { left: compact ? 50 : 58, right: compact ? 58 : 70, top: 22, bottom: 32 },
    tooltip: {
      ...tooltipBase(palette),
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? (params as Array<{ seriesId?: string; value?: [number, number] }>) : [];
        const row = rows.find((entry) => entry.seriesId === "signal");
        if (!row?.value) return "";
        const [time, value] = row.value;
        const extra = labels.tooltipExtra(time, value);
        return (
          `<b>${formatTooltipDate(time)}</b><br/>` +
          `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${palette.signal}"></span>` +
          `<b>${formatNumber(value, decimals)} ${unit}</b>` +
          (extra ? `<br/>${muted(extra)}` : "")
        );
      },
    },
    xAxis: {
      type: "time",
      min: xMin,
      max: xMax,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      minInterval: YEAR_MS,
      axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: "{yyyy}", hideOverlap: true },
    },
    yAxis: {
      type: "value",
      inverse,
      min: scale.min,
      max: scale.max,
      interval: scale.step,
      name: axisUnit ?? unit,
      nameLocation: inverse ? "start" : "end",
      nameGap: 10,
      nameTextStyle: { color: palette.axisLabel, fontSize: 11, align: "right", padding: [0, 6, 0, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: (value: number) => formatNumber(value, scale.decimals) },
      splitLine: { lineStyle: { color: palette.grid, width: 1 } },
    },
    series: [
      ...(trendLine.length
        ? [
            {
              id: "trend",
              name: labels.trend,
              type: "line" as const,
              data: trendLine,
              silent: true,
              showSymbol: false,
              z: 1,
              tooltip: { show: false },
              lineStyle: { color: palette.trend, width: 1.2, type: [5, 4] as number[] },
              emphasis: { disabled: true },
            },
          ]
        : []),
      {
        id: "signal",
        name: labels.trend,
        type: "line",
        data: data.points,
        showSymbol: false,
        z: 3,
        lineStyle: { color: palette.signal, width: 2.4, cap: "round", join: "round" },
        itemStyle: { color: palette.signal },
        areaStyle: zeroArea ? { color: palette.signalArea, origin: 0 } : undefined,
        emphasis: { disabled: true },
        endLabel: {
          show: true,
          formatter: () => formatNumber(lastPoint[1], decimals),
          color: palette.tooltipText,
          fontSize: 12,
          fontWeight: 600,
          distance: 8,
        },
        markPoint: {
          silent: true,
          symbol: "circle",
          symbolSize: 10,
          itemStyle: { color: palette.signal, borderColor: palette.surface, borderWidth: 2 },
          label: { show: false },
          data: [{ coord: lastPoint }],
        },
        markLine: zeroArea
          ? {
              silent: true,
              symbol: ["none", "none"],
              label: { show: false },
              lineStyle: { color: palette.zero, type: "solid", width: 1 },
              data: [{ yAxis: 0 }],
            }
          : undefined,
      },
    ],
  } as EChartsOption;
}

function buildAnnualBarsOption({ data, unit, axisUnit, decimals, compact, dark, formatNumber, labels }: TrendContextOptionArgs): EChartsOption {
  const palette = trendContextPalette(dark);
  const years = data.points.map(([time]) => String(new Date(time).getUTCFullYear()));
  const values = data.points.map(([, value]) => value);
  const runningMean = new Map(data.annual?.runningMean ?? []);
  const visible = [...values, ...runningMean.values(), 0];
  const rawMin = Math.min(...visible);
  const rawMax = Math.max(...visible);
  const pad = Math.max((rawMax - rawMin) * 0.06, 1e-6);
  const scale = niceScale(rawMin - pad, rawMax + pad);
  const lastIndex = values.length - 1;
  // Long records in narrow panels need sparser year labels.
  const labelEvery = compact || years.length > 60 ? 10 : 5;
  const muted = (text: string) => `<span style="color:${palette.tooltipMuted};font-weight:400">${text}</span>`;

  return {
    animation: false,
    aria: { enabled: true },
    grid: { left: compact ? 50 : 58, right: compact ? 14 : 20, top: 22, bottom: 32 },
    tooltip: {
      ...tooltipBase(palette),
      axisPointer: { type: "shadow" as const, shadowStyle: { color: palette.grid } },
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? (params as Array<{ dataIndex?: number; seriesId?: string }>) : [];
        const index = rows.find((entry) => entry.seriesId === "bars")?.dataIndex;
        if (index == null) return "";
        const value = values[index];
        const mean = runningMean.get(years[index]);
        const extra = labels.tooltipExtra(data.points[index][0], value);
        return (
          `<b>${years[index]}</b><br/>` +
          `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${value < 0 ? palette.signal : palette.gain}"></span>` +
          `<b>${formatNumber(value, decimals, true)} ${unit}</b>` +
          (mean != null ? `<br/>${muted(`${labels.runningMean}: ${formatNumber(mean, decimals, true)} ${unit}`)}` : "") +
          (extra ? `<br/>${muted(extra)}` : "")
        );
      },
    },
    xAxis: {
      type: "category",
      data: years,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axisLabel, fontSize: 11, hideOverlap: true, interval: (index: number) => Number(years[index]) % labelEvery === 0 },
    },
    yAxis: {
      type: "value",
      min: scale.min,
      max: scale.max,
      interval: scale.step,
      name: axisUnit ?? unit,
      nameLocation: "end",
      nameGap: 10,
      nameTextStyle: { color: palette.axisLabel, fontSize: 11, align: "right", padding: [0, 6, 0, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: (value: number) => formatNumber(value, scale.decimals) },
      splitLine: { lineStyle: { color: palette.grid, width: 1 } },
    },
    series: [
      {
        id: "bars",
        name: unit,
        type: "bar",
        barCategoryGap: "22%",
        z: 2,
        data: values.map((value, index) => ({
          value,
          itemStyle: {
            color: value < 0 ? palette.signal : palette.gain,
            opacity: index === lastIndex ? 1 : 0.72,
            borderRadius: value < 0 ? [0, 0, 2, 2] : [2, 2, 0, 0],
          },
          label:
            index === lastIndex
              ? {
                  show: true,
                  position: value < 0 ? "bottom" : "top",
                  formatter: () => formatNumber(value, decimals, true),
                  color: palette.tooltipText,
                  fontSize: 12,
                  fontWeight: 600,
                }
              : undefined,
        })),
        emphasis: { disabled: true },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          label: { show: false },
          lineStyle: { color: palette.zero, type: "solid", width: 1 },
          data: [{ yAxis: 0 }],
        },
      },
      {
        id: "running-mean",
        name: labels.runningMean,
        type: "line",
        data: years.map((year) => runningMean.get(year) ?? null),
        showSymbol: false,
        connectNulls: false,
        z: 3,
        lineStyle: { color: palette.context, width: 2, cap: "round", join: "round" },
        itemStyle: { color: palette.context },
        emphasis: { disabled: true },
        tooltip: { show: false },
      },
    ],
  } as EChartsOption;
}
