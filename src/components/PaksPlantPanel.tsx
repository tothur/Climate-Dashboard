import type { Language } from "../domain/model";
import type { PaksPlant } from "../data/energy-source";

/**
 * Paks Nuclear Power Plant: the plant's output, how much of its capacity is in
 * use and each of its four units, from the Hungarian Atomic Energy Authority's
 * unit-level operating data. MAVIR's national nuclear figure is shown as an
 * independent cross-check. Unit meters use the nuclear colour of the
 * generation chart above, so the two read as one story.
 */

type FreshnessTone = "fresh" | "warning" | "stale";

const COPY = {
  en: {
    title: "Paks Nuclear Power Plant",
    subtitle: "Hungary's only nuclear plant, unit by unit",
    output: "Current output",
    utilization: (pct: string, capacity: string) => `${pct}% of its ${capacity} MW capacity`,
    units: (running: number, total: number) => `${running} of ${total} units generating`,
    share: (pct: string) => `${pct}% of domestic generation`,
    unit: (block: number) => `Unit ${block}`,
    notGenerating: "Not generating",
    unitsLabel: "Output of each unit",
    crossCheck: (mavir: string, gap: string) =>
      `Cross-check: MAVIR's national nuclear figure for the same time is ${mavir} MW, ${gap} MW from the unit total.`,
    source: "OAH operating data",
  },
  hu: {
    title: "Paksi Atomerőmű",
    subtitle: "Magyarország egyetlen atomerőműve, blokkonként",
    output: "Jelenlegi teljesítmény",
    utilization: (pct: string, capacity: string) => `A ${capacity} MW-os kapacitás ${pct}%-a`,
    units: (running: number, total: number) => `${total} blokkból ${running} termel`,
    share: (pct: string) => `A hazai termelés ${pct}%-a`,
    unit: (block: number) => `${block}. blokk`,
    notGenerating: "Nem termel",
    unitsLabel: "Az egyes blokkok teljesítménye",
    crossCheck: (mavir: string, gap: string) =>
      `Ellenőrzés: a MAVIR országos nukleáris adata ugyanerre az időpontra ${mavir} MW, ${gap} MW eltérés a blokkok összegétől.`,
    source: "OAH üzemi adatok",
  },
} as const;

// Below this a unit counts as offline (house load and metering noise).
const RUNNING_THRESHOLD_MW = 5;

interface PaksPlantPanelProps {
  plant: PaksPlant;
  /** Domestic generation in the same snapshot, for the plant's share. */
  generationMW: number;
  language: Language;
  nuclearColor: string;
  freshnessLabel?: string;
  freshnessTone?: FreshnessTone;
}

export function PaksPlantPanel({ plant, generationMW, language, nuclearColor, freshnessLabel, freshnessTone = "fresh" }: PaksPlantPanelProps) {
  const copy = COPY[language];
  const number = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", { maximumFractionDigits: 0 });
  const unitCapacity = plant.capacityMW / plant.blocks.length;
  const running = plant.blocks.filter((block) => block.mw > RUNNING_THRESHOLD_MW).length;
  const share = generationMW > 0 ? (plant.mw / generationMW) * 100 : null;
  const gap = plant.mavirCategoryMW == null ? null : plant.mavirCategoryMW - plant.mw;

  return (
    <article id="chart-energy-paks" data-toc-anchor="" className="panel paks-panel" style={{ ["--paks-unit-color" as string]: nuclearColor }}>
      <header className="panel-header">
        <div className="panel-header-main">
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
      </header>

      {/* The same headline and chips as the charts on the Climate system pages. */}
      <div className="daily-context-intro" style={{ ["--chip-accent" as string]: "var(--domain-ocean)" }}>
        <div className="daily-context-headline">
          <p className="daily-context-kicker">{copy.output}</p>
          <p className="daily-context-value">
            {number.format(plant.mw)}
            <small>MW</small>
          </p>
          <div className="daily-context-chips">
            <span className="daily-context-chip is-alert">
              {copy.utilization(number.format(plant.utilizationPct), number.format(plant.capacityMW))}
            </span>
            <span className="daily-context-chip">{copy.units(running, plant.blocks.length)}</span>
            {share == null ? null : <span className="daily-context-chip">{copy.share(number.format(share))}</span>}
          </div>
        </div>
      </div>

      <ul className="paks-units" aria-label={copy.unitsLabel}>
        {plant.blocks.map((block) => {
          const isRunning = block.mw > RUNNING_THRESHOLD_MW;
          const percent = Math.min(100, Math.max(0, (block.mw / unitCapacity) * 100));
          return (
            <li key={block.block} className={isRunning ? "running" : "offline"}>
              <span className="paks-unit-name">{copy.unit(block.block)}</span>
              <span
                className="paks-unit-meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={Math.round(unitCapacity)}
                aria-valuenow={Math.round(block.mw)}
                aria-label={copy.unit(block.block)}
              >
                <span style={{ width: `${percent}%` }} />
              </span>
              <span className="paks-unit-value">{isRunning ? `${number.format(block.mw)} MW` : copy.notGenerating}</span>
            </li>
          );
        })}
      </ul>

      {plant.mavirCategoryMW != null && gap != null ? (
        <p className="paks-cross-check">
          {copy.crossCheck(number.format(plant.mavirCategoryMW), `${gap > 0 ? "+" : gap < 0 ? "−" : "±"}${number.format(Math.abs(gap))}`)}{" "}
          <a href={plant.sourceUrl} target="_blank" rel="noreferrer">
            {copy.source}
          </a>
        </p>
      ) : null}

      {freshnessLabel ? (
        <div className="panel-chart-footer">
          <span className={`panel-freshness-chip ${freshnessTone}`}>{freshnessLabel}</span>
        </div>
      ) : null}
    </article>
  );
}
