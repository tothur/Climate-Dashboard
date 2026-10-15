import { useState, type CSSProperties } from "react";
import type { Language } from "../domain/model";
import type { PathwaysData } from "../charts/pathways";

/**
 * Tipping thresholds on one shared warming scale: each element's assessed
 * range as a band and its central estimate as a dot, against current warming
 * (the vertical line) and where each pathway ends in 2100 (markers on the
 * scale). Rows sort by threshold or group by part of the Earth system.
 */

export type TippingState = "likely" | "possible" | "below";

export interface TippingLadderItem {
  key: string;
  label: string;
  /** English category, which decides the system group. */
  categoryKey: string;
  category: string;
  central: number;
  min: number;
  max: number;
  state: TippingState;
}

interface TippingLadderPanelProps {
  title: string;
  items: TippingLadderItem[];
  currentWarming: number | null;
  /** Current warming is this year's mean so far. */
  partial: boolean;
  currentYear: number | null;
  pathways: PathwaysData | null;
  unit: string;
  language: Language;
  dark: boolean;
  ready: boolean;
}

const AXIS_MAX = 10;
const AXIS_TICKS = [0, 2, 4, 6, 8, 10];
const PARIS_LIMIT = 2;

type SystemGroup = "cryosphere" | "circulation" | "biosphere";
const SYSTEM_GROUPS: SystemGroup[] = ["cryosphere", "circulation", "biosphere"];
const GROUP_OF: Record<string, SystemGroup> = {
  "Ice sheet": "cryosphere",
  "Sea ice": "cryosphere",
  Glaciers: "cryosphere",
  Permafrost: "cryosphere",
  "Ocean circulation": "circulation",
  Monsoon: "circulation",
  Ecosystem: "biosphere",
};

const COPY = {
  en: {
    kicker: (year: number | null, partial: boolean) => `Current warming${year ? ` · ${year}${partial ? " so far" : ""}` : ""} · vs 1850–1900`,
    withinRange: (count: number, total: number) => `Inside the assessed range of ${count} of ${total} thresholds`,
    aboveCentral: (count: number) => `Already past ${count} central thresholds`,
    belowParis: (count: number, total: number, level: string) => `${count} of ${total} could tip at or below ${level}`,
    order: "Order",
    byThreshold: "By threshold",
    bySystem: "By system",
    groups: { cryosphere: "Ice and frozen ground", circulation: "Ocean and atmosphere circulation", biosphere: "Ecosystems" } as Record<SystemGroup, string>,
    now: "Now",
    central: "Central threshold",
    range: "assessed range",
    states: { likely: "Above central threshold", possible: "Inside uncertainty range", below: "Below assessed range" } as Record<TippingState, string>,
    pathwaysIn2100: "Pathways in 2100",
    passedAll: "Every pathway passes its central threshold",
    passedSome: (names: string) => `Central threshold passed by 2100 on: ${names}`,
    passedNone: "No pathway reaches its central threshold by 2100",
    legendBand: "Band: assessed range · dot: central threshold",
  },
  hu: {
    kicker: (year: number | null, partial: boolean) => `Jelenlegi melegedés${year ? ` · ${year}${partial ? ", eddig" : ""}` : ""} · az 1850–1900-as szinthez képest`,
    withinRange: (count: number, total: number) => `${total} küszöbből ${count} becsült tartományán belül`,
    aboveCentral: (count: number) => `${count} központi küszöböt már meghaladott`,
    belowParis: (count: number, total: number, level: string) => `${total} közül ${count} már legfeljebb ${level}-on átbillenhet`,
    order: "Sorrend",
    byThreshold: "Küszöb szerint",
    bySystem: "Rendszer szerint",
    groups: { cryosphere: "Jég és fagyott talaj", circulation: "Óceáni és légköri áramlások", biosphere: "Ökoszisztémák" } as Record<SystemGroup, string>,
    now: "Most",
    central: "Központi küszöb",
    range: "becsült tartomány",
    states: { likely: "A központi küszöb felett", possible: "A bizonytalansági tartományban", below: "A becsült tartomány alatt" } as Record<TippingState, string>,
    pathwaysIn2100: "Pályák 2100-ban",
    passedAll: "Minden pálya túllépi a központi küszöböt",
    passedSome: (names: string) => `2100-ig túllépi a központi küszöböt: ${names}`,
    passedNone: "2100-ig egyik pálya sem éri el a központi küszöböt",
    legendBand: "Sáv: becsült tartomány · pont: központi küszöb",
  },
} as const;

const percent = (value: number) => `${Math.min(Math.max((value / AXIS_MAX) * 100, 0), 100)}%`;

export function TippingLadderPanel({ title, items, currentWarming, partial, currentYear, pathways, unit, language, dark, ready }: TippingLadderPanelProps) {
  const copy = COPY[language];
  const [order, setOrder] = useState<"threshold" | "system">("threshold");
  const numberFormat = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const format = (value: number) => numberFormat.format(value);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${unit}`;
  const sorted = [...items].sort((a, b) => a.central - b.central || a.min - b.min);
  const scenarios = pathways ? [...pathways.scenarios].sort((a, b) => a.end - b.end) : [];

  const within = items.filter((item) => item.state !== "below").length;
  const above = items.filter((item) => item.state === "likely").length;
  const belowParis = items.filter((item) => item.central <= PARIS_LIMIT).length;
  const chips = [
    { text: copy.withinRange(within, items.length), alert: true },
    ...(above ? [{ text: copy.aboveCentral(above), alert: false }] : []),
    { text: copy.belowParis(belowParis, items.length, `${PARIS_LIMIT} ${unit}`), alert: false },
  ];

  const pathwayNote = (item: TippingLadderItem) => {
    if (!scenarios.length) return null;
    const passed = scenarios.filter((scenario) => Math.max(scenario.peak.value, scenario.end) >= item.central);
    if (passed.length === scenarios.length) return copy.passedAll;
    if (!passed.length) return copy.passedNone;
    return copy.passedSome(passed.map((scenario) => scenario.label).join(", "));
  };

  const row = (item: TippingLadderItem) => (
    <li className={`tipping-ladder-row state-${item.state}`} key={item.key} tabIndex={0}>
      <div className="tipping-ladder-label">
        <strong>{item.label}</strong>
        <span>{item.category}</span>
      </div>
      <div
        className="tipping-ladder-track"
        role="img"
        aria-label={`${item.label}: ${copy.central} ${format(item.central)} ${unit}, ${copy.range} ${format(item.min)}–${format(item.max)} ${unit}. ${copy.states[item.state]}.`}
      >
        <span className="tipping-ladder-guide" style={{ left: percent(1.5) }} />
        <span className="tipping-ladder-guide" style={{ left: percent(2) }} />
        <span className="tipping-ladder-range" style={{ left: percent(item.min), width: `calc(${percent(item.max)} - ${percent(item.min)})` }} />
        <span className="tipping-ladder-central" style={{ left: percent(item.central) }} />
        <span className="tipping-ladder-now" />
      </div>
      <div className="tipping-ladder-value">
        <strong>
          {format(item.central)} {unit}
        </strong>
        <small>
          {format(item.min)}–{format(item.max)}
        </small>
      </div>
      <div className="tipping-ladder-tip" aria-hidden="true">
        <strong>{item.label}</strong>
        <span>
          {copy.central}: {format(item.central)} {unit} · {copy.range} {format(item.min)}–{format(item.max)} {unit}
        </span>
        <span className={`tipping-ladder-tip-state state-${item.state}`}>{copy.states[item.state]}</span>
        {pathwayNote(item) ? <span>{pathwayNote(item)}</span> : null}
      </div>
    </li>
  );

  return (
    <article
      className="panel tipping-ladder-panel"
      id="chart-tipping-points"
      data-toc-anchor=""
      style={{ "--chip-accent": "var(--domain-temperature)" } as CSSProperties}
    >
      <header className="panel-header">
        <div className="panel-header-main">
          <h2>{title}</h2>
        </div>
      </header>
      <div className="daily-context-intro">
        <div className="daily-context-headline">
          <p className="daily-context-kicker">{ready ? copy.kicker(currentYear, partial) : " "}</p>
          <p className="daily-context-value">
            {ready && currentWarming != null ? (
              <>
                {signed(currentWarming).replace(` ${unit}`, "")}
                <small>{unit}</small>
              </>
            ) : (
              <span className="value-loading-skeleton daily-context-value-loading" aria-hidden="true" />
            )}
          </p>
          {ready ? (
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
          <div className="daily-context-range" role="group" aria-label={copy.order}>
            {(["threshold", "system"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={order === value} onClick={() => setOrder(value)}>
                {value === "threshold" ? copy.byThreshold : copy.bySystem}
              </button>
            ))}
          </div>
          <div className="daily-context-legend tipping-ladder-legend">
            <span className="state-likely">{copy.states.likely}</span>
            <span className="state-possible">{copy.states.possible}</span>
            <span className="state-below">{copy.states.below}</span>
          </div>
        </div>
      </div>
      <ol
        className="tipping-ladder"
        style={{ "--tipping-now": percent(currentWarming ?? 0) } as CSSProperties}
      >
        <li className="tipping-ladder-axis" aria-hidden="true">
          <span className="tipping-ladder-axis-note">{scenarios.length ? copy.pathwaysIn2100 : null}</span>
          <div className="tipping-ladder-scale">
            {AXIS_TICKS.map((tick) => (
              <span key={tick} style={{ left: percent(tick) }}>
                {tick} {unit}
              </span>
            ))}
            {currentWarming != null ? (
              <strong className="tipping-ladder-now-label">
                {copy.now} {format(currentWarming)}
              </strong>
            ) : null}
            {scenarios.map((scenario) => (
              <i
                key={scenario.key}
                className="tipping-ladder-pathway"
                title={`${scenario.label}: ${signed(scenario.end)}`}
                style={{ left: percent(scenario.end), "--pathway-color": dark ? scenario.colorDark : scenario.colorLight } as CSSProperties}
              />
            ))}
          </div>
          <span />
        </li>
        {order === "threshold"
          ? sorted.map(row)
          : SYSTEM_GROUPS.map((group) => {
              const members = sorted.filter((item) => (GROUP_OF[item.categoryKey] ?? "biosphere") === group);
              return members.length ? [
                <li className="tipping-ladder-group" key={`group-${group}`}>
                  {copy.groups[group]}
                </li>,
                ...members.map(row),
              ] : [];
            })}
      </ol>
      {scenarios.length ? (
        <div className="tipping-ladder-pathway-key">
          <span>{copy.pathwaysIn2100}:</span>
          {scenarios.map((scenario) => (
            <span key={scenario.key} style={{ "--pathway-color": dark ? scenario.colorDark : scenario.colorLight } as CSSProperties}>
              <i aria-hidden="true" />
              {scenario.label} {signed(scenario.end)}
            </span>
          ))}
          <span className="tipping-ladder-band-key">{copy.legendBand}</span>
        </div>
      ) : null}
    </article>
  );
}
