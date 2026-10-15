import { useMemo, useState, type CSSProperties } from "react";
import type { Language } from "../domain/model";
import { buildPathwaysOption, PATHWAY_CROSSING_LEVEL, type PathwaysData } from "../charts/pathways";
import { trendContextPalette } from "../charts/trendContext";
import { EChartsPanel } from "./EChartsPanel";

type FreshnessTone = "fresh" | "warning" | "stale";

interface PathwaysPanelProps {
  title: string;
  subtitle?: string;
  anchorId?: string;
  data: PathwaysData;
  /** The latest observed year is still in progress (year to date). */
  partialLatest: boolean;
  /** The reference period of the anomalies, e.g. "1850–1900". */
  referenceLabel: string;
  unit: string;
  language: Language;
  compact: boolean;
  dark: boolean;
  ready: boolean;
  /** Overview card: headline, chips and pathway toggles only. */
  summary?: boolean;
  freshnessLabel?: string;
  freshnessTone?: FreshnessTone;
  expandLabel?: string;
  collapseLabel?: string;
}

const COPY = {
  en: {
    soFar: "so far",
    vsReference: (label: string) => `vs ${label}`,
    observed: "Observed",
    observedAnnual: "Observed annual",
    runningMean: "10-year average",
    partial: "YTD",
    parisRange: (range: string) => `Paris goal range, ${range}`,
    future: "Pathways · central estimates",
    crossingKey: (level: string) => `Year a pathway reaches ${level}`,
    pathwaysGroup: "Show pathways",
    in2100: "in 2100",
    crossingRange: (level: string, first: string, last: string) => `${level} reached around ${first} to ${last}`,
    crossingOne: (level: string, entry: string) => `${level} reached around ${entry}`,
    peaks: (label: string, peak: string, decade: number, end: string) => `${label} pathway peaks at ${peak} in the ${decade}s, then eases to ${end}`,
    staysBelow: (label: string, level: string, end: string) => `${label} pathway stays below ${level} (${end} in 2100)`,
    firstAbove: (level: string, year: number) => `First calendar year above ${level}: ${year}`,
  },
  hu: {
    soFar: "eddig",
    vsReference: (label: string) => `${/^1/.test(label) ? "az" : "a"} ${label}-as szinthez képest`,
    observed: "Mért",
    observedAnnual: "Mért éves érték",
    runningMean: "10 éves átlag",
    partial: "eddig",
    parisRange: (range: string) => `Párizsi céltartomány, ${range}`,
    future: "Pályák · központi becslések",
    crossingKey: (level: string) => `A ${level} elérésének éve`,
    pathwaysGroup: "Pályák megjelenítése",
    in2100: "2100-ban",
    crossingRange: (level: string, first: string, last: string) => `${level} elérése nagyjából ${first} és ${last} között`,
    crossingOne: (level: string, entry: string) => `${level} elérése nagyjából ${entry}`,
    peaks: (label: string, peak: string, decade: number, end: string) => `${label} pálya: csúcs ${peak} a ${decade}-as években, 2100-ra ${end}`,
    staysBelow: (label: string, level: string, end: string) => `${label} pálya: ${level} alatt marad (2100-ban ${end})`,
    firstAbove: (level: string, year: number) => `Az első ${level} feletti naptári év: ${year}`,
  },
} as const;

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(language: Language, decimals: number): Intl.NumberFormat {
  const key = `${language}:${decimals}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numberFormats.set(key, format);
  }
  return format;
}

export function PathwaysPanel({
  title,
  subtitle,
  anchorId,
  data,
  partialLatest,
  referenceLabel,
  unit,
  language,
  compact,
  dark,
  ready,
  summary = false,
  freshnessLabel,
  freshnessTone,
  expandLabel,
  collapseLabel,
}: PathwaysPanelProps) {
  const copy = COPY[language];
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const palette = trendContextPalette(dark, "temperature");

  const formatNumber = (value: number, digits: number, signed = false) => {
    const formatted = numberFormat(language, digits).format(Math.abs(value));
    if (value < 0 && Number(formatted.replace(/[^\d]/g, "")) !== 0) return `−${formatted}`;
    return signed ? `+${formatted}` : formatted;
  };
  const signedValue = (value: number) => `${formatNumber(value, 2, value > 0)} ${unit}`;
  const level = (value: number) => `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} ${unit}`;

  const option = useMemo(
    () =>
      buildPathwaysOption({
        data,
        hidden,
        // A pathway hidden while focused (clicking its toggle) no longer fades the rest.
        focus: focus && !hidden.has(focus) ? focus : null,
        partialLatest,
        unit,
        compact,
        dark,
        formatNumber,
        labels: {
          observed: copy.observed,
          runningMean: copy.runningMean,
          partial: copy.partial,
          parisRange: copy.parisRange(`${formatNumber(1.5, 1)}–${level(2)}`),
          future: copy.future,
        },
      }),
    // formatNumber and copy derive from language.
    [data, hidden, focus, partialLatest, unit, compact, dark, language]
  );

  // Pathways stay toggleable, but hiding the last one shows them all again.
  const toggle = (key: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size >= data.scenarios.length ? new Set() : next;
    });

  const chips: Array<{ text: string; alert?: boolean }> = [];
  const crossing = data.scenarios.filter((scenario) => scenario.crossing != null).sort((a, b) => (a.crossing ?? 0) - (b.crossing ?? 0));
  const entry = (scenario: (typeof crossing)[number]) => `${scenario.crossing} (${scenario.label})`;
  if (crossing.length > 1) {
    chips.push({ text: copy.crossingRange(level(PATHWAY_CROSSING_LEVEL), entry(crossing[0]), entry(crossing[crossing.length - 1])), alert: true });
  } else if (crossing.length === 1) {
    chips.push({ text: copy.crossingOne(level(PATHWAY_CROSSING_LEVEL), entry(crossing[0])), alert: true });
  }
  for (const scenario of data.scenarios.filter((entry) => entry.crossing == null)) {
    chips.push({
      text:
        scenario.peak.value - scenario.end >= 0.05
          ? copy.peaks(scenario.label, signedValue(scenario.peak.value), Math.floor(scenario.peak.year / 10) * 10, signedValue(scenario.end))
          : copy.staysBelow(scenario.label, level(PATHWAY_CROSSING_LEVEL), signedValue(scenario.end)),
    });
  }
  if (!summary) {
    const complete = partialLatest ? data.observed.slice(0, -1) : data.observed;
    const firstAbove = complete.find(([, value]) => value > 1.5);
    if (firstAbove) chips.push({ text: copy.firstAbove(level(1.5), firstAbove[0]) });
  }

  const ordered = [...data.scenarios].sort((a, b) => b.end - a.end);
  const swatch = (style: CSSProperties) => <i style={style} aria-hidden="true" />;
  const intro = (
    <div className="daily-context-intro pathways-intro">
      <div className="daily-context-headline">
        <p className="daily-context-kicker">
          {ready ? `${data.latest.year}${partialLatest ? ` ${copy.soFar}` : ""} · ${copy.vsReference(referenceLabel)}` : " "}
        </p>
        <p className="daily-context-value">
          {ready ? (
            <>
              {formatNumber(data.latest.value, 2, data.latest.value > 0)}
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
        <div className="pathway-toggles" role="group" aria-label={copy.pathwaysGroup}>
          {ordered.map((scenario) => {
            const color = dark ? scenario.colorDark : scenario.colorLight;
            return (
              <button
                key={scenario.key}
                type="button"
                aria-pressed={!hidden.has(scenario.key)}
                style={{ "--pathway-color": color } as CSSProperties}
                onClick={() => toggle(scenario.key)}
                onMouseEnter={() => !hidden.has(scenario.key) && setFocus(scenario.key)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => !hidden.has(scenario.key) && setFocus(scenario.key)}
                onBlur={() => setFocus(null)}
              >
                <i aria-hidden="true" />
                <span>{scenario.label}</span>
                <strong>{signedValue(scenario.end)}</strong>
                <span className="visually-hidden">{copy.in2100}</span>
              </button>
            );
          })}
        </div>
        {summary ? null : (
          <div className="daily-context-legend">
            <span className="daily-context-normal-key trend-context-key">
              {swatch({ background: palette.context, height: 3 })}
              {copy.runningMean}
            </span>
            <span className="daily-context-normal-key trend-context-key">
              {swatch({ background: dark ? "rgba(238, 243, 239, 0.5)" : "rgba(25, 39, 34, 0.4)", height: 1 })}
              {copy.observedAnnual}
            </span>
            <span className="daily-context-normal-key trend-context-key">
              {swatch({ background: dark ? "rgba(242, 130, 115, 0.22)" : "rgba(197, 76, 64, 0.16)", boxShadow: "none" })}
              {copy.parisRange(`${formatNumber(1.5, 1)}–${level(2)}`)}
            </span>
            <span className="daily-context-normal-key trend-context-key">
              {swatch({ width: 8, height: 8, borderRadius: "50%", background: "transparent", boxShadow: `inset 0 0 0 2px ${palette.context}` })}
              {copy.crossingKey(level(PATHWAY_CROSSING_LEVEL))}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <EChartsPanel
      className={`daily-context-panel trend-context-panel pathways-panel${summary ? " is-summary" : ""}`}
      title={title}
      subtitle={subtitle}
      anchorId={anchorId}
      showExpand={!summary}
      intro={intro}
      option={option}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      freshnessLabel={freshnessLabel}
      freshnessTone={freshnessTone}
    />
  );
}
