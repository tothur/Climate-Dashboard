import type { DataZoomComponentOption, EChartsOption } from "echarts";
import { graphic } from "echarts/core";
import type { DailyPoint } from "../domain/model";

interface BuildClimateTrendOptionArgs {
  points: DailyPoint[];
  seriesName: string;
  unit: string;
  decimals?: number;
  yAxisMin?: number;
  yAxisMax?: number;
  compact: boolean;
  dark?: boolean;
  color?: string;
  labels?: {
    noData: string;
    latest: string;
  };
}

const numberFormatters = new Map<number, Intl.NumberFormat>();

function formatterFor(decimals: number): Intl.NumberFormat {
  const safeDecimals = Math.max(0, Math.min(5, Math.floor(decimals)));
  const existing = numberFormatters.get(safeDecimals);
  if (existing) return existing;
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: safeDecimals,
    maximumFractionDigits: safeDecimals,
  });
  numberFormatters.set(safeDecimals, formatter);
  return formatter;
}

function buildCompactDataZoom(
  labels: string[],
  compact: boolean,
  palette: { sliderBorder: string; sliderFill: string; sliderText: string }
): DataZoomComponentOption[] | undefined {
  if (labels.length <= 120) return undefined;
  const startIndex = compact ? Math.max(0, labels.length - 120) : 0;
  const endIndex = labels.length - 1;
  return [
    {
      type: "inside",
      xAxisIndex: 0,
      startValue: labels[startIndex],
      endValue: labels[endIndex],
    },
    {
      type: "slider",
      xAxisIndex: 0,
      bottom: 8,
      height: 18,
      startValue: labels[startIndex],
      endValue: labels[endIndex],
      brushSelect: false,
      showDataShadow: false,
      borderColor: palette.sliderBorder,
      fillerColor: palette.sliderFill,
      moveHandleSize: 6,
      textStyle: { color: palette.sliderText },
      labelFormatter: (value: string | number) => String(value).slice(0, 4),
    },
  ];
}

function yearFromDateToken(value: string): string {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return match?.[1] ?? "";
}

function buildYearAxisLabelMap(labels: string[]): Map<string, string> {
  const map = new Map<string, string>();
  let previousYear = "";
  for (const label of labels) {
    const year = yearFromDateToken(label);
    if (!year) {
      map.set(label, label);
      continue;
    }
    if (year !== previousYear) {
      map.set(label, year);
      previousYear = year;
      continue;
    }
    map.set(label, "");
  }
  return map;
}

export interface DailyYearLine {
  year: number;
  points: Array<[number, number]>;
}

export interface DailyClimatologyBand {
  min: Array<[number, number]>;
  max: Array<[number, number]>;
  mean: Array<[number, number]>;
  rangeLabel: string;
  meanLabel: string;
}

interface BuildClimateMonthlyComparisonOptionArgs {
  monthLabels: string[];
  lines: DailyYearLine[];
  unit: string;
  decimals?: number;
  compact: boolean;
  dark?: boolean;
  yAxisMin?: number;
  yAxisMax?: number;
  yAxisUnitLabel?: string;
  climatology?: DailyClimatologyBand;
  labels?: {
    noData: string;
  };
  yearColors?: Record<number, string>;
}

function monthlyLineColor(lineYear: number, latestYear: number, dark: boolean, yearColors?: Record<number, string>): string {
  if (yearColors?.[lineYear]) return yearColors[lineYear];
  if (lineYear === latestYear) return dark ? "#60a5fa" : "#2563eb";
  return dark ? "#94a3b8" : "#64748b";
}

function axisDayToMonthLabel(axisDay: number, monthLabels: string[]): string {
  if (!Number.isFinite(axisDay) || axisDay < 1 || axisDay > 366) return "";
  const refDate = new Date(Date.UTC(2024, 0, 1));
  refDate.setUTCDate(axisDay);
  const monthIndex = refDate.getUTCMonth();
  return monthLabels[monthIndex] ?? "";
}

function axisDayToMonthDayLabel(axisDay: number, monthLabels: string[]): string {
  if (!Number.isFinite(axisDay) || axisDay < 1 || axisDay > 366) return String(axisDay);
  const refDate = new Date(Date.UTC(2024, 0, 1));
  refDate.setUTCDate(axisDay);
  const monthLabel = monthLabels[refDate.getUTCMonth()] ?? "";
  const day = String(refDate.getUTCDate()).padStart(2, "0");
  return `${monthLabel} ${day}`;
}

export function buildClimateMonthlyComparisonOption({
  monthLabels,
  lines,
  unit,
  decimals = 2,
  compact,
  dark = false,
  yAxisMin,
  yAxisMax,
  yAxisUnitLabel,
  climatology,
  labels,
  yearColors,
}: BuildClimateMonthlyComparisonOptionArgs): EChartsOption {
  const palette = dark
    ? {
        axisLine: "rgba(148, 163, 184, 0.45)",
        axisLabel: "#cbd5e1",
        legend: "#e2e8f0",
        grid: "rgba(148, 163, 184, 0.16)",
        legendBg: "rgba(15, 23, 42, 0.82)",
        legendBorder: "rgba(148, 163, 184, 0.32)",
        currentYearLine: "rgba(125, 211, 252, 0.55)",
        climatologyRangeFill: "rgba(148, 163, 184, 0.18)",
        climatologyMeanLine: "rgba(248, 250, 252, 0.70)",
        tooltipBg: "rgba(15, 23, 42, 0.96)",
        tooltipBorder: "rgba(148, 163, 184, 0.48)",
        tooltipText: "#e2e8f0",
      }
    : {
        axisLine: "rgba(15, 23, 42, 0.20)",
        axisLabel: "#334155",
        legend: "#0f172a",
        grid: "rgba(15, 23, 42, 0.1)",
        legendBg: "rgba(248, 250, 252, 0.92)",
        legendBorder: "rgba(148, 163, 184, 0.38)",
        currentYearLine: "rgba(37, 99, 235, 0.45)",
        climatologyRangeFill: "rgba(148, 163, 184, 0.20)",
        climatologyMeanLine: "rgba(51, 65, 85, 0.76)",
        tooltipBg: "rgba(15, 23, 42, 0.94)",
        tooltipBorder: "rgba(30, 41, 59, 0.24)",
        tooltipText: "#f8fafc",
      };

  const formatter = formatterFor(decimals);
  const safeMonthLabels =
    monthLabels.length === 12
      ? monthLabels
      : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const latestYear = lines.reduce((best, line) => Math.max(best, line.year), -Infinity);
  const noDataText = labels?.noData ?? "No data";
  const hasAnyValue = lines.some((line) => line.points.length > 0);
  const monthTickInterval = compact ? 92 : 61;
  const yAxisName = yAxisUnitLabel?.trim() || undefined;
  const climatologyByDay = climatology
    ? new Map<number, { min: number; max: number; mean: number }>(
        climatology.mean.map(([axisDay, mean]) => {
          const minValue = climatology.min.find(([day]) => day === axisDay)?.[1];
          const maxValue = climatology.max.find(([day]) => day === axisDay)?.[1];
          return [axisDay, { min: minValue ?? mean, max: maxValue ?? mean, mean }];
        })
      )
    : null;
  const climatologyRangeBase =
    climatologyByDay == null
      ? []
      : Array.from(climatologyByDay.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([axisDay, values]) => [axisDay, values.min] as [number, number]);
  const climatologyRangeSpread =
    climatologyByDay == null
      ? []
      : Array.from(climatologyByDay.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([axisDay, values]) => [axisDay, Math.max(0, values.max - values.min)] as [number, number]);
  const climatologyMean =
    climatologyByDay == null
      ? []
      : Array.from(climatologyByDay.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([axisDay, values]) => [axisDay, values.mean] as [number, number]);
  const legendData = [
    ...(climatology && climatologyRangeSpread.length ? [climatology.rangeLabel, climatology.meanLabel] : []),
    ...lines.map((line) => String(line.year)),
  ];

  return {
    animation: false,
    aria: { enabled: true },
    grid: {
      top: compact ? 40 : 82,
      right: 18,
      bottom: 38,
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
        const axisValue = Number((rows[0] as { axisValue?: number | string }).axisValue);
        const header = axisDayToMonthDayLabel(axisValue, safeMonthLabels);
        const body = rows
          .map((entry) => {
            const row = entry as { marker?: string; seriesName?: string; data?: number | null };
            const dataPair = Array.isArray(row.data) ? row.data : [];
            const yValue = dataPair.length > 1 ? Number(dataPair[1]) : Number(row.data);
            const value = Number.isFinite(yValue) ? `${formatter.format(yValue)} ${unit}` : "-";
            return `${row.marker ?? ""} ${row.seriesName ?? ""}: ${value}`;
          })
          .join("<br/>");
        return `${header}<br/>${body}`;
      },
    },
    legend: {
      show: true,
      top: 4,
      left: 8,
      right: 8,
      data: legendData,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 10,
      padding: [6, 10],
      backgroundColor: palette.legendBg,
      borderColor: palette.legendBorder,
      borderWidth: 1,
      borderRadius: 10,
      textStyle: { color: palette.legend, fontWeight: 600, fontSize: 12, lineHeight: 16 },
    },
    xAxis: {
      type: "value",
      min: 1,
      max: 366,
      interval: monthTickInterval,
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisLabel: {
        color: palette.axisLabel,
        formatter: (value: number) => axisDayToMonthLabel(Math.round(value), safeMonthLabels),
      },
      splitNumber: compact ? 4 : 6,
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      type: "value",
      min: typeof yAxisMin === "number" ? yAxisMin : undefined,
      max: typeof yAxisMax === "number" ? yAxisMax : undefined,
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
      ...(climatology && climatologyRangeBase.length && climatologyRangeSpread.length
        ? [
            {
              name: "__climatology-base",
              type: "line" as const,
              data: climatologyRangeBase,
              stack: "climatology-range",
              showSymbol: false,
              symbol: "none",
              smooth: 0.22,
              silent: true,
              tooltip: { show: false },
              lineStyle: { opacity: 0, width: 0 },
              areaStyle: { opacity: 0 },
              emphasis: { disabled: true },
              z: 0,
            },
            {
              name: climatology.rangeLabel,
              type: "line" as const,
              data: climatologyRangeSpread,
              stack: "climatology-range",
              showSymbol: false,
              symbol: "none",
              smooth: 0.22,
              silent: true,
              tooltip: { show: false },
              lineStyle: { opacity: 0, width: 0 },
              areaStyle: { color: palette.climatologyRangeFill },
              emphasis: { disabled: true },
              z: 0,
            },
            {
              name: climatology.meanLabel,
              type: "line" as const,
              data: climatologyMean,
              showSymbol: false,
              symbol: "none",
              smooth: 0.22,
              silent: true,
              tooltip: { show: false },
              lineStyle: {
                color: palette.climatologyMeanLine,
                width: 1.2,
                type: "dotted" as const,
              },
              emphasis: { disabled: true },
              z: 1,
            },
          ]
        : []),
      ...lines.map((line) => ({
        name: String(line.year),
        type: "line" as const,
        data: hasAnyValue ? line.points : [],
        smooth: 0.22,
        connectNulls: false,
        showSymbol: true,
        symbol: "circle",
        symbolSize: compact ? 3.5 : 4.2,
        lineStyle: {
          color: monthlyLineColor(line.year, latestYear, dark, yearColors),
          width: line.year === latestYear ? 2.2 : 1.7,
          type: (line.year === latestYear ? "solid" : "dashed") as "solid" | "dashed",
        },
        itemStyle: {
          color: monthlyLineColor(line.year, latestYear, dark, yearColors),
        },
        emphasis: {
          focus: "series" as const,
        },
        markLine:
          hasAnyValue && line.year === latestYear
            ? {
                symbol: ["none", "none"],
                silent: true,
                lineStyle: { color: palette.currentYearLine, width: 1.1, type: "dashed" as const },
                label: { show: false },
                data: [{ xAxis: new Date().getUTCDate() + [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335][new Date().getUTCMonth()] }],
              }
            : undefined,
      })),
    ],
  };
}

export function buildClimateTrendOption({
  points,
  seriesName,
  unit,
  decimals = 2,
  yAxisMin,
  yAxisMax,
  compact,
  dark = false,
  color,
  labels,
}: BuildClimateTrendOptionArgs): EChartsOption {
  const palette = dark
    ? {
        axisLine: "rgba(148, 163, 184, 0.45)",
        axisLabel: "#cbd5e1",
        legend: "#e2e8f0",
        grid: "rgba(148, 163, 184, 0.16)",
        sliderBorder: "rgba(148, 163, 184, 0.35)",
        sliderFill: "rgba(59, 130, 246, 0.35)",
        sliderText: "#cbd5e1",
        legendBg: "rgba(15, 23, 42, 0.82)",
        legendBorder: "rgba(148, 163, 184, 0.32)",
        currentWeekLine: "rgba(125, 211, 252, 0.55)",
        tooltipBg: "rgba(15, 23, 42, 0.96)",
        tooltipBorder: "rgba(148, 163, 184, 0.48)",
        tooltipText: "#e2e8f0",
      }
    : {
        axisLine: "rgba(15, 23, 42, 0.20)",
        axisLabel: "#334155",
        legend: "#0f172a",
        grid: "rgba(15, 23, 42, 0.1)",
        sliderBorder: "rgba(15, 23, 42, 0.18)",
        sliderFill: "rgba(37, 99, 235, 0.20)",
        sliderText: "#475569",
        legendBg: "rgba(248, 250, 252, 0.92)",
        legendBorder: "rgba(148, 163, 184, 0.38)",
        currentWeekLine: "rgba(37, 99, 235, 0.45)",
        tooltipBg: "rgba(15, 23, 42, 0.94)",
        tooltipBorder: "rgba(30, 41, 59, 0.24)",
        tooltipText: "#f8fafc",
      };

  const lineColor = color ?? (dark ? "#60a5fa" : "#2563eb");
  const areaTopColor = dark ? "rgba(96, 165, 250, 0.34)" : "rgba(59, 130, 246, 0.26)";
  const areaBottomColor = dark ? "rgba(96, 165, 250, 0.06)" : "rgba(59, 130, 246, 0.04)";
  const noDataText = labels?.noData ?? "No data";
  const latestText = labels?.latest ?? "Latest";

  const xLabels = points.map((point) => point.date);
  const values = points.map((point) => point.value);
  const hasData = xLabels.length > 0;
  const currentDateLabel = hasData ? xLabels[xLabels.length - 1] : null;

  const dataZoom = buildCompactDataZoom(xLabels, compact, palette);
  const formatter = formatterFor(decimals);
  const xAxisYearLabels = buildYearAxisLabelMap(xLabels);

  return {
    animation: false,
    aria: { enabled: true },
    grid: {
      top: compact ? 40 : 86,
      right: 18,
      bottom: compact && dataZoom ? 58 : 38,
      left: 58,
    },
    tooltip: {
      trigger: "axis",
      confine: false,
      appendToBody: true,
      axisPointer: {
        type: "line",
        lineStyle: {
          color: palette.currentWeekLine,
          type: "dashed",
          width: 1.1,
        },
      },
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: palette.tooltipText, fontWeight: 600 },
      extraCssText: "box-shadow: 0 14px 30px rgba(2, 6, 23, 0.28);",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [];
        if (!rows.length) return "";
        const axisLabel = (rows[0] as { axisValueLabel?: string }).axisValueLabel ?? "";
        const metricRow = rows[0] as { marker?: string; seriesName?: string; data?: number | null };
        const value =
          typeof metricRow.data === "number" && Number.isFinite(metricRow.data)
            ? `${formatter.format(metricRow.data)} ${unit}`
            : "-";
        return `${axisLabel}<br/>${metricRow.marker ?? ""} ${metricRow.seriesName ?? ""}: ${value}`;
      },
    },
    legend: {
      show: !compact,
      top: 4,
      left: 8,
      right: 8,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 10,
      padding: [6, 10],
      backgroundColor: palette.legendBg,
      borderColor: palette.legendBorder,
      borderWidth: 1,
      borderRadius: 10,
      textStyle: { color: palette.legend, fontWeight: 600, fontSize: 12, lineHeight: 16 },
    },
    xAxis: {
      type: "category",
      data: hasData ? xLabels : [noDataText],
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisLabel: {
        color: palette.axisLabel,
        interval: compact ? "auto" : "auto",
        hideOverlap: true,
        formatter: (value: string) => xAxisYearLabels.get(String(value)) ?? "",
      },
    },
    yAxis: {
      type: "value",
      min: typeof yAxisMin === "number" ? yAxisMin : undefined,
      max: typeof yAxisMax === "number" ? yAxisMax : undefined,
      axisLabel: {
        color: palette.axisLabel,
        formatter: (value: number) => formatter.format(value),
      },
      splitLine: {
        lineStyle: { color: palette.grid, type: [4, 5] },
      },
    },
    dataZoom,
    series: [
      {
        name: seriesName,
        type: "line",
        data: hasData ? values : [null],
        smooth: 0.24,
        showSymbol: false,
        connectNulls: false,
        lineStyle: {
          color: lineColor,
          width: 2.8,
          cap: "round",
        },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: areaTopColor },
            { offset: 1, color: areaBottomColor },
          ]),
        },
        markLine: currentDateLabel
          ? {
              symbol: ["none", "none"],
              silent: true,
              lineStyle: { color: palette.currentWeekLine, width: 1.3, type: "dashed" },
              label: {
                show: !compact,
                formatter: latestText,
                color: palette.axisLabel,
              },
              data: [{ xAxis: currentDateLabel }],
            }
          : undefined,
      },
    ],
  };
}
