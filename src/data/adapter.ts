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
  "global_mean_sea_level",
  "ocean_heat_content",
  "northern_hemisphere_surface_temperature",
  "arctic_surface_temperature",
  "north_atlantic_sea_surface_temperature",
  "southern_hemisphere_surface_temperature",
  "antarctic_surface_temperature",
  "global_surface_temperature_anomaly",
  "global_sea_surface_temperature_anomaly",
  "daily_global_mean_temperature_anomaly",
  "global_sea_ice_extent",
  "arctic_sea_ice_extent",
  "antarctic_sea_ice_extent",
];

const FORCING_KEYS: ClimateMetricKey[] = ["atmospheric_co2", "atmospheric_ch4", "atmospheric_aggi"];

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
  global_mean_sea_level: {
    titleEn: "Global Mean Sea Level",
    titleHu: "Globális átlagos tengerszint",
    unit: "mm",
    decimals: 1,
    source: {
      shortName: "CU Sea Level Research Group",
      descriptionEn: "Global mean sea-level anomaly time series from the University of Colorado Sea Level Research Group.",
      descriptionHu: "Globális átlagos tengerszint-anomália idősor a Coloradói Egyetem Sea Level Research Group adataiból.",
      url: "https://sealevel.colorado.edu/files/2025_rel1/gmsl_2025rel1_seasons_rmvd.txt",
    },
  },
  ocean_heat_content: {
    titleEn: "Ocean Heat Content (0-2000m)",
    titleHu: "Óceáni hőtartalom (0-2000m)",
    unit: "10^22 J",
    decimals: 2,
    source: {
      shortName: "NOAA NCEI",
      descriptionEn: "Global 0-2000m ocean heat content (10^22 joules) from NOAA NCEI.",
      descriptionHu: "Globális 0-2000m óceáni hőtartalom (10^22 joule) a NOAA NCEI adataiból.",
      url: "https://www.ncei.noaa.gov/data/oceans/woa/DATA_ANALYSIS/3M_HEAT_CONTENT/DATA/basin/3month/ohc2000m_levitus_climdash_seasonal.csv",
    },
  },
  northern_hemisphere_surface_temperature: {
    titleEn: "Northern Hemisphere Surface Temperature",
    titleHu: "Északi félteke felszíni hőmérséklete",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (ERA5)",
      descriptionEn: "ERA5 daily Northern Hemisphere 2m air temperature, published by Climate Reanalyzer.",
      descriptionHu: "ERA5 napi északi féltekei 2m levegőhőmérséklet, a Climate Reanalyzer közlésében.",
      url: "https://climatereanalyzer.org/clim/t2_daily/",
    },
  },
  southern_hemisphere_surface_temperature: {
    titleEn: "Southern Hemisphere Surface Temperature",
    titleHu: "Déli félteke felszíni hőmérséklete",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (ERA5)",
      descriptionEn: "ERA5 daily Southern Hemisphere 2m air temperature, published by Climate Reanalyzer.",
      descriptionHu: "ERA5 napi déli féltekei 2m levegőhőmérséklet, a Climate Reanalyzer közlésében.",
      url: "https://climatereanalyzer.org/clim/t2_daily/",
    },
  },
  arctic_surface_temperature: {
    titleEn: "Arctic Surface Temperature",
    titleHu: "Arktiszi felszíni hőmérséklet",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (ERA5)",
      descriptionEn: "ERA5 daily Arctic 2m air temperature, published by Climate Reanalyzer.",
      descriptionHu: "ERA5 napi arktiszi 2m levegőhőmérséklet, a Climate Reanalyzer közlésében.",
      url: "https://climatereanalyzer.org/clim/t2_daily/",
    },
  },
  antarctic_surface_temperature: {
    titleEn: "Antarctic Surface Temperature",
    titleHu: "Antarktiszi felszíni hőmérséklet",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (ERA5)",
      descriptionEn: "ERA5 daily Antarctic 2m air temperature, published by Climate Reanalyzer.",
      descriptionHu: "ERA5 napi antarktiszi 2m levegőhőmérséklet, a Climate Reanalyzer közlésében.",
      url: "https://climatereanalyzer.org/clim/t2_daily/",
    },
  },
  north_atlantic_sea_surface_temperature: {
    titleEn: "North Atlantic Sea Surface Temperature",
    titleHu: "Észak-atlanti tengerfelszíni hőmérséklet",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (NOAA OISST v2.1)",
      descriptionEn: "NOAA OISST v2.1 daily North Atlantic SST, published by Climate Reanalyzer.",
      descriptionHu: "NOAA OISST v2.1 napi észak-atlanti SST, a Climate Reanalyzer közlésében.",
      url: "https://climatereanalyzer.org/clim/sst_daily/",
    },
  },
  global_surface_temperature_anomaly: {
    titleEn: "Global Surface Temperature Anomaly",
    titleHu: "Globális felszíni hőmérsékleti anomália",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (ERA5, 1991-2020 baseline)",
      descriptionEn:
        "Daily global surface-air temperature anomaly derived from ERA5 daily values relative to the 1991-2020 climatology in the same feed.",
      descriptionHu:
        "Napi globális felszíni levegőhőmérséklet-anomália, az ERA5 napi értékek és az ugyanabban a feedben szereplő 1991-2020-as klimatológia különbségeként.",
      url: "https://climatereanalyzer.org/clim/t2_daily/",
    },
  },
  global_sea_surface_temperature_anomaly: {
    titleEn: "Global Sea Surface Temperature Anomaly",
    titleHu: "Globális tengerfelszíni hőmérsékleti anomália",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "Climate Reanalyzer (OISST v2.1, 1991-2020 baseline)",
      descriptionEn:
        "Daily global SST anomaly derived from NOAA OISST v2.1 daily values relative to the 1991-2020 climatology in the same feed.",
      descriptionHu:
        "Napi globális tengerfelszíni hőmérséklet-anomália, a NOAA OISST v2.1 napi értékek és az ugyanabban a feedben szereplő 1991-2020-as klimatológia különbségeként.",
      url: "https://climatereanalyzer.org/clim/sst_daily/",
    },
  },
  daily_global_mean_temperature_anomaly: {
    titleEn: "Daily Global Mean Temperature Anomaly",
    titleHu: "Napi globális átlaghőmérséklet-anomália",
    unit: "deg C",
    decimals: 2,
    source: {
      shortName: "ECMWF ERA5 Climate Pulse (preindustrial estimate)",
      descriptionEn:
        "Daily global mean 2m air-temperature anomaly derived from ERA5 Climate Pulse (ano_91-20) and shifted by +0.88C to approximate an 1850-1900 preindustrial baseline.",
      descriptionHu:
        "Napi globális átlagos 2m levegőhőmérséklet-anomália az ERA5 Climate Pulse (ano_91-20) adatsorból, +0,88C eltolással becsült 1850-1900-as preindusztriális bázishoz.",
      url: "https://pulse.climate.copernicus.eu/",
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
  arctic_sea_ice_extent: {
    titleEn: "Arctic Sea Ice Extent",
    titleHu: "Arktiszi tengeri jégkiterjedés",
    unit: "million sq km",
    decimals: 2,
    source: {
      shortName: "NSIDC Sea Ice Index v4 (North)",
      descriptionEn: "Daily Arctic sea-ice extent from NSIDC Sea Ice Index v4 north file.",
      descriptionHu: "Napi arktiszi tengeri jégkiterjedés az NSIDC Sea Ice Index v4 északi állományából.",
      url: "https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/",
    },
  },
  antarctic_sea_ice_extent: {
    titleEn: "Antarctic Sea Ice Extent",
    titleHu: "Antarktiszi tengeri jégkiterjedés",
    unit: "million sq km",
    decimals: 2,
    source: {
      shortName: "NSIDC Sea Ice Index v4 (South)",
      descriptionEn: "Daily Antarctic sea-ice extent from NSIDC Sea Ice Index v4 south file.",
      descriptionHu: "Napi antarktiszi tengeri jégkiterjedés az NSIDC Sea Ice Index v4 déli állományából.",
      url: "https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/data/",
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
  atmospheric_ch4: {
    titleEn: "Atmospheric CH4 (Global)",
    titleHu: "Légköri CH4 (Globális)",
    unit: "ppb",
    decimals: 2,
    source: {
      shortName: "NOAA GML",
      descriptionEn: "Monthly global CH4 mole fraction from NOAA Global Monitoring Laboratory trend products.",
      descriptionHu: "Havi globális CH4 móltört a NOAA Global Monitoring Laboratory trend adataiból.",
      url: "https://gml.noaa.gov/ccgg/trends_ch4/",
    },
  },
  atmospheric_aggi: {
    titleEn: "NOAA AGGI",
    titleHu: "NOAA AGGI",
    unit: "index",
    decimals: 3,
    source: {
      shortName: "NOAA GML AGGI",
      descriptionEn: "Annual NOAA Atmospheric Greenhouse Gas Index (1990 = 1) from NOAA GML.",
      descriptionHu: "Éves NOAA Atmospheric Greenhouse Gas Index (1990 = 1) a NOAA GML adataiból.",
      url: "https://gml.noaa.gov/aggi/AGGI_Table.csv",
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
