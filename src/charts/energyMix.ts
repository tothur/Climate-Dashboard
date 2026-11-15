import type { EChartsOption } from "echarts";
import type { EnergyHistoryPoint } from "../data/energy-source";
import { trendContextPalette } from "./trendContext";

/**
 * Hungarian domestic generation by source over the last 24 hours, as stacked
 * areas (MW). MAVIR's small "other" and "not itemised" plant categories share
 * one band, so the chart keeps to five validated categorical colours. The
 * page shows the legend above the chart, with each source's latest value.
 */

export type EnergyMixSeriesKey = "nuclear" | "fossil" | "renewable" | "solar" | "other";

export const ENERGY_MIX_SERIES: Array<{
  key: EnergyMixSeriesKey;
  value: (point: EnergyHistoryPoint) => number;
  light: string;
  dark: string;
}> = [
  { key: "nuclear", value: (point) => point.nuclearMW, light: "#6250d6", dark: "#9085e9" },
  { key: "fossil", value: (point) => point.fossilMW, light: "#eb6834", dark: "#d95926" },
  { key: "renewable", value: (point) => point.renewableMW, light: "#1baf7a", dark: "#199e70" },
  { key: "solar", value: (point) => point.solarMW, light: "#eda100", dark: "#c98500" },
  { key: "other", value: (point) => point.otherMW + point.unallocatedMW, light: "#2a78d6", dark: "#3987e5" },
];

export function energyMixColor(key: EnergyMixSeriesKey, dark: boolean): string {
  const series = ENERGY_MIX_SERIES.find((entry) => entry.key === key);
  return series ? (dark ? series.dark : series.light) : "#888";
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

  return {
    animation: false,
    aria: { enabled: true },
    grid: { left: compact ? 50 : 58, right: compact ? 16 : 24, top: 28, bottom: 32 },
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "line", lineStyle: { color: palette.zero, width: 1 } },
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: palette.tooltipText, fontSize: 12, lineHeight: 18 },
      extraCssText: "box-shadow: 0 10px 24px rgba(2, 6, 23, 0.16); border-radius: 8px;",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? (params as Array<{ dataIndex?: number }>) : [];
        const index = rows[0]?.dataIndex;
        if (index == null || !points[index]) return "";
        const { time, point } = points[index];
        // Top of the stack first, matching the order on the chart.
        const lines = [...ENERGY_MIX_SERIES]
          .reverse()
          .map((series) => `${swatch(dark ? series.dark : series.light)}${labels[series.key]}: <b>${formatNumber(series.value(point))} MW</b>`);
        const total = ENERGY_MIX_SERIES.reduce((sum, series) => sum + series.value(point), 0);
        return `<b>${formatTooltipTime(time)}</b><br/>${lines.join("<br/>")}<br/>${muted(`${labels.total}: ${formatNumber(total)} MW`)}`;
      },
    },
    xAxis: {
      type: "time",
      min: points[0]?.time,
      max: points[points.length - 1]?.time,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      minInterval: 3 * 3_600_000,
      axisLabel: { color: palette.axisLabel, fontSize: 11, hideOverlap: true, formatter: (value: number) => formatTime(value) },
    },
    yAxis: {
      type: "value",
      min: 0,
      name: "MW",
      nameLocation: "end",
      nameGap: 10,
      nameTextStyle: { color: palette.axisLabel, fontSize: 11, align: "right", padding: [0, 6, 0, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: (value: number) => formatNumber(value) },
      splitLine: { lineStyle: { color: palette.grid, width: 1 } },
    },
    series: ENERGY_MIX_SERIES.map((series) => ({
      id: series.key,
      name: labels[series.key],
      type: "line" as const,
      stack: "generation",
      data: points.map(({ time, point }) => [time, series.value(point)]),
      showSymbol: false,
      color: dark ? series.dark : series.light,
      // A thin surface-coloured edge keeps neighbouring bands apart.
      lineStyle: { color: palette.surface, width: 1.5 },
      areaStyle: { color: dark ? series.dark : series.light, opacity: 1 },
      emphasis: { disabled: true },
    })),
  };
}
