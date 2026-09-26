import type { EChartsOption } from "echarts";
import type { DailyPoint } from "../domain/model";

interface BuildVariabilityIndexOptionArgs {
  points: DailyPoint[];
  title: string;
  unit: string;
  yAxisUnitLabel?: string;
  yAxisLimit: number;
  startYear?: number;
  /** Threshold drawn as a dashed guide at ±value (e.g. ±0.5 °C for ONI). */
  threshold?: { value: number; positiveLabel: string; negativeLabel: string };
  /** Swap the warm/cool fills, e.g. for SOI where negative values mean El Niño-like conditions. */
  invertColors?: boolean;
  runningMeanLabel: string;
  compact: boolean;
  dark?: boolean;
  decimals?: number;
  language?: "en" | "hu";
}

interface MonthlyIndexPoint {
  x: number;
  value: number;
}

const RUNNING_MEAN_WINDOW = 12;

function toMonthlyPoints(points: DailyPoint[], startYear: number): MonthlyIndexPoint[] {
  const monthly: MonthlyIndexPoint[] = [];
  for (const point of points) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(point.date);
    if (!match || !Number.isFinite(point.value)) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < startYear || month < 1 || month > 12) continue;
    monthly.push({ x: year + (month - 0.5) / 12, value: point.value });
  }
  return monthly.sort((left, right) => left.x - right.x);
}

function centeredRunningMean(points: MonthlyIndexPoint[], windowSize: number): Array<[number, number]> {
  const half = Math.floor(windowSize / 2);
  const result: Array<[number, number]> = [];
  for (let index = half; index < points.length - half; index += 1) {
    let sum = 0;
    for (let offset = -half; offset < windowSize - half; offset += 1) sum += points[index + offset].value;
    result.push([points[index].x, sum / windowSize]);
  }
  return result;
}

function formatMonthYear(xValue: number, language: "en" | "hu"): string {
  const year = Math.floor(xValue);
  const monthIndex = Math.max(0, Math.min(11, Math.floor((xValue - year) * 12)));
  return new Intl.DateTimeFormat(language === "hu" ? "hu-HU" : "en-US", {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

export function buildVariabilityIndexOption({
  points,
  title,
  unit,
  yAxisUnitLabel,
  yAxisLimit,
  startYear = 1950,
  threshold,
  invertColors = false,
  runningMeanLabel,
  compact,
  dark = false,
  decimals = 2,
  language = "en",
}: BuildVariabilityIndexOptionArgs): EChartsOption {
  const palette = dark
    ? {
        warm: "#f28273",
        cool: "#7ab9dc",
        mean: "#eef3ef",
        axisLine: "rgba(165, 180, 176, 0.42)",
        axisLabel: "#a5b4b0",
        grid: "rgba(165, 180, 176, 0.14)",
        zero: "rgba(238, 243, 239, 0.45)",
        guide: "rgba(238, 243, 239, 0.32)",
        tooltipBg: "rgba(20, 30, 30, 0.96)",
        tooltipBorder: "rgba(148, 163, 184, 0.48)",
        tooltipText: "#e2e8f0",
      }
    : {
        warm: "#c54c40",
        cool: "#26769c",
        mean: "#192722",
        axisLine: "rgba(25, 39, 34, 0.22)",
        axisLabel: "#59665f",
        grid: "rgba(25, 39, 34, 0.08)",
        zero: "rgba(25, 39, 34, 0.42)",
        guide: "rgba(25, 39, 34, 0.28)",
        tooltipBg: "rgba(15, 23, 42, 0.94)",
        tooltipBorder: "rgba(30, 41, 59, 0.24)",
        tooltipText: "#f8fafc",
      };
  const positiveColor = invertColors ? palette.cool : palette.warm;
  const negativeColor = invertColors ? palette.warm : palette.cool;
  const formatter = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: "exceptZero",
  });

  const monthly = toMonthlyPoints(points, startYear);
  const runningMean = centeredRunningMean(monthly, RUNNING_MEAN_WINDOW);
  const valueByX = new Map(monthly.map((point) => [point.x, point.value]));
  const maxYear = monthly.length ? Math.floor(monthly[monthly.length - 1].x) : new Date().getUTCFullYear();
  const axisMin = Math.floor(startYear / 10) * 10;
  const axisMax = Math.ceil((maxYear + 1) / 10) * 10;
  const labelStep = compact ? 20 : 10;
  const yAxisName = yAxisUnitLabel?.trim() || undefined;
  const largestMagnitude = monthly.reduce((max, point) => Math.max(max, Math.abs(point.value)), 0);
  const axisLimit = Math.max(yAxisLimit, Math.ceil(largestMagnitude));

  const areaSeries = (name: string, color: string, clampValue: (value: number) => number) => ({
    name,
    type: "line" as const,
    data: monthly.map((point) => [point.x, clampValue(point.value)]),
    showSymbol: false,
    step: "middle" as const,
    lineStyle: { width: 0 },
    areaStyle: { color, opacity: dark ? 0.62 : 0.7, origin: 0 },
    emphasis: { disabled: true },
    z: 2,
  });

  const guideLines = threshold
    ? [
        { yAxis: threshold.value, label: threshold.positiveLabel, color: positiveColor },
        { yAxis: -threshold.value, label: threshold.negativeLabel, color: negativeColor },
      ]
    : [];

  return {
    animation: false,
    aria: { enabled: true, label: { description: title } },
    grid: {
      top: compact ? 18 : 22,
      right: compact ? 12 : 18,
      bottom: 30,
      left: yAxisName ? (compact ? 56 : 62) : 44,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: palette.tooltipText, fontWeight: 600 },
      axisPointer: { type: "line", lineStyle: { color: palette.guide } },
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? (params as Array<{ axisValue?: number | string; seriesName?: string; data?: unknown }>) : [];
        if (!rows.length) return "";
        const xValue = Number(rows[0].axisValue);
        const value = valueByX.get(xValue);
        const meanRow = rows.find((row) => row.seriesName === runningMeanLabel);
        const meanValue = Array.isArray(meanRow?.data) ? Number(meanRow.data[1]) : Number.NaN;
        const valueColor = value == null ? palette.tooltipText : value >= 0 ? positiveColor : negativeColor;
        const lines = [
          formatMonthYear(xValue, language),
          `<span style="color:${valueColor}">●</span> ${title}: ${value == null ? "-" : `${formatter.format(value)} ${unit}`}`,
        ];
        if (Number.isFinite(meanValue)) lines.push(`<span style="opacity:.7">— ${runningMeanLabel}: ${formatter.format(meanValue)}</span>`);
        return lines.join("<br/>");
      },
    },
    xAxis: {
      type: "value",
      min: axisMin,
      max: axisMax,
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: palette.axisLabel,
        hideOverlap: true,
        formatter: (value: number) => (Math.round(value) % labelStep === 0 ? String(Math.round(value)) : ""),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: -axisLimit,
      max: axisLimit,
      interval: axisLimit / 2,
      name: yAxisName,
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: compact ? 38 : 44,
      nameTextStyle: { color: palette.axisLabel, fontWeight: 650, fontSize: 11 },
      axisLabel: { color: palette.axisLabel, formatter: (value: number) => formatter.format(value) },
      splitLine: { lineStyle: { color: palette.grid, type: [4, 5] } },
    },
    series: [
      areaSeries(`${title} +`, positiveColor, (value) => Math.max(value, 0)),
      areaSeries(`${title} −`, negativeColor, (value) => Math.min(value, 0)),
      {
        name: runningMeanLabel,
        type: "line",
        data: runningMean,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { color: palette.mean, width: 1.4, opacity: 0.85 },
        itemStyle: { color: palette.mean },
        z: 4,
        markLine: {
          symbol: ["none", "none"],
          silent: true,
          animation: false,
          data: [
            { yAxis: 0, lineStyle: { color: palette.zero, width: 1, type: "solid" }, label: { show: false } },
            ...guideLines.map((guide) => ({
              yAxis: guide.yAxis,
              lineStyle: { color: palette.guide, width: 1, type: "dashed" as const },
              label: {
                show: !compact,
                position: "insideStartTop" as const,
                formatter: guide.label,
                color: guide.color,
                fontSize: 10,
                fontWeight: 700,
              },
            })),
          ],
        },
      },
    ],
  };
}
