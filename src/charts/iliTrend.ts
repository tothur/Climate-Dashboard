import type { DataZoomComponentOption, EChartsOption } from "echarts";
import { graphic } from "echarts/core";
import type { DailyPoint } from "../domain/model";

interface BuildClimateTrendOptionArgs {
  points: DailyPoint[];
  seriesName: string;
  unit: string;
  decimals?: number;
  lineWidth?: number;
  yAxisMin?: number;
  yAxisMax?: number;
  yAxisUnitLabel?: string;
  xAxisYearLabelStep?: number;
  disableDataZoom?: boolean;
  forceMappedYearLabels?: boolean;
  showLegend?: boolean;
  compact: boolean;
  dark?: boolean;
  color?: string;
  referenceLines?: Array<{
    value: number;
    label: string;
    color: string;
  }>;
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

function buildYearAxisLabelMap(labels: string[], yearStep = 1): Map<string, string> {
  const safeStep = Math.max(1, Math.floor(yearStep));
  const map = new Map<string, string>();
  for (const label of labels) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
    const year = match?.[1] ?? yearFromDateToken(label);
    if (!year) {
      map.set(label, label);
      continue;
    }

    if (!match) {
      map.set(label, year);
      continue;
    }

    const month = Number(match[2]);
    const day = Number(match[3]);
    const numericYear = Number(year);
    const isYearAnchor = month === 1 && day === 1;
    const shouldShow = isYearAnchor && Number.isFinite(numericYear) && numericYear % safeStep === 0;
    map.set(label, shouldShow ? year : "");
  }
  return map;
}

export interface DailyYearLine {
  year: number;
  points: Array<[number, number]>;
}

export interface DailyClimatologyBand {
  mean: Array<[number, number]>;
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

interface TooltipSize {
  contentSize: [number, number];
  viewSize: [number, number];
}

function tooltipEdgePosition(
  point: number[] | number,
  _params: unknown,
  _dom: unknown,
  _rect: unknown,
  size: TooltipSize
): [number, number] {
  const xPoint = Array.isArray(point) ? Number(point[0]) : Number(point);
  const yPoint = Array.isArray(point) ? Number(point[1]) : 0;
  const [contentWidth, contentHeight] = size.contentSize;
  const [viewWidth, viewHeight] = size.viewSize;
  const gap = 12;

  let x = xPoint + gap;
  if (x + contentWidth > viewWidth - 8) x = xPoint - contentWidth - gap;
  x = Math.max(8, Math.min(x, viewWidth - contentWidth - 8));

  let y = yPoint - contentHeight / 2;
  y = Math.max(8, Math.min(y, viewHeight - contentHeight - 8));
  return [x, y];
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
        climatologyMeanLine: "#fde047",
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
        climatologyMeanLine: "#eab308",
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
  const climatologyMean =
    climatology == null
      ? []
      : [...climatology.mean].sort((a, b) => a[0] - b[0]);
  const legendData = [
    ...(climatology && climatologyMean.length ? [climatology.meanLabel] : []),
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
      confine: true,
      appendToBody: false,
      position: tooltipEdgePosition,
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: palette.tooltipText, fontWeight: 600 },
      extraCssText: "box-shadow: 0 14px 30px rgba(2, 6, 23, 0.28); max-width: min(340px, 78vw); white-space: normal;",
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
      ...(climatology && climatologyMean.length
        ? [
            {
              name: climatology.meanLabel,
              type: "line" as const,
              data: climatologyMean,
              showSymbol: false,
              symbol: "circle",
              smooth: 0.22,
              silent: true,
              tooltip: { show: false },
              lineStyle: {
                color: palette.climatologyMeanLine,
                width: 1.2,
                type: "dotted" as const,
              },
              itemStyle: {
                color: palette.climatologyMeanLine,
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
  lineWidth = 2.8,
  yAxisMin,
  yAxisMax,
  yAxisUnitLabel,
  xAxisYearLabelStep = 1,
  disableDataZoom = false,
  forceMappedYearLabels = false,
  showLegend,
  compact,
  dark = false,
  color,
  referenceLines,
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

  const xLabels = points.map((point) => point.date);
  const values = points.map((point) => point.value);
  const hasData = xLabels.length > 0;

  const dataZoom = disableDataZoom ? undefined : buildCompactDataZoom(xLabels, compact, palette);
  const formatter = formatterFor(decimals);
  const xAxisYearLabels = buildYearAxisLabelMap(xLabels, xAxisYearLabelStep);
  const yAxisName = yAxisUnitLabel?.trim() || undefined;
  const markLineData: Array<Record<string, unknown>> = [];

  for (const line of referenceLines ?? []) {
    if (!Number.isFinite(line.value)) continue;
    markLineData.push({
      yAxis: line.value,
      lineStyle: {
        color: line.color,
        width: 1.2,
        type: "dashed",
      },
      label: {
        show: true,
        formatter: line.label,
        position: "start",
        offset: [36, 0],
        color: line.color,
        fontWeight: 700,
      },
    });
  }

  return {
    animation: false,
    aria: { enabled: true },
    grid: {
      top: compact ? 40 : 86,
      right: 18,
      bottom: compact && dataZoom ? 58 : 38,
      left: yAxisName ? (compact ? 78 : 84) : 58,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      appendToBody: false,
      position: tooltipEdgePosition,
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
      extraCssText: "box-shadow: 0 14px 30px rgba(2, 6, 23, 0.28); max-width: min(340px, 78vw); white-space: normal;",
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
      show: showLegend ?? !compact,
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
        interval: forceMappedYearLabels
          ? (index: number, value: string) => {
              const label = xAxisYearLabels.get(String(value)) ?? "";
              return label.length > 0;
            }
          : "auto",
        hideOverlap: !forceMappedYearLabels,
        formatter: (value: string) => xAxisYearLabels.get(String(value)) ?? "",
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
          width: lineWidth,
          cap: "round",
        },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: areaTopColor },
            { offset: 1, color: areaBottomColor },
          ]),
        },
        markLine: markLineData.length
          ? {
              symbol: ["none", "none"],
              silent: true,
              label: { show: false },
              data: markLineData,
            }
          : undefined,
      },
    ],
  };
}
