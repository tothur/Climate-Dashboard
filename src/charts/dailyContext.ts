import type { EChartsOption } from "echarts";
import type { DailyPoint } from "../domain/model";

/**
 * Daily "context" chart: the current year against the 1991–2020 normal range,
 * the most recent full years, and the record for each calendar day.
 *
 * Days are placed on a 366-day axis (a leap reference year), so Feb 29 has its
 * own slot and every other date lines up across years. Monthly series use the
 * same axis with each month's value placed mid-month.
 */

const DAY_MS = 86_400_000;
const REFERENCE_YEAR_START_UTC = Date.UTC(2024, 0, 1);
const AXIS_DAYS = 366;
const MONTH_START_AXIS_DAYS = [1, 32, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336];
const MIN_BASELINE_YEARS = 10;
const MIN_FULL_YEAR_DAYS = 360;
const MID_MONTH_OFFSET_DAYS = 14;
// Points this far apart on average are monthly values rather than daily ones.
const MONTHLY_MIN_MEDIAN_GAP_DAYS = 25;
const RECENT_WINDOW_DAYS = 92;
const RECENT_WINDOW_AHEAD_DAYS = 21;

export type DailyContextRange = "year" | "recent";
/** Which extreme counts as a record: highs for temperature, lows for sea ice. */
export type DailyContextRecordDirection = "high" | "low";
export type DailyContextCadence = "daily" | "monthly";

export interface DailyContextRank {
  rank: number;
  total: number;
}

export interface DailyContextData {
  direction: DailyContextRecordDirection;
  cadence: DailyContextCadence;
  currentYear: number;
  latest: { date: string; axisDay: number; value: number } | null;
  /** Middle 80% (10th–90th percentile) of the baseline years, plus their mean. */
  normal: Map<number, { low: number; high: number; mean: number }>;
  current: Array<[number, number]>;
  pastYears: Array<{ year: number; points: Array<[number, number]>; annualRank: number | null }>;
  /** The current year's rank among all years for each calendar day (1 = the record extreme). */
  ranks: Map<number, DailyContextRank>;
  recordDays: number[];
  latestRank: DailyContextRank | null;
  latestAnomaly: number | null;
  baselineLabel: string;
}

export function axisDayFromIsoDate(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const reference = Date.UTC(2024, month - 1, day);
  const check = new Date(reference);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return Math.round((reference - REFERENCE_YEAR_START_UTC) / DAY_MS) + 1;
}

export function axisDayMonthDay(axisDay: number): { month: number; day: number } {
  const date = new Date(REFERENCE_YEAR_START_UTC + (axisDay - 1) * DAY_MS);
  return { month: date.getUTCMonth(), day: date.getUTCDate() };
}

/** Mid-month axis day for monthly values, so a point sits within its month. */
function monthlyAxisDay(date: string): number | null {
  const month = Number(date.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return MONTH_START_AXIS_DAYS[month - 1] + MID_MONTH_OFFSET_DAYS;
}

function detectCadence(points: DailyPoint[]): DailyContextCadence {
  const recent = points.slice(-25);
  const gaps: number[] = [];
  for (let index = 1; index < recent.length; index += 1) {
    const gap = (Date.parse(`${recent[index].date}T00:00:00Z`) - Date.parse(`${recent[index - 1].date}T00:00:00Z`)) / DAY_MS;
    if (Number.isFinite(gap)) gaps.push(gap);
  }
  if (!gaps.length) return "daily";
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] >= MONTHLY_MIN_MEDIAN_GAP_DAYS ? "monthly" : "daily";
}

function percentile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function buildDailyContextData(
  points: DailyPoint[],
  options: { baselineStartYear: number; baselineEndYear: number; pastYearCount: number; recordDirection?: DailyContextRecordDirection }
): DailyContextData | null {
  const direction = options.recordDirection ?? "high";
  const beats = (other: number, value: number) => (direction === "high" ? other > value : other < value);
  const cadence = detectCadence(points);
  const toAxisDay = cadence === "monthly" ? monthlyAxisDay : axisDayFromIsoDate;
  const byYear = new Map<number, Map<number, number>>();
  let latest: DailyContextData["latest"] = null;

  for (const point of points) {
    const axisDay = toAxisDay(point.date);
    if (axisDay == null || !Number.isFinite(point.value)) continue;
    const year = Number(point.date.slice(0, 4));
    let days = byYear.get(year);
    if (!days) byYear.set(year, (days = new Map()));
    days.set(axisDay, point.value);
    if (!latest || point.date > latest.date) latest = { date: point.date, axisDay, value: point.value };
  }
  if (!latest) return null;

  const currentYear = Number(latest.date.slice(0, 4));
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);

  const normal: DailyContextData["normal"] = new Map();
  for (let axisDay = 1; axisDay <= AXIS_DAYS; axisDay += 1) {
    const values: number[] = [];
    for (let year = options.baselineStartYear; year <= options.baselineEndYear; year += 1) {
      const value = byYear.get(year)?.get(axisDay);
      if (value != null) values.push(value);
    }
    if (values.length < MIN_BASELINE_YEARS) continue;
    values.sort((a, b) => a - b);
    normal.set(axisDay, {
      low: percentile(values, 0.1),
      high: percentile(values, 0.9),
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    });
  }

  const fullYearSize = cadence === "monthly" ? 12 : MIN_FULL_YEAR_DAYS;
  const annualMeans = years
    .filter((year) => year !== currentYear && (byYear.get(year)?.size ?? 0) >= fullYearSize)
    .map((year) => {
      const values = Array.from(byYear.get(year)?.values() ?? []);
      return { year, mean: values.reduce((sum, value) => sum + value, 0) / values.length };
    })
    .sort((a, b) => (direction === "high" ? b.mean - a.mean : a.mean - b.mean));
  const annualRankByYear = new Map(annualMeans.map((entry, index) => [entry.year, index + 1]));

  const toSortedPoints = (days: Map<number, number> | undefined): Array<[number, number]> =>
    Array.from(days?.entries() ?? []).sort((a, b) => a[0] - b[0]);

  const pastYears: DailyContextData["pastYears"] = [];
  for (let year = currentYear - options.pastYearCount; year < currentYear; year += 1) {
    const days = byYear.get(year);
    if (!days?.size) continue;
    pastYears.push({ year, points: toSortedPoints(days), annualRank: annualRankByYear.get(year) ?? null });
  }

  const current = toSortedPoints(byYear.get(currentYear));
  const ranks: DailyContextData["ranks"] = new Map();
  const recordDays: number[] = [];
  for (const [axisDay, value] of current) {
    let rank = 1;
    let total = 1;
    for (const year of years) {
      if (year === currentYear) continue;
      const other = byYear.get(year)?.get(axisDay);
      if (other == null) continue;
      total += 1;
      if (beats(other, value)) rank += 1;
    }
    // A record needs a real history to beat, not just a handful of years.
    if (total < MIN_BASELINE_YEARS) continue;
    ranks.set(axisDay, { rank, total });
    if (rank === 1) recordDays.push(axisDay);
  }

  const latestNormal = normal.get(latest.axisDay);
  return {
    direction,
    cadence,
    currentYear,
    latest,
    normal,
    current,
    pastYears,
    ranks,
    recordDays,
    latestRank: ranks.get(latest.axisDay) ?? null,
    latestAnomaly: latestNormal ? latest.value - latestNormal.mean : null,
    baselineLabel: `${options.baselineStartYear}–${options.baselineEndYear}`,
  };
}

export interface DailyContextOptionArgs {
  data: DailyContextData;
  range: DailyContextRange;
  hiddenYears: ReadonlySet<number>;
  unit: string;
  /** Shorter unit for the y-axis name when the full unit is long. */
  axisUnit?: string;
  decimals: number;
  compact: boolean;
  dark: boolean;
  monthLabels: string[];
  formatNumber: (value: number, decimals: number) => string;
  formatDay: (axisDay: number) => string;
  labels: {
    normal: string;
    normalRange: string;
    record: string;
    recordForDate: string;
    rankForDate: (rank: number, total: number) => string;
    annualRank: (rank: number) => string;
  };
}

export function dailyContextPalette(dark: boolean) {
  return dark
    ? {
        current: "#f08a8a",
        past: ["#4f5655", "#7d8784", "#a9b4b0"],
        band: "rgba(145, 183, 228, 0.17)",
        bandAhead: "rgba(145, 183, 228, 0.08)",
        axisLabel: "#a5b4b0",
        grid: "rgba(148, 163, 184, 0.14)",
        today: "rgba(165, 180, 176, 0.55)",
        surface: "#141e1e",
        tooltipBg: "rgba(20, 30, 30, 0.96)",
        tooltipBorder: "rgba(148, 163, 184, 0.40)",
        tooltipText: "#eef3ef",
        tooltipMuted: "#a5b4b0",
      }
    : {
        current: "#c55353",
        past: ["#cbc9c0", "#9c9a92", "#66655f"],
        band: "rgba(79, 134, 191, 0.15)",
        bandAhead: "rgba(79, 134, 191, 0.07)",
        axisLabel: "#59665f",
        grid: "rgba(25, 39, 34, 0.08)",
        today: "rgba(89, 102, 95, 0.5)",
        surface: "#ffffff",
        tooltipBg: "rgba(255, 255, 255, 0.98)",
        tooltipBorder: "rgba(25, 39, 34, 0.16)",
        tooltipText: "#192722",
        tooltipMuted: "#59665f",
      };
}

/** Oldest past year gets the lightest grey, the most recent the darkest. */
export function pastYearColor(index: number, count: number, dark: boolean): string {
  const ramp = dailyContextPalette(dark).past;
  const offset = ramp.length - count;
  return ramp[Math.max(0, Math.min(ramp.length - 1, offset + index))];
}

function niceStep(span: number): number {
  if (span > 40) return 10;
  if (span > 20) return 5;
  if (span > 12) return 4;
  if (span > 6) return 2;
  if (span > 3) return 1;
  if (span > 1.5) return 0.5;
  if (span > 0.6) return 0.25;
  return 0.1;
}

function stepDecimals(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.5 || step === 0.1) return 1;
  return 2;
}

export function dailyContextXRange(data: DailyContextData, range: DailyContextRange): [number, number] {
  if (range === "year" || data.cadence === "monthly" || !data.latest) return [1, AXIS_DAYS];
  const end = Math.min(AXIS_DAYS, data.latest.axisDay + RECENT_WINDOW_AHEAD_DAYS);
  const start = Math.max(1, end - RECENT_WINDOW_DAYS - RECENT_WINDOW_AHEAD_DAYS);
  return [start, end];
}

function xAxisTicks(range: DailyContextRange, xMin: number, xMax: number, compact: boolean): number[] {
  if (range === "year") {
    return compact ? MONTH_START_AXIS_DAYS.filter((_, index) => index % 2 === 0) : MONTH_START_AXIS_DAYS;
  }
  const ticks: number[] = [];
  for (let axisDay = xMin; axisDay <= xMax; axisDay += 1) {
    const { day } = axisDayMonthDay(axisDay);
    if (day === 1 || (!compact && day === 15)) ticks.push(axisDay);
  }
  return ticks;
}

export function buildDailyContextOption({
  data,
  range,
  hiddenYears,
  unit,
  axisUnit,
  decimals,
  compact,
  dark,
  monthLabels,
  formatNumber,
  formatDay,
  labels,
}: DailyContextOptionArgs): EChartsOption {
  const palette = dailyContextPalette(dark);
  const [xMin, xMax] = dailyContextXRange(data, range);
  const inView = (axisDay: number) => axisDay >= xMin && axisDay <= xMax;
  const latestAxisDay = data.latest?.axisDay ?? AXIS_DAYS;
  const visiblePastYears = data.pastYears.filter((entry) => !hiddenYears.has(entry.year));
  const pastColors = new Map(data.pastYears.map((entry, index) => [entry.year, pastYearColor(index, data.pastYears.length, dark)]));

  const visibleValues: number[] = [];
  for (const [axisDay, normal] of data.normal) if (inView(axisDay)) visibleValues.push(normal.low, normal.high);
  for (const entry of visiblePastYears) for (const [axisDay, value] of entry.points) if (inView(axisDay)) visibleValues.push(value);
  for (const [axisDay, value] of data.current) if (inView(axisDay)) visibleValues.push(value);
  const rawMin = visibleValues.length ? Math.min(...visibleValues) : 0;
  const rawMax = visibleValues.length ? Math.max(...visibleValues) : 1;
  const padding = Math.max((rawMax - rawMin) * 0.08, 0.05);
  const step = niceStep(rawMax - rawMin + padding * 2);
  // Extents can't go below zero, so don't pad the axis into negative values.
  const yMin = Math.max(rawMin >= 0 ? 0 : -Infinity, Math.floor((rawMin - padding) / step) * step);
  const yMax = Math.ceil((rawMax + padding) / step) * step;
  const tickDecimals = stepDecimals(step);

  const bandDays = Array.from(data.normal.keys()).sort((a, b) => a - b);
  const bandSegments = [
    { days: bandDays.filter((axisDay) => axisDay <= latestAxisDay), fill: palette.band },
    { days: bandDays.filter((axisDay) => axisDay >= latestAxisDay), fill: palette.bandAhead },
  ].filter((segment) => segment.days.length > 1);

  const ticks = xAxisTicks(range, xMin, xMax, compact);
  const tickLabel = (axisDay: number) => {
    return range === "year" ? monthLabels[axisDayMonthDay(axisDay).month] ?? "" : formatDay(axisDay);
  };
  const lastPoint = data.current[data.current.length - 1];

  const tooltipFormatter = (params: unknown) => {
    const rows = Array.isArray(params) ? (params as Array<{ axisValue?: number }>) : [];
    const pointer = Number(rows[0]?.axisValue);
    if (!Number.isFinite(pointer)) return "";
    // Monthly values sit mid-month; read the month the pointer is in.
    const axisDay =
      data.cadence === "monthly"
        ? MONTH_START_AXIS_DAYS[axisDayMonthDay(Math.min(AXIS_DAYS, Math.max(1, Math.round(pointer)))).month] + MID_MONTH_OFFSET_DAYS
        : Math.round(pointer);
    const lines: Array<{ name: string; value: number; color: string; strong: boolean; note?: string }> = [];
    const currentValue = data.current.find(([day]) => day === axisDay)?.[1];
    if (currentValue != null) lines.push({ name: String(data.currentYear), value: currentValue, color: palette.current, strong: true });
    for (const entry of visiblePastYears) {
      const value = entry.points.find(([day]) => day === axisDay)?.[1];
      if (value == null) continue;
      lines.push({
        name: String(entry.year),
        value,
        color: pastColors.get(entry.year) ?? palette.past[0],
        strong: false,
        note: entry.annualRank != null && entry.annualRank <= 3 ? labels.annualRank(entry.annualRank) : undefined,
      });
    }
    lines.sort((a, b) => (data.direction === "high" ? b.value - a.value : a.value - b.value));
    const normal = data.normal.get(axisDay);
    const rank = data.ranks.get(axisDay);
    const muted = (text: string) => `<span style="color:${palette.tooltipMuted};font-weight:400">${text}</span>`;
    const body = lines
      .map(
        (line) =>
          `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${line.color}"></span>` +
          `${line.strong ? `<b>${line.name}</b>` : line.name} ` +
          `${line.strong ? "<b>" : ""}${formatNumber(line.value, decimals)} ${unit}${line.strong ? "</b>" : ""}` +
          (line.note ? ` ${muted(`· ${line.note}`)}` : "")
      )
      .join("<br/>");
    const normalLine = normal
      ? `<br/>${muted(`${labels.normal} ${formatNumber(normal.low, 1)}–${formatNumber(normal.high, 1)} ${unit}`)}`
      : "";
    const rankLine = rank ? `<br/>${muted(rank.rank === 1 ? labels.recordForDate : labels.rankForDate(rank.rank, rank.total))}` : "";
    return `<b>${formatDay(axisDay)}</b><br/>${body}${normalLine}${rankLine}`;
  };

  const monthly = data.cadence === "monthly";
  const gridLeft = compact ? 48 : 52;
  const gridRight = compact ? 42 : 52;

  return {
    animation: false,
    aria: { enabled: true },
    grid: [
      { left: gridLeft, right: gridRight, top: 22, bottom: 50 },
      { left: gridLeft, right: gridRight, height: 6, bottom: 12 },
    ],
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "line", lineStyle: { color: palette.today, width: 1 } },
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: palette.tooltipText, fontSize: 12, lineHeight: 18 },
      extraCssText: "box-shadow: 0 10px 24px rgba(2, 6, 23, 0.16); border-radius: 8px;",
      formatter: tooltipFormatter,
    },
    xAxis: [
      {
        type: "value",
        min: xMin,
        max: xMax,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: palette.axisLabel,
          fontSize: 11,
          customValues: ticks,
          formatter: (value: number) => tickLabel(Math.round(value)),
          hideOverlap: true,
        },
      },
      { type: "value", gridIndex: 1, min: xMin, max: xMax, show: false },
    ],
    yAxis: [
      {
        type: "value",
        min: yMin,
        max: yMax,
        interval: step,
        name: axisUnit ?? unit,
        nameLocation: "end",
        nameGap: 10,
        nameTextStyle: { color: palette.axisLabel, fontSize: 11, align: "right", padding: [0, 6, 0, 0] },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.axisLabel, fontSize: 11, formatter: (value: number) => formatNumber(value, tickDecimals) },
        splitLine: { lineStyle: { color: palette.grid, width: 1 } },
      },
      {
        type: "value",
        gridIndex: 1,
        min: 0,
        max: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
        name: labels.record,
        nameLocation: "middle",
        nameRotate: 0,
        nameGap: 8,
        nameTextStyle: { color: palette.axisLabel, fontSize: 11, align: "right" },
      },
    ],
    series: [
      {
        name: labels.normalRange,
        type: "custom",
        silent: true,
        clip: true,
        z: 1,
        tooltip: { show: false },
        data: [[xMin, yMin]],
        renderItem: (_params, api) => ({
          type: "group",
          children: bandSegments.map((segment) => {
            const upper = segment.days.map((axisDay) => api.coord([axisDay, data.normal.get(axisDay)!.high]));
            const lower = segment.days.map((axisDay) => api.coord([axisDay, data.normal.get(axisDay)!.low])).reverse();
            return { type: "polygon" as const, shape: { points: [...upper, ...lower] }, style: { fill: segment.fill } };
          }),
        }),
      },
      ...visiblePastYears.map((entry) => ({
        name: String(entry.year),
        type: "line" as const,
        data: entry.points,
        showSymbol: monthly,
        symbol: "circle",
        symbolSize: 4,
        triggerLineEvent: true,
        z: 2,
        lineStyle: { color: pastColors.get(entry.year), width: 1.4 },
        itemStyle: { color: pastColors.get(entry.year) },
        endLabel: {
          show: true,
          formatter: String(entry.year),
          color: palette.axisLabel,
          fontSize: 11,
          distance: 6,
        },
        labelLayout: { moveOverlap: "shiftY" as const },
        emphasis: { focus: "series" as const, lineStyle: { width: 2.2 } },
        blur: { lineStyle: { opacity: 0.25 }, endLabel: { opacity: 0.35 } },
      })),
      {
        name: String(data.currentYear),
        type: "line",
        data: data.current,
        showSymbol: monthly,
        symbol: "circle",
        symbolSize: 6,
        triggerLineEvent: true,
        z: 4,
        lineStyle: { color: palette.current, width: 2.6, cap: "round", join: "round" },
        itemStyle: { color: palette.current },
        emphasis: { focus: "series", lineStyle: { width: 2.8 } },
        // The current year stays prominent while a past year is focused.
        blur: { lineStyle: { opacity: 1 }, endLabel: { opacity: 1 } },
        endLabel: {
          show: true,
          formatter: String(data.currentYear),
          color: palette.tooltipText,
          fontSize: 12,
          fontWeight: 600,
          distance: 9,
        },
        labelLayout: { moveOverlap: "shiftY" },
        markPoint: lastPoint
          ? {
              silent: true,
              symbol: "circle",
              symbolSize: 10,
              itemStyle: { color: palette.current, borderColor: palette.surface, borderWidth: 2 },
              label: { show: false },
              data: [{ coord: lastPoint }],
            }
          : undefined,
        markLine: data.latest
          ? {
              silent: true,
              symbol: ["none", "none"],
              label: { show: false },
              lineStyle: { color: palette.today, type: [2, 3], width: 1 },
              data: [{ xAxis: latestAxisDay }],
            }
          : undefined,
      },
      {
        name: labels.record,
        type: "custom",
        xAxisIndex: 1,
        yAxisIndex: 1,
        silent: true,
        clip: true,
        tooltip: { show: false },
        data: data.recordDays.map((axisDay) => [axisDay, 0]),
        renderItem: (_params, api) => {
          // A daily record covers its day; a monthly one its month, minus a small gap.
          const halfSpan = monthly ? MID_MONTH_OFFSET_DAYS - 0.5 : 0.5;
          const start = api.coord([Number(api.value(0)) - halfSpan, 1]);
          const end = api.coord([Number(api.value(0)) + halfSpan, 0]);
          const width = Math.max(2, end[0] - start[0]);
          return {
            type: "rect",
            shape: { x: start[0], y: start[1], width, height: end[1] - start[1], r: 1 },
            style: { fill: palette.current },
          };
        },
      },
    ],
  } as EChartsOption;
}
