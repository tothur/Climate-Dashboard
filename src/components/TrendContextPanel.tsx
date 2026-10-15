import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Language } from "../domain/model";
import { buildTrendContextOption, trendContextPalette, type TrendContextData, type TrendContextRange } from "../charts/trendContext";
import type { ChartDomain } from "../theme/domainColors";
import { EChartsPanel } from "./EChartsPanel";

type FreshnessTone = "fresh" | "warning" | "stale";

/**
 * What the series measures, which decides the headline chips:
 * - rise: a running total that grows (sea level, ocean heat)
 * - loss: cumulative mass lost since the record began (ice sheets)
 * - imbalance: a rate around zero shown as a 12-month mean (energy imbalance)
 * - annual: yearly balances where negative is a loss (glaciers)
 */
export type TrendContextVariant = "rise" | "loss" | "imbalance" | "annual";

/** Roughly 362 Gt of ice raises global mean sea level by 1 mm. */
const GT_PER_MM_SEA_LEVEL = 362;

interface TrendContextPanelProps {
  title: string;
  subtitle?: string;
  data: TrendContextData;
  variant: TrendContextVariant;
  /** Topic colour of the line (bars are sign-coded). */
  domain: ChartDomain;
  unit: string;
  axisUnit?: string;
  decimals: number;
  language: Language;
  compact: boolean;
  dark: boolean;
  ready: boolean;
  /** Imbalance only: the reference period mean the latest value is compared with. */
  baseline?: { label: string; mean: number | null };
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
    all: "All",
    recent: "Last 10 years",
    rangeGroup: "Time range",
    trendSince: (year: number) => `Linear trend since ${year}`,
    monthlyMean: "12-month mean",
    loss: "Loss",
    gain: "Gain",
    runningMean: "10-year average",
    sinceStart: (change: string, year: number) => `${change} since ${year}`,
    recentRate: (recent: string, full: string, rateUnit: string) => `Last 10 years: ${recent} ${rateUnit} · whole record ${full}`,
    perYear: (unit: string) => `${unit}/yr`,
    lossRate: (recent: string, full: string, year: number) => `Losing ${recent} Gt/yr over the last 10 years · ${full} Gt/yr since ${year}`,
    seaLevel: (mm: string) => `≈ ${mm} mm of global sea level rise`,
    seaLevelShort: (mm: string) => `≈ ${mm} mm of sea level`,
    cumulativeSince: (year: number) => `cumulative since ${year}`,
    baselineRatio: (ratio: string, label: string) => `${ratio}× the ${label} average`,
    decadeTrend: (value: string, unit: string) => `Trend: ${value} ${unit} per decade`,
    monthlyValue: (value: string, unit: string) => `Monthly value: ${value} ${unit}`,
    meanTo: (period: string) => `12-month mean · ${period}`,
    rankNegative: (rank: number, total: number) => `${englishOrdinal(rank)} most negative year of ${total}`,
    gainYear: (year: number) => `Mass gain in ${year}`,
    lossYears: (count: number, total: number) => `Losses in ${count} of the last ${total} years`,
    cumulative: (value: string, year: number) => `Cumulative since ${year}: ${value}`,
  },
  hu: {
    all: "Teljes",
    recent: "Utolsó 10 év",
    rangeGroup: "Időtartomány",
    trendSince: (year: number) => `Lineáris trend ${year} óta`,
    monthlyMean: "12 havi átlag",
    loss: "Veszteség",
    gain: "Gyarapodás",
    runningMean: "10 éves átlag",
    sinceStart: (change: string, year: number) => `${change} ${year} óta`,
    recentRate: (recent: string, full: string, rateUnit: string) => `Utolsó 10 év: ${recent} ${rateUnit} · teljes időszak ${full}`,
    perYear: (unit: string) => `${unit}/év`,
    lossRate: (recent: string, full: string, year: number) => `Az utolsó 10 évben évi ${recent} Gt veszteség · ${year} óta évi ${full} Gt`,
    seaLevel: (mm: string) => `≈ ${mm} mm globális tengerszint-emelkedés`,
    seaLevelShort: (mm: string) => `≈ ${mm} mm tengerszint`,
    cumulativeSince: (year: number) => `${year} óta összesen`,
    baselineRatio: (ratio: string, label: string) => `a ${label}-es átlag ${ratio}-szerese`,
    decadeTrend: (value: string, unit: string) => `Trend: ${value} ${unit} évtizedenként`,
    monthlyValue: (value: string, unit: string) => `Havi érték: ${value} ${unit}`,
    meanTo: (period: string) => `12 havi átlag · ${period}`,
    rankNegative: (rank: number, total: number) => `${total} év közül a ${rank}. legnegatívabb`,
    gainYear: (year: number) => `${year}: tömeggyarapodás`,
    lossYears: (count: number, total: number) => `Az utolsó ${total} évből ${count}-ben veszteség`,
    cumulative: (value: string, year: number) => `Összesen ${year} óta: ${value}`,
  },
} as const;

const monthYearFormats = {
  en: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  hu: new Intl.DateTimeFormat("hu-HU", { month: "long", year: "numeric", timeZone: "UTC" }),
};
const shortMonthYearFormats = {
  en: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
  hu: new Intl.DateTimeFormat("hu-HU", { month: "short", year: "numeric", timeZone: "UTC" }),
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

export function TrendContextPanel({
  title,
  subtitle,
  data,
  variant,
  domain,
  unit,
  axisUnit,
  decimals,
  language,
  compact,
  dark,
  ready,
  baseline,
  freshnessLabel,
  freshnessTone,
  expandLabel,
  collapseLabel,
}: TrendContextPanelProps) {
  const [range, setRange] = useState<TrendContextRange>("all");
  const copy = COPY[language];
  const isLine = data.kind === "line";
  const startYear = new Date(data.first.time).getUTCFullYear();
  const palette = trendContextPalette(dark, domain);

  const formatNumber = (value: number, digits: number, signed = false) => {
    const formatted = numberFormat(language, digits).format(Math.abs(value));
    if (value < 0 && Number(formatted.replace(/[^\d]/g, "")) !== 0) return `−${formatted}`;
    return signed ? `+${formatted}` : formatted;
  };
  const seaLevelMm = (gigatonnes: number) => formatNumber(gigatonnes / GT_PER_MM_SEA_LEVEL, 1);

  const option = useMemo(
    () =>
      buildTrendContextOption({
        data,
        range,
        unit,
        axisUnit,
        decimals,
        compact,
        dark,
        domain,
        inverse: variant === "loss",
        zeroArea: variant === "imbalance",
        showTrend: isLine,
        formatNumber,
        formatTooltipDate: (time) => shortMonthYearFormats[language].format(new Date(time)),
        labels: {
          trend: copy.trendSince(startYear),
          runningMean: copy.runningMean,
          tooltipExtra: (time, value) => {
            if (variant === "rise") return copy.sinceStart(`${formatNumber(value - data.first.value, decimals, true)} ${unit}`, startYear);
            if (variant === "loss") return copy.seaLevelShort(seaLevelMm(value));
            if (variant === "imbalance") {
              const raw = data.raw?.get(time);
              return raw == null ? null : copy.monthlyValue(formatNumber(raw, decimals, true), unit);
            }
            return null;
          },
        },
      }),
    // formatNumber, copy and the tooltip text derive from language.
    [data, range, unit, axisUnit, decimals, compact, dark, domain, variant, isLine, language, startYear]
  );

  const latest = data.latest;
  const latestYear = Number(latest.date.slice(0, 4));
  const latestPeriod = monthYearFormats[language].format(new Date(latest.time));
  const kicker =
    variant === "annual"
      ? String(latestYear)
      : variant === "imbalance"
        ? copy.meanTo(latestPeriod)
        : variant === "loss"
          ? `${latestPeriod} · ${copy.cumulativeSince(startYear)}`
          : latestPeriod;

  const rateUnit = copy.perYear(unit);
  const chips: Array<{ text: string; alert?: boolean }> = [];
  if (variant === "rise") {
    chips.push({ text: copy.sinceStart(`${formatNumber(latest.value - data.first.value, decimals, true)} ${unit}`, startYear), alert: true });
    if (data.recentRatePerYear != null && data.fullRatePerYear != null) {
      chips.push({ text: copy.recentRate(formatNumber(data.recentRatePerYear, decimals, true), formatNumber(data.fullRatePerYear, decimals, true), rateUnit) });
    }
  } else if (variant === "loss") {
    chips.push({ text: copy.seaLevel(seaLevelMm(latest.value)), alert: true });
    if (data.recentRatePerYear != null && data.fullRatePerYear != null) {
      chips.push({ text: copy.lossRate(formatNumber(data.recentRatePerYear, 0), formatNumber(data.fullRatePerYear, 0), startYear) });
    }
  } else if (variant === "imbalance") {
    if (baseline?.mean && baseline.mean > 0) {
      chips.push({ text: copy.baselineRatio(formatNumber(latest.value / baseline.mean, 1), baseline.label), alert: latest.value > baseline.mean });
    }
    if (data.fullRatePerYear != null) chips.push({ text: copy.decadeTrend(formatNumber(data.fullRatePerYear * 10, decimals, true), unit) });
  } else if (data.annual) {
    const annual = data.annual;
    chips.push(
      latest.value < 0
        ? { text: copy.rankNegative(annual.rankOfLatest, annual.total), alert: annual.rankOfLatest <= 5 }
        : { text: copy.gainYear(latestYear) }
    );
    chips.push({ text: copy.lossYears(annual.lossYearsInRecent, annual.recentYearCount), alert: annual.lossYearsInRecent === annual.recentYearCount });
    chips.push({ text: copy.cumulative(`${formatNumber(annual.cumulative, decimals, true)} ${unit}`, startYear) });
  }

  const swatch = (style: CSSProperties) => <i style={style} aria-hidden="true" />;
  const legend: Array<{ key: string; icon: ReactNode; label: string }> = isLine
    ? [
        ...(variant === "imbalance"
          ? [{ key: "mean", icon: swatch({ background: palette.signal, height: 3 }), label: copy.monthlyMean }]
          : []),
        {
          key: "trend",
          icon: swatch({ background: `repeating-linear-gradient(90deg, ${palette.trend} 0 5px, transparent 5px 8px)`, height: 2 }),
          label: copy.trendSince(startYear),
        },
      ]
    : [
        { key: "loss", icon: swatch({ background: palette.loss }), label: copy.loss },
        { key: "gain", icon: swatch({ background: palette.gain }), label: copy.gain },
        { key: "mean", icon: swatch({ background: palette.context, height: 3 }), label: copy.runningMean },
      ];

  // Alert chips take the topic colour, like the line (glacier bars report losses, so they stay red).
  const chipAccent = variant === "annual" ? "var(--domain-temperature)" : `var(--domain-${domain})`;
  const intro = (
    <div className="daily-context-intro" style={{ "--chip-accent": chipAccent } as CSSProperties}>
      <div className="daily-context-headline">
        <p className="daily-context-kicker">{ready ? kicker : " "}</p>
        <p className="daily-context-value">
          {ready ? (
            <>
              {formatNumber(latest.value, decimals, variant === "annual" || variant === "imbalance")}
              <small>{unit}</small>
            </>
          ) : (
            <span className="value-loading-skeleton daily-context-value-loading" aria-hidden="true" />
          )}
        </p>
        {ready && chips.length ? (
          <div className="daily-context-chips">
            {chips.map((chip) => (
              <span key={chip.text} className={`daily-context-chip ${chip.alert ? "is-alert" : ""}`}>
                {chip.text}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="daily-context-controls">
        {isLine ? (
          <div className="daily-context-range" role="group" aria-label={copy.rangeGroup}>
            {(["all", "recent"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>
                {value === "all" ? copy.all : copy.recent}
              </button>
            ))}
          </div>
        ) : null}
        <div className="daily-context-legend">
          {legend.map((item) => (
            <span key={item.key} className="daily-context-normal-key trend-context-key">
              {item.icon}
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <EChartsPanel
      className="daily-context-panel trend-context-panel"
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
