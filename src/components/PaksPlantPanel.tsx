import { useMemo, type CSSProperties } from "react";
import type { Language } from "../domain/model";
import type { EnergyHistoryPoint, PaksPlant } from "../data/energy-source";
import { buildPaksOutputOption } from "../charts/energyMix";
import { EChartsPanel } from "./EChartsPanel";

/**
 * Paks Nuclear Power Plant, built like every other chart card: a headline
 * with chips, a legend, then the plant's output over the last 24 hours
 * against its installed capacity. The four units (OAH unit-level operating
 * data) sit under the headline as compact tiles. Paks is Hungary's only
 * nuclear plant, so MAVIR's national nuclear category is its output history;
 * the latest MAVIR value is also shown as a cross-check of the OAH unit total.
 */

type FreshnessTone = "fresh" | "warning" | "stale";

const COPY = {
  en: {
    title: "Paks Nuclear Power Plant",
    subtitle: "Output over the last 24 hours and the state of its four units",
    output: "Current output · unit total",
    utilization: (pct: string) => `${pct}% of capacity`,
    units: (running: number, total: number) => `${running} of ${total} units generating`,
    share: (pct: string) => `${pct}% of domestic generation`,
    unit: (block: number) => `Unit ${block}`,
    notGenerating: "Not generating",
    unitsLabel: "Output of each unit",
    legendOutput: "Nuclear output",
    legendCapacity: "Installed capacity",
    capacity: "Capacity",
    crossCheck: (mavir: string, gap: string) => `MAVIR's national nuclear figure for the same interval: ${mavir} MW (${gap} MW).`,
    source: "OAH operating data",
  },
  hu: {
    title: "Paksi Atomerőmű",
    subtitle: "Teljesítmény az elmúlt 24 órában és a négy blokk állapota",
    output: "Jelenlegi teljesítmény · blokkok összege",
    utilization: (pct: string) => `A kapacitás ${pct}%-a`,
    units: (running: number, total: number) => `${total} blokkból ${running} termel`,
    share: (pct: string) => `A hazai termelés ${pct}%-a`,
    unit: (block: number) => `${block}. blokk`,
    notGenerating: "Nem termel",
    unitsLabel: "Az egyes blokkok teljesítménye",
    legendOutput: "Nukleáris termelés",
    legendCapacity: "Beépített kapacitás",
    capacity: "Kapacitás",
    crossCheck: (mavir: string, gap: string) => `A MAVIR országos nukleáris adata ugyanerre az időszakra: ${mavir} MW (${gap} MW).`,
    source: "OAH üzemi adatok",
  },
} as const;

// Below this a unit counts as offline (house load and metering noise).
const RUNNING_THRESHOLD_MW = 5;

interface PaksPlantPanelProps {
  plant: PaksPlant;
  history: EnergyHistoryPoint[];
  /** Domestic generation in the same snapshot, for the plant's share. */
  generationMW: number;
  language: Language;
  compact: boolean;
  dark: boolean;
  nuclearColor: string;
  formatTime: (time: number) => string;
  formatTooltipTime: (time: number) => string;
  expandLabel?: string;
  collapseLabel?: string;
  freshnessLabel?: string;
  freshnessTone?: FreshnessTone;
}

export function PaksPlantPanel({
  plant,
  history,
  generationMW,
  language,
  compact,
  dark,
  nuclearColor,
  formatTime,
  formatTooltipTime,
  expandLabel,
  collapseLabel,
  freshnessLabel,
  freshnessTone = "fresh",
}: PaksPlantPanelProps) {
  const copy = COPY[language];
  const number = useMemo(() => new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", { maximumFractionDigits: 0 }), [language]);
  const unitCapacity = plant.capacityMW / plant.blocks.length;
  const running = plant.blocks.filter((block) => block.mw > RUNNING_THRESHOLD_MW).length;
  const share = generationMW > 0 ? (plant.mw / generationMW) * 100 : null;
  const gap = plant.mavirCategoryMW == null ? null : plant.mavirCategoryMW - plant.mw;

  const option = useMemo(
    () =>
      buildPaksOutputOption({
        points: history
          .map((point) => [Date.parse(point.time), point.nuclearMW] as [number, number])
          .filter(([time, value]) => Number.isFinite(time) && Number.isFinite(value)),
        capacityMW: plant.capacityMW,
        labels: { output: copy.legendOutput, capacity: copy.capacity },
        compact,
        dark,
        formatNumber: (value) => number.format(Math.round(value)),
        formatTime,
        formatTooltipTime,
      }),
    [history, plant.capacityMW, copy, compact, dark, number, formatTime, formatTooltipTime]
  );

  const swatch = (style: CSSProperties) => <i style={style} aria-hidden="true" />;
  const intro = (
    <div className="daily-context-intro" style={{ "--chip-accent": "var(--domain-ocean)" } as CSSProperties}>
      <div className="daily-context-headline">
        <p className="daily-context-kicker">{copy.output}</p>
        <p className="daily-context-value">
          {number.format(plant.mw)}
          <small>MW</small>
        </p>
        <div className="daily-context-chips">
          <span className="daily-context-chip is-alert">{copy.utilization(number.format(plant.utilizationPct))}</span>
          <span className="daily-context-chip">{copy.units(running, plant.blocks.length)}</span>
          {share == null ? null : <span className="daily-context-chip">{copy.share(number.format(share))}</span>}
        </div>
      </div>
      <ul className="paks-units" aria-label={copy.unitsLabel} style={{ "--paks-unit-color": nuclearColor } as CSSProperties}>
        {plant.blocks.map((block) => {
          const isRunning = block.mw > RUNNING_THRESHOLD_MW;
          const percent = Math.min(100, Math.max(0, (block.mw / unitCapacity) * 100));
          return (
            <li key={block.block} className={isRunning ? "running" : "offline"}>
              <span className="paks-unit-name">{copy.unit(block.block)}</span>
              <strong className="paks-unit-value">{isRunning ? `${number.format(block.mw)} MW` : copy.notGenerating}</strong>
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
            </li>
          );
        })}
      </ul>
      <div className="daily-context-controls">
        <p className="paks-cross-check">
          {plant.mavirCategoryMW != null && gap != null
            ? `${copy.crossCheck(number.format(plant.mavirCategoryMW), `${gap > 0 ? "+" : gap < 0 ? "−" : "±"}${number.format(Math.abs(gap))}`)} `
            : null}
          <a href={plant.sourceUrl} target="_blank" rel="noreferrer">
            {copy.source}
          </a>
        </p>
        <div className="daily-context-legend">
          <span className="daily-context-normal-key trend-context-key">
            {swatch({ background: nuclearColor, height: 3 })}
            {copy.legendOutput}
          </span>
          <span className="daily-context-normal-key trend-context-key">
            {swatch({ background: "repeating-linear-gradient(90deg, var(--muted) 0 5px, transparent 5px 8px)", height: 2 })}
            {copy.legendCapacity}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <EChartsPanel
      anchorId="chart-energy-paks"
      className="daily-context-panel trend-context-panel paks-panel"
      title={copy.title}
      subtitle={copy.subtitle}
      intro={intro}
      option={option}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      freshnessLabel={freshnessLabel}
      freshnessTone={freshnessTone}
    />
  );
}
