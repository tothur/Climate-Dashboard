import type { EChartsOption } from "echarts";
import type { DailyPoint } from "../domain/model";

interface BuildForcingTrendOptionArgs {
  points: DailyPoint[];
  title: string;
  unit: string;
  yAxisUnitLabel?: string;
  compact: boolean;
  dark?: boolean;
  decimals?: number;
  labels?: {
    noData: string;
    latest: string;
  };
}

const FORCING_AXIS_MIN_YEAR = 1974;

export function formatSignedPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

interface MonthlyCo2Point {
  year: number;
  month: number;
  value: number;
  x: number;
}

function buildMonthlyAverages(points: DailyPoint[]): MonthlyCo2Point[] {
  const buckets = new Map<string, { year: number; month: number; sum: number; count: number }>();

  for (const point of points) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(point.date);
    if (!match) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const value = Number(point.value);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(value)) continue;
    if (month < 1 || month > 12) continue;

    const key = `${year}-${String(month).padStart(2, "0")}`;
    const current = buckets.get(key) ?? { year, month, sum: 0, count: 0 };
    current.sum += value;
    current.count += 1;
    buckets.set(key, current);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((bucket) => ({
      year: bucket.year,
      month: bucket.month,
      value: bucket.count > 0 ? bucket.sum / bucket.count : NaN,
      x: bucket.year + (bucket.month - 0.5) / 12,
    }))
    .filter((point) => Number.isFinite(point.value));
}

function formatMonthYearFromX(xValue: number): string {
  if (!Number.isFinite(xValue)) return "";
  const year = Math.floor(xValue);
  const monthIndex = Math.max(0, Math.min(11, Math.floor((xValue - year) * 12)));
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${labels[monthIndex]} ${year}`;
}

export function buildForcingTrendOption({
  points,
  title,
  unit,
  yAxisUnitLabel,
  compact,
  dark = false,
  decimals = 2,
  labels,
}: BuildForcingTrendOptionArgs): EChartsOption {
  const palette = dark
    ? {
        axisLine: "rgba(148, 163, 184, 0.45)",
        axisLabel: "#cbd5e1",
        grid: "rgba(148, 163, 184, 0.16)",
        currentLine: "rgba(251, 146, 60, 0.58)",
        tooltipBg: "rgba(15, 23, 42, 0.96)",
        tooltipBorder: "rgba(148, 163, 184, 0.48)",
        tooltipText: "#e2e8f0",
      }
    : {
        axisLine: "rgba(15, 23, 42, 0.20)",
        axisLabel: "#334155",
        grid: "rgba(15, 23, 42, 0.1)",
        currentLine: "rgba(234, 88, 12, 0.50)",
        tooltipBg: "rgba(15, 23, 42, 0.94)",
        tooltipBorder: "rgba(30, 41, 59, 0.24)",
        tooltipText: "#f8fafc",
      };

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.max(0, Math.min(4, Math.floor(decimals))),
    maximumFractionDigits: Math.max(0, Math.min(4, Math.floor(decimals))),
  });

  const monthly = buildMonthlyAverages(points);
  const hasData = monthly.length > 0;
  const noDataText = labels?.noData ?? "No data";
  const yAxisName = yAxisUnitLabel?.trim() || undefined;

  const minYear = hasData ? monthly[0].year : new Date().getUTCFullYear() - 10;
  const maxYear = hasData ? monthly[monthly.length - 1].year : new Date().getUTCFullYear();
  const axisMin = Math.max(FORCING_AXIS_MIN_YEAR, Math.floor(minYear / 10) * 10);
  const axisMax = Math.ceil(maxYear / 10) * 10;
  const labelStep = compact ? 20 : 10;
  const latestX = hasData ? monthly[monthly.length - 1].x : null;

  return {
    animation: false,
    aria: { enabled: true },
    grid: {
      top: compact ? 30 : 40,
      right: 18,
      bottom: 34,
      left: yAxisName ? (compact ? 78 : 84) : 58,
    },
    tooltip: {
      trigger: "axis",
      confine: false,
      appendToBody: true,
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: palette.tooltipText, fontWeight: 600 },
      extraCssText: "box-shadow: 0 14px 30px rgba(2, 6, 23, 0.28);",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [];
        if (!rows.length) return "";
        const row = rows[0] as { axisValue?: number | string; marker?: string; data?: unknown; seriesName?: string };
        const xValue = Number(row.axisValue);
        const dataPair = Array.isArray(row.data) ? row.data : [];
        const value = dataPair.length > 1 ? Number(dataPair[1]) : Number.NaN;
        const safeValue = Number.isFinite(value) ? `${formatter.format(value)} ${unit}` : "-";
        return `${formatMonthYearFromX(xValue) || noDataText}<br/>${row.marker ?? ""} ${row.seriesName ?? ""}: ${safeValue}`;
      },
    },
    xAxis: {
      type: "value",
      min: axisMin,
      max: axisMax,
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisLabel: {
        color: palette.axisLabel,
        hideOverlap: true,
        formatter: (value: number) => {
          const year = Math.round(value);
          if (!Number.isFinite(year)) return "";
          return year % labelStep === 0 ? String(year) : "";
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 280,
      max: 500,
      name: yAxisName,
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: compact ? 52 : 58,
      nameTextStyle: {
        color: palette.axisLabel,
        fontWeight: 650,
        fontSize: compact ? 11 : 12,
      },
      axisLabel: {
        color: palette.axisLabel,
        formatter: (value: number) => formatter.format(value),
      },
      splitLine: {
        lineStyle: { color: palette.grid, type: [4, 5] },
      },
    },
    series: [
      {
        name: title,
        type: "line",
        data: hasData ? monthly.map((point) => [point.x, point.value]) : [],
        smooth: 0.06,
        connectNulls: false,
        showSymbol: false,
        symbol: "circle",
        symbolSize: compact ? 3 : 3.5,
        lineStyle: {
          color: dark ? "#fb923c" : "#f97316",
          width: 2,
        },
        itemStyle: {
          color: dark ? "#fb923c" : "#f97316",
        },
        markLine:
          latestX != null
            ? {
                symbol: ["none", "none"],
                silent: true,
                lineStyle: { color: palette.currentLine, width: 1.1, type: "dashed" },
                label: { show: false },
                data: [{ xAxis: latestX }],
              }
            : undefined,
      },
    ],
  };
}
