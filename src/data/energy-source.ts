import { useEffect, useState } from "react";

/**
 * The Hungarian electricity-system snapshot published by
 * scripts/update-energy-data.mjs (MAVIR RTDW, 15-minute intervals). The
 * updater only writes a snapshot that passed its reconciliation checks; the
 * page re-reads it every minute while it is open.
 */

export const ENERGY_SNAPSHOT_PATH = "./data/energy/hungary-latest.json";
const ENERGY_POLL_INTERVAL_MS = 60_000;

/** Generation categories of the 24-hour history, in stacking order. */
export const ENERGY_MIX_KEYS = ["nuclearMW", "fossilMW", "renewableMW", "solarMW", "otherMW", "unallocatedMW"] as const;
export type EnergyMixKey = (typeof ENERGY_MIX_KEYS)[number];

export interface EnergyHistoryPoint {
  time: string;
  loadMW: number;
  generationMW: number;
  importMW: number;
  nuclearMW: number;
  solarMW: number;
  fossilMW: number;
  renewableMW: number;
  otherMW: number;
  unallocatedMW: number;
}

export interface EnergySnapshot {
  generatedAt: string;
  measuredAt: string;
  source: { primary: string; systemUrl: string };
  system: {
    consumptionMW: number;
    generationMW: number;
    netImportMW: number;
    domesticCoveragePct: number;
    lowCarbonSharePct: number;
  };
  movement15m: {
    elapsedMinutes: number;
    consumptionMW: number;
    generationMW: number;
    netImportMW: number;
  } | null;
  history24h: EnergyHistoryPoint[];
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function parseEnergySnapshot(raw: unknown): EnergySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<EnergySnapshot>;
  const system = data.system;
  if (!system || ![system.consumptionMW, system.generationMW, system.netImportMW].every(finite)) return null;
  if (typeof data.measuredAt !== "string" || !Number.isFinite(Date.parse(data.measuredAt))) return null;
  const history = Array.isArray(data.history24h)
    ? data.history24h.filter(
        (point) => point && Number.isFinite(Date.parse(point.time)) && ENERGY_MIX_KEYS.every((key) => finite(point[key]))
      )
    : [];
  const movement = data.movement15m;
  return {
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : data.measuredAt,
    measuredAt: data.measuredAt,
    source: {
      primary: data.source?.primary ?? "MAVIR",
      systemUrl: data.source?.systemUrl ?? "https://www.mavir.hu/web/mavir/rendszerterheles",
    },
    system,
    movement15m:
      movement && [movement.consumptionMW, movement.generationMW, movement.netImportMW].every(finite) ? movement : null,
    history24h: history,
  };
}

export async function loadEnergySnapshot(signal?: AbortSignal): Promise<EnergySnapshot | null> {
  try {
    const response = await fetch(`${ENERGY_SNAPSHOT_PATH}?v=${Date.now()}`, { cache: "no-store", signal });
    if (!response.ok) return null;
    return parseEnergySnapshot(await response.json());
  } catch {
    return null;
  }
}

/**
 * The latest snapshot while `active`; refreshed every minute and whenever the
 * tab becomes visible again. A failed refresh keeps the last good snapshot.
 */
export function useEnergySnapshot(active: boolean): { snapshot: EnergySnapshot | null; loaded: boolean } {
  const [snapshot, setSnapshot] = useState<EnergySnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    const refresh = async () => {
      const next = await loadEnergySnapshot(controller.signal);
      if (cancelled) return;
      if (next) setSnapshot((current) => (current?.generatedAt === next.generatedAt ? current : next));
      setLoaded(true);
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, ENERGY_POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  return { snapshot, loaded };
}
