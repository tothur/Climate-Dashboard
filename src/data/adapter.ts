import type {
  ClimateMetricKey,
  ClimateMetricSeries,
  ClimateMetricSource,
  ClimateSeriesBundle,
  DashboardDataSource,
  DashboardSnapshot,
  DailyPoint,
} from "../domain/model";
import { createBundledClimateSeries, CLIMATE_METRIC_KEYS } from "./bundled-sample";

// Exported for compatibility with copied files that still reference these symbols.
export const VIRO_ALL_KEY = "__all_series__";
export const INFLUENZA_ALL_KEY = "__unused_legacy_key__";

const INDICATOR_KEYS: ClimateMetricKey[] = [
  "global_surface_temperature",
  "global_sea_surface_temperature",
  "global_sea_ice_extent",
];

const FORCING_KEYS: ClimateMetricKey[] = ["atmospheric_co2"];

interface ClimateMetricMetadata {
  titleEn: string;
  titleHu: string;
  unit: string;
  decimals: number;
  source: ClimateMetricSource;
}

const METRIC_METADATA: Record<ClimateMetricKey, ClimateMetricMetadata> = {
  global_surface_temperature: {
    titleEn: "Global Surface Temperature",
    titleHu: "Globális felszíni hőmérséklet",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (ERA5)",
      descriptionEn: "ERA5 daily global 2m air temperature, published by Climate Reanalyzer.",
      descriptionHu: "ERA5 napi globális 2m levegőhőmérséklet, a Climate Reanalyzer közlésében.",
      url: "https://climatereanalyzer.org/clim/t2_daily/",
    },
  },
  global_sea_surface_temperature: {
    titleEn: "Global Sea Surface Temperature",
    titleHu: "Globális tengerfelszíni hőmérséklet",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (NOAA OISST v2.1)",
      descriptionEn: "NOAA OISST v2.1 daily global SST, published by Climate Reanalyzer.",
      descriptionHu: "NOAA OISST v2.1 napi globális SST, a Climate Reanalyzer közlésében.",
      url: "https://climatereanalyzer.org/clim/sst_daily/",
    },
  },
  global_sea_ice_extent: {
    titleEn: "Global Sea Ice Extent",
    titleHu: "Globális tengeri jégkiterjedés",
    unit: "million sq km",
    decimals: 2,
    source: {
      shortName: "NSIDC Sea Ice Index v4",
      descriptionEn: "Daily Arctic + Antarctic extent derived from NSIDC Sea Ice Index v4.",
      descriptionHu: "Napi északi + déli jégkiterjedés az NSIDC Sea Ice Index v4 alapján.",
      url: "https://nsidc.org/data/seaice_index/archives",
    },
  },
  atmospheric_co2: {
    titleEn: "Atmospheric CO2 (Mauna Loa)",
    titleHu: "Légköri CO2 (Mauna Loa)",
    unit: "ppm",
    decimals: 2,
    source: {
      shortName: "NOAA GML",
      descriptionEn: "Daily in-situ CO2 concentration at Mauna Loa, NOAA Global Monitoring Laboratory.",
      descriptionHu: "Napi in-situ CO2 koncentráció a Mauna Loa állomáson, NOAA GML.",
      url: "https://gml.noaa.gov/ccgg/trends/",
    },
  },
};

function parseDate(input: string): number | null {
  const timestamp = Date.parse(`${input}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizePoints(points: DailyPoint[]): DailyPoint[] {
  const bucket = new Map<string, number>();
  for (const point of points) {
    const date = String(point.date ?? "").trim();
    const value = Number(point.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isFinite(value)) continue;
    bucket.set(date, value);
  }

  return Array.from(bucket.entries())
    .sort((a, b) => {
      const left = parseDate(a[0]);
      const right = parseDate(b[0]);
      if (left == null || right == null) return 0;
      return left - right;
    })
    .map(([date, value]) => ({ date, value }));
}

function buildSeriesForKey(key: ClimateMetricKey, points: DailyPoint[]): ClimateMetricSeries {
  const normalizedPoints = normalizePoints(points);
  const latest = normalizedPoints.length ? normalizedPoints[normalizedPoints.length - 1] : null;
  const metadata = METRIC_METADATA[key];

  return {
    key,
    titleEn: metadata.titleEn,
    titleHu: metadata.titleHu,
    unit: metadata.unit,
    decimals: metadata.decimals,
    points: normalizedPoints,
    latestDate: latest?.date ?? null,
    latestValue: latest?.value ?? null,
    source: metadata.source,
  };
}

function mergeSeriesWithBundled(input: Partial<ClimateSeriesBundle>): ClimateSeriesBundle {
  const bundled = createBundledClimateSeries();
  const merged = { ...bundled };

  for (const key of CLIMATE_METRIC_KEYS) {
    const candidate = input[key];
    if (!candidate || !candidate.length) continue;
    const normalized = normalizePoints(candidate);
    if (normalized.length) merged[key] = normalized;
  }

  return merged;
}

export function createBundledDataSource(note?: string): DashboardDataSource {
  return {
    sourceMode: "bundled",
    series: createBundledClimateSeries(),
    warnings: note ? [note] : [],
    updatedAtIso: new Date().toISOString(),
  };
}

export function createDataSourceFromSeries(input: {
  series: Partial<ClimateSeriesBundle>;
  warnings?: string[];
  updatedAtIso?: string;
}): DashboardDataSource {
  const mergedSeries = mergeSeriesWithBundled(input.series);
  const liveCount = CLIMATE_METRIC_KEYS.filter((key) => {
    const candidate = input.series[key];
    return Array.isArray(candidate) && candidate.length > 0;
  }).length;

  const sourceMode = liveCount === CLIMATE_METRIC_KEYS.length ? "live" : liveCount > 0 ? "mixed" : "bundled";

  return {
    sourceMode,
    series: mergedSeries,
    warnings: [...(input.warnings ?? [])],
    updatedAtIso: input.updatedAtIso ?? new Date().toISOString(),
  };
}

export function buildDashboardSnapshot(dataSource: DashboardDataSource): DashboardSnapshot {
  const indicators = INDICATOR_KEYS.map((key) => buildSeriesForKey(key, dataSource.series[key]));
  const forcing = FORCING_KEYS.map((key) => buildSeriesForKey(key, dataSource.series[key]));

  return {
    indicators,
    forcing,
    sourceMode: dataSource.sourceMode,
    warnings: dataSource.warnings,
    updatedAtIso: dataSource.updatedAtIso,
  };
}
