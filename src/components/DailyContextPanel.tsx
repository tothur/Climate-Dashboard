import { useMemo, useState } from "react";
import type { Language } from "../domain/model";
import {
  axisDayMonthDay,
  buildDailyContextOption,
  dailyContextPalette,
  pastYearColor,
  type DailyContextData,
  type DailyContextRange,
} from "../charts/dailyContext";
import { EChartsPanel } from "./EChartsPanel";

type FreshnessTone = "fresh" | "warning" | "stale";

interface DailyContextPanelProps {
  title: string;
  subtitle?: string;
  data: DailyContextData;
  unit: string;
  decimals: number;
  language: Language;
  monthLabels: string[];
  compact: boolean;
  dark: boolean;
  /** False while the dashboard still shows bundled placeholder data. */
  ready: boolean;
  latestDateLabel: string;
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

const COPY = {
  en: {
    year: "Year",
    recent: "Last 3 months",
    rangeGroup: "Time range",
    yearsGroup: "Comparison years",
    normal: "Normal",
    normalRange: (baseline: string) => `Normal range, ${baseline}`,
    record: "Record",
    recordForDate: "Record for this date",
    rankForDate: (rank: number, total: number) => `Rank ${rank} of ${total}`,
    annualRank: (rank: number) => (rank === 1 ? "warmest year on record" : `${englishOrdinal(rank)} warmest year`),
    vsNormal: "vs normal",
    warmestOnRecord: (day: string) => `Warmest ${day} on record`,
    coldestOnRecord: (day: string) => `Coldest ${day} on record`,
    rankedDay: (rank: number, total: number, day: string) => `${englishOrdinal(rank)} warmest ${day} of ${total}`,
    recordDays: (count: number, year: number) => `${count} record-warm ${count === 1 ? "day" : "days"} in ${year}`,
  },
  hu: {
    year: "Év",
    recent: "Utolsó 3 hónap",
    rangeGroup: "Időtartomány",
    yearsGroup: "Összehasonlító évek",
    normal: "Normál",
    normalRange: (baseline: string) => `Normál tartomány, ${baseline}`,
    record: "Rekord",
    recordForDate: "Rekord erre a napra",
    rankForDate: (rank: number, total: number) => `${total} évből ${rank}.`,
    annualRank: (rank: number) => (rank === 1 ? "a legmelegebb év" : `${rank}. legmelegebb év`),
    vsNormal: "a normálishoz képest",
    warmestOnRecord: (day: string) => `Az eddigi legmelegebb ${day}`,
    coldestOnRecord: (day: string) => `Az eddigi leghidegebb ${day}`,
    rankedDay: (rank: number, total: number, day: string) => `${day}: ${rank}. legmelegebb ${total} év közül`,
    recordDays: (count: number, year: number) => `${year}: ${count} rekordmeleg nap`,
  },
} as const;

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
  decimals,
  language,
  monthLabels,
  compact,
  dark,
  ready,
  latestDateLabel,
  freshnessLabel,
  freshnessTone,
  expandLabel,
  collapseLabel,
}: DailyContextPanelProps) {
  const [range, setRange] = useState<DailyContextRange>("year");
  const [hiddenYears, setHiddenYears] = useState<ReadonlySet<number>>(() => new Set());
  const copy = COPY[language];

  const formatNumber = (value: number, digits: number) => {
    const formatted = numberFormat(language, digits).format(value);
    return formatted.replace(/^-/, "−");
  };
  const formatDay = (axisDay: number) => {
    const { month, day } = axisDayMonthDay(axisDay);
    return language === "hu" ? `${monthLabels[month]} ${day}.` : `${monthLabels[month]} ${day}`;
  };

  const option = useMemo(
    () =>
      buildDailyContextOption({
        data,
        range,
        hiddenYears,
        unit,
        decimals,
        compact,
        dark,
        monthLabels,
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
    [data, range, hiddenYears, unit, decimals, compact, dark, monthLabels, language]
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
      ? copy.warmestOnRecord(latestDay)
      : rank.rank === rank.total
        ? copy.coldestOnRecord(latestDay)
        : copy.rankedDay(rank.rank, rank.total, latestDay);
  const recordDaysText = data.recordDays.length ? copy.recordDays(data.recordDays.length, data.currentYear) : null;
  const skeleton = <span className="value-loading-skeleton daily-context-value-loading" aria-hidden="true" />;

  const intro = (
    <div className="daily-context-intro">
      <div className="daily-context-headline">
        <p className="daily-context-kicker">{ready ? latestDateLabel : " "}</p>
        <p className="daily-context-value">
          {ready && latest ? (
            <>
              {formatNumber(latest.value, decimals)}
              <small>{unit}</small>
            </>
          ) : (
            skeleton
          )}
        </p>
        {ready ? (
          <div className="daily-context-chips">
            {anomaly != null ? (
              <span className={`daily-context-chip ${anomaly >= 0 ? "is-warm" : "is-cool"}`}>
                {`${anomaly >= 0 ? "+" : "−"}${formatNumber(Math.abs(anomaly), decimals)} ${unit} ${copy.vsNormal}`}
              </span>
            ) : null}
            {rankText ? <span className={`daily-context-chip ${rank?.rank === 1 ? "is-warm" : ""}`}>{rankText}</span> : null}
            {recordDaysText ? <span className="daily-context-chip">{recordDaysText}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="daily-context-controls">
        <div className="daily-context-range" role="group" aria-label={copy.rangeGroup}>
          {(["year", "recent"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>
              {value === "year" ? copy.year : copy.recent}
            </button>
          ))}
        </div>
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
