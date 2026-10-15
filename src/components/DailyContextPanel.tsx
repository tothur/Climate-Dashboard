import { useMemo, useState } from "react";
import type { Language } from "../domain/model";
import {
  axisDayMonthDay,
  buildDailyContextOption,
  dailyContextPalette,
  pastYearColor,
  type DailyContextCadence,
  type DailyContextData,
  type DailyContextRange,
  type DailyContextRecordDirection,
} from "../charts/dailyContext";
import { EChartsPanel } from "./EChartsPanel";

type FreshnessTone = "fresh" | "warning" | "stale";

interface DailyContextPanelProps {
  title: string;
  subtitle?: string;
  data: DailyContextData;
  unit: string;
  /** Shorter unit for the y-axis name when the full unit is long. */
  axisUnit?: string;
  decimals: number;
  language: Language;
  monthLabels: string[];
  compact: boolean;
  dark: boolean;
  /** False while the dashboard still shows bundled placeholder data. */
  ready: boolean;
  latestDateLabel: string;
  /**
   * Anomaly series (already relative to 1991–2020): a zero line, signed values,
   * warm/cool shading, and a year-to-date chip in place of the "vs normal" chip.
   */
  anomaly?: boolean;
  thresholds?: Array<{ value: number; label: string }>;
  /** An extra headline chip, e.g. the ENSO phase for Niño 3.4. */
  extraChip?: { text: string; alert?: boolean } | null;
  freshnessLabel?: string;
  freshnessTone?: FreshnessTone;
  expandLabel?: string;
  collapseLabel?: string;
}

function englishOrdinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}

const EXTREMES = {
  en: {
    high: { extreme: "warmest", opposite: "coldest", recordAdjective: "record-warm" },
    low: { extreme: "lowest", opposite: "highest", recordAdjective: "record-low" },
  },
  hu: {
    high: { extreme: "legmelegebb", opposite: "leghidegebb", recordAdjective: "rekordmeleg" },
    low: { extreme: "legalacsonyabb", opposite: "legmagasabb", recordAdjective: "rekordalacsony" },
  },
} as const;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function copyFor(language: Language, direction: DailyContextRecordDirection, cadence: DailyContextCadence) {
  const { extreme, opposite, recordAdjective } = EXTREMES[language][direction];
  const monthly = cadence === "monthly";
  if (language === "hu") {
    return {
      year: "Év",
      recent: "Utolsó 3 hónap",
      rangeGroup: "Időtartomány",
      yearsGroup: "Összehasonlító évek",
      normal: "Normál",
      normalRange: (baseline: string) => `Normál tartomány, ${baseline}`,
      record: "Rekord",
      recordForDate: monthly ? "Rekord erre a hónapra" : "Rekord erre a napra",
      rankForDate: (rank: number, total: number) => `${total} évből ${rank}.`,
      annualRank: (rank: number) => (rank === 1 ? `a ${extreme} év` : `${rank}. ${extreme} év`),
      vsNormal: "a normálishoz képest",
      recordOnDate: (day: string) => `Az eddigi ${extreme} ${day}`,
      oppositeOnDate: (day: string) => `Az eddigi ${opposite} ${day}`,
      rankedDay: (rank: number, total: number, day: string) => `${day}: ${rank}. ${extreme} ${total} év közül`,
      recordDays: (count: number, year: number) => `${year}: ${count} ${recordAdjective} ${monthly ? "hónap" : "nap"}`,
      yearToDate: (year: number, value: string, rank: number, total: number) =>
        rank === 1 ? `${year} eddig: ${value} · az eddigi ${extreme}` : `${year} eddig: ${value} · ${total} évből a ${rank}. ${extreme}`,
    };
  }
  return {
    year: "Year",
    recent: "Last 3 months",
    rangeGroup: "Time range",
    yearsGroup: "Comparison years",
    normal: "Normal",
    normalRange: (baseline: string) => `Normal range, ${baseline}`,
    record: "Record",
    recordForDate: monthly ? "Record for this month" : "Record for this date",
    rankForDate: (rank: number, total: number) => `Rank ${rank} of ${total}`,
    annualRank: (rank: number) => (rank === 1 ? `${extreme} year on record` : `${englishOrdinal(rank)} ${extreme} year`),
    vsNormal: "vs normal",
    recordOnDate: (day: string) => `${capitalize(extreme)} ${day} on record`,
    oppositeOnDate: (day: string) => `${capitalize(opposite)} ${day} on record`,
    rankedDay: (rank: number, total: number, day: string) => `${englishOrdinal(rank)} ${extreme} ${day} of ${total}`,
    recordDays: (count: number, year: number) =>
      `${count} ${recordAdjective} ${monthly ? (count === 1 ? "month" : "months") : count === 1 ? "day" : "days"} in ${year}`,
    yearToDate: (year: number, value: string, rank: number, total: number) =>
      rank === 1 ? `${year} so far: ${value} · ${extreme} on record` : `${year} so far: ${value} · ${englishOrdinal(rank)} ${extreme} of ${total}`,
  };
}

const monthNameFormats = {
  en: new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }),
  hu: new Intl.DateTimeFormat("hu-HU", { month: "long", timeZone: "UTC" }),
};
const monthYearFormats = {
  en: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  hu: new Intl.DateTimeFormat("hu-HU", { month: "long", year: "numeric", timeZone: "UTC" }),
};

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(language: Language, decimals: number): Intl.NumberFormat {
  const key = `${language}:${decimals}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormats.set(key, format);
  }
  return format;
}

export function DailyContextPanel({
  title,
  subtitle,
  data,
  unit,
  axisUnit,
  decimals,
  language,
  monthLabels,
  compact,
  dark,
  ready,
  latestDateLabel,
  anomaly: anomalyMode = false,
  thresholds,
  extraChip,
  freshnessLabel,
  freshnessTone,
  expandLabel,
  collapseLabel,
}: DailyContextPanelProps) {
  const [range, setRange] = useState<DailyContextRange>("year");
  const [hiddenYears, setHiddenYears] = useState<ReadonlySet<number>>(() => new Set());
  const monthly = data.cadence === "monthly";
  const copy = copyFor(language, data.direction, data.cadence);

  const formatNumber = (value: number, digits: number) => {
    const formatted = numberFormat(language, digits).format(value);
    return formatted.replace(/^-/, "−");
  };
  const formatSigned = (value: number, digits: number) => (value > 0 ? "+" : "") + formatNumber(value, digits);
  const formatDay = (axisDay: number) => {
    const { month, day } = axisDayMonthDay(axisDay);
    if (monthly) return monthNameFormats[language].format(new Date(Date.UTC(2024, month, 1)));
    return language === "hu" ? `${monthLabels[month]} ${day}.` : `${monthLabels[month]} ${day}`;
  };

  const option = useMemo(
    () =>
      buildDailyContextOption({
        data,
        range,
        hiddenYears,
        unit,
        axisUnit,
        decimals,
        compact,
        dark,
        monthLabels,
        anomaly: anomalyMode,
        thresholds,
        formatNumber,
        formatDay,
        labels: {
          normal: copy.normal,
          normalRange: copy.normalRange(data.baselineLabel),
          record: copy.record,
          recordForDate: copy.recordForDate,
          rankForDate: copy.rankForDate,
          annualRank: copy.annualRank,
        },
      }),
    // formatNumber, formatDay and copy derive from language and monthLabels.
    [data, range, hiddenYears, unit, axisUnit, decimals, compact, dark, monthLabels, language, anomalyMode, thresholds]
  );

  const toggleYear = (year: number) =>
    setHiddenYears((previous) => {
      const next = new Set(previous);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  const latest = data.latest;
  const anomaly = data.latestAnomaly;
  const latestDay = latest ? formatDay(latest.axisDay) : "";
  const rank = data.latestRank;
  const rankText = !rank
    ? null
    : rank.rank === 1
      ? copy.recordOnDate(latestDay)
      : rank.rank === rank.total
        ? copy.oppositeOnDate(latestDay)
        : copy.rankedDay(rank.rank, rank.total, latestDay);
  const recordDaysText = data.recordDays.length ? copy.recordDays(data.recordDays.length, data.currentYear) : null;
  // Highlight a departure from normal in the direction records are set (warmer, or less ice).
  const anomalyIsAlert = anomaly != null && (data.direction === "high" ? anomaly >= 0 : anomaly < 0);
  const skeleton = <span className="value-loading-skeleton daily-context-value-loading" aria-hidden="true" />;

  const intro = (
    <div className="daily-context-intro">
      <div className="daily-context-headline">
        <p className="daily-context-kicker">
          {!ready ? "\u00a0" : monthly && latest ? monthYearFormats[language].format(new Date(`${latest.date}T00:00:00Z`)) : latestDateLabel}
        </p>
        <p className="daily-context-value">
          {ready && latest ? (
            <>
              {anomalyMode ? formatSigned(latest.value, decimals) : formatNumber(latest.value, decimals)}
              <small>{unit}</small>
            </>
          ) : (
            skeleton
          )}
        </p>
        {ready ? (
          <div className="daily-context-chips">
            {extraChip ? <span className={`daily-context-chip ${extraChip.alert ? "is-alert" : ""}`}>{extraChip.text}</span> : null}
            {!anomalyMode && anomaly != null ? (
              <span className={`daily-context-chip ${anomalyIsAlert ? "is-alert" : "is-calm"}`}>
                {`${anomaly >= 0 ? "+" : "−"}${formatNumber(Math.abs(anomaly), decimals)} ${unit} ${copy.vsNormal}`}
              </span>
            ) : null}
            {rankText ? <span className={`daily-context-chip ${rank?.rank === 1 ? "is-alert" : ""}`}>{rankText}</span> : null}
            {anomalyMode && data.yearToDate ? (
              <span className={`daily-context-chip ${data.yearToDate.rank === 1 ? "is-alert" : ""}`}>
                {copy.yearToDate(data.currentYear, `${formatSigned(data.yearToDate.mean, decimals)} ${unit}`, data.yearToDate.rank, data.yearToDate.total)}
              </span>
            ) : null}
            {recordDaysText ? <span className="daily-context-chip">{recordDaysText}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="daily-context-controls">
        {/* Three monthly values are too few for a zoomed view. */}
        {monthly ? null : (
          <div className="daily-context-range" role="group" aria-label={copy.rangeGroup}>
            {(["year", "recent"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>
                {value === "year" ? copy.year : copy.recent}
              </button>
            ))}
          </div>
        )}
        <div className="daily-context-legend">
          <span className="daily-context-normal-key">
            <i style={{ background: dailyContextPalette(dark).band }} aria-hidden="true" />
            {copy.normalRange(data.baselineLabel)}
          </span>
          {data.pastYears.length ? (
            <div className="daily-context-years" role="group" aria-label={copy.yearsGroup}>
              {data.pastYears.map((entry, index) => (
                <button key={entry.year} type="button" aria-pressed={!hiddenYears.has(entry.year)} onClick={() => toggleYear(entry.year)}>
                  <i style={{ background: pastYearColor(index, data.pastYears.length, dark) }} aria-hidden="true" />
                  {entry.year}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <EChartsPanel
      className="daily-context-panel"
      title={title}
      subtitle={subtitle}
      intro={intro}
      option={option}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      freshnessLabel={freshnessLabel}
      freshnessTone={freshnessTone}
    />
  );
}
