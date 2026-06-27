import { createDataSourceFromSeries } from "./adapter";
import type {
  ClimateMapAsset,
  ClimateMapAssets,
  ClimateMapKey,
  ClimateSeriesBundle,
  DashboardDataSource,
  DailyPoint,
  AiSummary,
  EnsoCondition,
  EnsoOutlook,
  EnsoOutlookWindow,
} from "../domain/model";

const ERA5_GLOBAL_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_world_t2_day.json";
const ERA5_NH_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_nh_t2_day.json";
const ERA5_SH_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_sh_t2_day.json";
const ERA5_ARCTIC_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_arctic_t2_day.json";
const ERA5_ANTARCTIC_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_antarctic_t2_day.json";
const OISST_GLOBAL_SST_URL = "https://cr.acg.maine.edu/clim/sst_daily/json_2clim/oisst2.1_world2_sst_day.json";
const OISST_NORTH_ATLANTIC_SST_URL = "https://cr.acg.maine.edu/clim/sst_daily/json_2clim/oisst2.1_natlan_sst_day.json";
const ECMWF_CLIMATE_PULSE_GLOBAL_2T_DAILY_URL = "https://sites.ecmwf.int/data/climatepulse/data/series/era5_daily_series_2t_global.csv";
const ECMWF_PREINDUSTRIAL_OFFSET_C = 0.88;
const SEA_LEVEL_RESEARCH_GROUP_URL = "https://sealevel.colorado.edu/";
const NOAA_OCEAN_HEAT_CONTENT_2000M_URL =
  "https://www.ncei.noaa.gov/data/oceans/woa/DATA_ANALYSIS/3M_HEAT_CONTENT/DATA/basin/3month/ohc2000m_levitus_climdash_seasonal.csv";
const NASA_CERES_EBAF_OPENDAP_BASE_URL = "https://opendap.larc.nasa.gov/opendap/CERES/EBAF/TOA_Edition4.2.1";
const NASA_CERES_EBAF_OPENDAP_DIRECTORY_URL = `${NASA_CERES_EBAF_OPENDAP_BASE_URL}/contents.html`;
const NASA_CERES_EBAF_FILE_PATTERN = /CERES_EBAF-TOA_Edition4\.2\.1_\d{6}-\d{6}\.nc/g;
const NASA_CERES_EBAF_TIME_BASE_UTC = Date.UTC(2000, 2, 1);
const WGMS_MASS_CHANGE_ESTIMATES_URL = "https://wgms.ch/mass_change_estimates/";
const WGMS_REFERENCE_GLACIERS_MASS_BALANCE_URL = "https://wgms.ch/data/faq/mb_ref.csv";
const WGMS_AMCE_ZIP_PATTERN = /(?:https:\/\/wgms\.ch)?\/downloads\/wgms-amce-\d{4}-\d{2}-\d{2}\.zip/g;
const WGMS_AMCE_GLOBAL_CSV_ENTRY = "global.csv";
const LASP_NRL2_TSI_MONTHLY_URL = "https://lasp.colorado.edu/lisird/latis/dap/nrl2_tsi_P1M.csv?time,irradiance";
const LASP_TSIS_TSI_DAILY_URL = "https://lasp.colorado.edu/lisird/latis/dap/tsis_tsi_24hr.csv?time,tsi_1au";
const IMBIE_WEST_ANTARCTICA_MASS_BALANCE_CSV_URL =
  "https://ramadda.data.bas.ac.uk/repository/entry/get/imbie_west_antarctica_2021_Gt.csv?entryid=synth:77b64c55-7166-4a06-9def-2e400398e452:L2ltYmllX3dlc3RfYW50YXJjdGljYV8yMDIxX0d0LmNzdg==";
const NASA_ANTARCTICA_MASS_VARIATION_CHART_URL =
  "https://assets.science.nasa.gov/content/dam/science/microapps/vital-signs/data/charts/ice-sheets-antarctica.json";
const NASA_GREENLAND_MASS_VARIATION_CHART_URL =
  "https://assets.science.nasa.gov/content/dam/science/microapps/vital-signs/data/charts/ice-sheets-greenland.json";
const NSIDC_NORTH_DAILY_EXTENT_URL =
  "https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_daily_v4.0.csv";
const NSIDC_SOUTH_DAILY_EXTENT_URL =
  "https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/data/S_seaice_extent_daily_v4.0.csv";
const NOAA_MAUNA_LOA_CO2_DAILY_URL = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_daily_mlo.csv";
const NOAA_GLOBAL_CH4_MONTHLY_URL = "https://gml.noaa.gov/webdata/ccgg/trends/ch4/ch4_mm_gl.csv";
const NOAA_AGGI_CSV_URL = "https://gml.noaa.gov/aggi/AGGI_Table.csv";
const NOAA_CPC_ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";
const LOCAL_GENERATED_DATA_URL = "./data/climate-realtime.json";
const DAY_MS = 86_400_000;
const FUTURE_TOLERANCE_DAYS = 0;
const SERIES_KEYS: (keyof ClimateSeriesBundle)[] = [
  "global_surface_temperature",
  "global_sea_surface_temperature",
  "global_mean_sea_level",
  "ocean_heat_content",
  "earth_energy_imbalance",
  "incoming_solar_energy",
  "global_glacier_mass_balance",
  "mountain_glacier_mass_balance",
  "antarctic_ice_sheet_mass_balance",
  "west_antarctic_ice_sheet_mass_balance",
  "greenland_ice_sheet_mass_balance",
  "northern_hemisphere_surface_temperature",
  "southern_hemisphere_surface_temperature",
  "arctic_surface_temperature",
  "antarctic_surface_temperature",
  "north_atlantic_sea_surface_temperature",
  "global_surface_temperature_anomaly",
  "global_sea_surface_temperature_anomaly",
  "northern_hemisphere_surface_temperature_anomaly",
  "southern_hemisphere_surface_temperature_anomaly",
  "arctic_surface_temperature_anomaly",
  "antarctic_surface_temperature_anomaly",
  "north_atlantic_sea_surface_temperature_anomaly",
  "daily_global_mean_temperature_anomaly",
  "global_sea_ice_extent",
  "arctic_sea_ice_extent",
  "antarctic_sea_ice_extent",
  "atmospheric_co2",
  "atmospheric_ch4",
  "atmospheric_aggi",
  "nino34_index",
];
const MAP_KEYS: ClimateMapKey[] = [
  "global_2m_temperature",
  "global_2m_temperature_anomaly",
  "global_sst",
  "global_sst_anomaly",
];
const LOCAL_GENERATED_SERIES_MAX_AGE_DAYS: Record<keyof ClimateSeriesBundle, number> = {
  global_surface_temperature: 20,
  global_sea_surface_temperature: 45,
  global_mean_sea_level: 450,
  ocean_heat_content: 900,
  earth_energy_imbalance: 220,
  incoming_solar_energy: 220,
  global_glacier_mass_balance: 1600,
  mountain_glacier_mass_balance: 1600,
  antarctic_ice_sheet_mass_balance: 430,
  west_antarctic_ice_sheet_mass_balance: 3200,
  greenland_ice_sheet_mass_balance: 430,
  northern_hemisphere_surface_temperature: 20,
  southern_hemisphere_surface_temperature: 20,
  arctic_surface_temperature: 20,
  antarctic_surface_temperature: 20,
  north_atlantic_sea_surface_temperature: 45,
  global_surface_temperature_anomaly: 20,
  global_sea_surface_temperature_anomaly: 45,
  northern_hemisphere_surface_temperature_anomaly: 20,
  southern_hemisphere_surface_temperature_anomaly: 20,
  arctic_surface_temperature_anomaly: 20,
  antarctic_surface_temperature_anomaly: 20,
  north_atlantic_sea_surface_temperature_anomaly: 45,
  daily_global_mean_temperature_anomaly: 20,
  global_sea_ice_extent: 20,
  arctic_sea_ice_extent: 20,
  antarctic_sea_ice_extent: 20,
  atmospheric_co2: 120,
  atmospheric_ch4: 220,
  atmospheric_aggi: 1000,
  nino34_index: 220,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isMissingReanalyzerValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === "null" || normalized === "nan" || normalized === "na";
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return formatIsoDate(date);
}

function dateFromYearAndDay(year: number, dayOfYear: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null;
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(dayOfYear);
  if (date.getUTCFullYear() !== year) return null;
  return formatIsoDate(date);
}

function dateFromDecimalYear(decimalYear: number): string | null {
  if (!Number.isFinite(decimalYear)) return null;
  const year = Math.trunc(decimalYear);
  if (!Number.isFinite(year) || year < 1800 || year > 2200) return null;
  const fraction = Math.max(0, Math.min(0.999999, decimalYear - year));
  const month = Math.max(1, Math.min(12, Math.floor(fraction * 12) + 1));
  return formatDateFromParts(year, month, 1);
}

function monthDateFromUtcTimestamp(timestamp: number): string | null {
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return formatDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function dateFromJulianDate(julianDate: number): string | null {
  if (!Number.isFinite(julianDate)) return null;
  return formatIsoDate(new Date((julianDate - 2440587.5) * DAY_MS));
}

function dateFromDaysSince1610(daysSince1610: number): string | null {
  if (!Number.isFinite(daysSince1610)) return null;
  return formatIsoDate(new Date(Date.UTC(1610, 0, 1) + daysSince1610 * DAY_MS));
}

function extractLatestGlobalMeanSeaLevelUrl(homepageHtml: string | null | undefined): string | null {
  let latestYear = -Infinity;
  let latestUrl: string | null = null;

  for (const match of String(homepageHtml ?? "").matchAll(
    /((?:https?:\/\/sealevel\.colorado\.edu)?\/files\/(\d{4})_rel1\/gmsl_\d{4}rel1_seasons_rmvd\.txt)/gi
  )) {
    const rawUrl = match[1];
    const year = Number(match[2]);
    if (!rawUrl || !Number.isFinite(year)) continue;
    if (year <= latestYear) continue;
    latestYear = year;
    latestUrl = new URL(rawUrl, SEA_LEVEL_RESEARCH_GROUP_URL).toString();
  }

  return latestUrl;
}

function buildGlobalMeanSeaLevelCandidateUrls(homepageHtml: string | null | undefined): string[] {
  const candidateUrls: string[] = [];
  const discoveredUrl = extractLatestGlobalMeanSeaLevelUrl(homepageHtml);
  if (discoveredUrl) candidateUrls.push(discoveredUrl);

  const currentYear = new Date().getUTCFullYear();
  for (let year = currentYear; year >= currentYear - 2; year -= 1) {
    candidateUrls.push(`${SEA_LEVEL_RESEARCH_GROUP_URL}files/${year}_rel1/gmsl_${year}rel1_seasons_rmvd.txt`);
  }

  return Array.from(new Set(candidateUrls));
}

function normalizePoints(points: DailyPoint[]): DailyPoint[] {
  const map = new Map<string, number>();
  for (const point of points) {
    const date = String(point.date ?? "").trim();
    const value = Number(point.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isFinite(value)) continue;
    map.set(date, value);
  }

  return Array.from(map.entries())
    .sort((a, b) => Date.parse(`${a[0]}T00:00:00Z`) - Date.parse(`${b[0]}T00:00:00Z`))
    .map(([date, value]) => ({ date, value }));
}

function filterSeriesToReferenceDates(points: DailyPoint[], referencePoints: DailyPoint[]): DailyPoint[] {
  const referenceDates = new Set(referencePoints.map((point) => point.date));
  return normalizePoints(points.filter((point) => referenceDates.has(point.date)));
}

function parseIsoDateToUtc(dateIso: string): number | null {
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function utcMidnightNow(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isFreshGeneratedSeriesBundle(series: Partial<ClimateSeriesBundle>): boolean {
  const nowMidnight = utcMidnightNow();

  return SERIES_KEYS.every((key) => {
    const points = series[key];
    if (!Array.isArray(points) || points.length === 0) return false;

    const latestPoint = points[points.length - 1];
    const latestTime = parseIsoDateToUtc(latestPoint.date);
    if (latestTime == null) return false;

    return nowMidnight - latestTime <= LOCAL_GENERATED_SERIES_MAX_AGE_DAYS[key] * DAY_MS;
  });
}

function sanitizeSeries(
  points: DailyPoint[],
  limits: {
    minValue: number;
    maxValue: number;
    maxAgeDays: number;
  }
): DailyPoint[] {
  const nowMidnight = utcMidnightNow();
  const futureLimit = nowMidnight + FUTURE_TOLERANCE_DAYS * DAY_MS;
  const staleLimit = nowMidnight - limits.maxAgeDays * DAY_MS;

  const filtered = points.filter((point) => {
    const value = Number(point.value);
    if (!Number.isFinite(value) || value < limits.minValue || value > limits.maxValue) return false;
    const pointTime = parseIsoDateToUtc(point.date);
    if (pointTime == null) return false;
    return pointTime <= futureLimit;
  });

  const normalized = normalizePoints(filtered);
  if (!normalized.length) return [];

  const latest = normalized[normalized.length - 1];
  const latestTime = parseIsoDateToUtc(latest.date);
  if (latestTime == null) return [];
  if (latestTime < staleLimit) return [];

  return normalized;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchBinary(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadGlobalMeanSeaLevelText(): Promise<string | null> {
  const homepageHtml = await fetchText(SEA_LEVEL_RESEARCH_GROUP_URL);

  for (const url of buildGlobalMeanSeaLevelCandidateUrls(homepageHtml)) {
    const text = await fetchText(url);
    if (text) return text;
  }

  return null;
}

function readGeneratedSeries(payload: unknown): Partial<ClimateSeriesBundle> | null {
  if (!isRecord(payload) || !isRecord(payload.series)) return null;

  const parsed: Partial<ClimateSeriesBundle> = {};

  for (const key of SERIES_KEYS) {
    const rawSeries = payload.series[key];
    if (!Array.isArray(rawSeries)) continue;

    const points: DailyPoint[] = [];
    for (const item of rawSeries) {
      if (!isRecord(item)) continue;
      const date = typeof item.date === "string" ? item.date.trim() : "";
      const value = toFiniteNumber(item.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value == null) continue;
      points.push({ date, value });
    }

    if (points.length) {
      parsed[key] = normalizePoints(points);
    }
  }

  return parsed;
}

function parseGeneratedEnsoWindow(rawWindow: unknown): EnsoOutlookWindow | null {
  if (!isRecord(rawWindow)) return null;
  const conditionValue = typeof rawWindow.condition === "string" ? rawWindow.condition.trim() : "";
  const condition =
    conditionValue === "la_nina" || conditionValue === "neutral" || conditionValue === "el_nino"
      ? (conditionValue as EnsoCondition)
      : null;
  if (!condition) return null;

  const probability = rawWindow.probability == null ? null : toFiniteNumber(rawWindow.probability);
  const targetLabel = typeof rawWindow.targetLabel === "string" && rawWindow.targetLabel.trim().length > 0 ? rawWindow.targetLabel.trim() : null;

  return {
    condition,
    probability,
    targetLabel,
  };
}

function readGeneratedEnsoOutlook(payload: unknown): EnsoOutlook | null {
  if (!isRecord(payload) || !isRecord(payload.ensoOutlook)) return null;
  const rawOutlook = payload.ensoOutlook;

  const sourceLabel = typeof rawOutlook.sourceLabel === "string" ? rawOutlook.sourceLabel.trim() : "";
  const sourceUrl = typeof rawOutlook.sourceUrl === "string" ? rawOutlook.sourceUrl.trim() : "";
  if (!sourceLabel || !sourceUrl) return null;

  const issuedDate =
    typeof rawOutlook.issuedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawOutlook.issuedDate.trim())
      ? rawOutlook.issuedDate.trim()
      : null;
  const alertStatus = typeof rawOutlook.alertStatus === "string" && rawOutlook.alertStatus.trim().length > 0 ? rawOutlook.alertStatus.trim() : null;
  const synopsis = typeof rawOutlook.synopsis === "string" && rawOutlook.synopsis.trim().length > 0 ? rawOutlook.synopsis.trim() : null;

  return {
    issuedDate,
    alertStatus,
    synopsis,
    sourceLabel,
    sourceUrl,
    nextThreeMonths: parseGeneratedEnsoWindow(rawOutlook.nextThreeMonths),
    nextSixMonths: parseGeneratedEnsoWindow(rawOutlook.nextSixMonths),
  };
}

function readGeneratedMapWarnings(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.mapWarnings)) return [];
  return payload.mapWarnings
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseGeneratedMapAsset(rawAsset: unknown): ClimateMapAsset | null {
  if (!isRecord(rawAsset)) return null;
  const path = typeof rawAsset.path === "string" ? rawAsset.path.trim() : "";
  if (!path) return null;

  const sourceUrl = typeof rawAsset.sourceUrl === "string" && rawAsset.sourceUrl.trim().length > 0 ? rawAsset.sourceUrl.trim() : null;
  const sourcePage = typeof rawAsset.sourcePage === "string" && rawAsset.sourcePage.trim().length > 0 ? rawAsset.sourcePage.trim() : null;
  const date = typeof rawAsset.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawAsset.date.trim()) ? rawAsset.date.trim() : null;

  return {
    path,
    sourceUrl,
    sourcePage,
    date,
  };
}

function readGeneratedMaps(payload: unknown): ClimateMapAssets | undefined {
  if (!isRecord(payload) || !isRecord(payload.maps)) return undefined;

  const parsed: ClimateMapAssets = {};
  for (const key of MAP_KEYS) {
    const mapAsset = parseGeneratedMapAsset(payload.maps[key]);
    if (!mapAsset) continue;
    parsed[key] = mapAsset;
  }

  return Object.keys(parsed).length ? parsed : undefined;
}

function readGeneratedAiSummary(payload: unknown): AiSummary | null {
  if (!isRecord(payload) || !isRecord(payload.aiSummary)) return null;
  const raw = payload.aiSummary;
  const textEn = typeof raw.textEn === "string" ? raw.textEn.trim() : "";
  const generatedAtIso =
    typeof raw.generatedAtIso === "string" && Number.isFinite(Date.parse(raw.generatedAtIso))
      ? raw.generatedAtIso
      : "";
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  const source = raw.source === "openai" || raw.source === "local" ? raw.source : null;
  const fingerprint = typeof raw.fingerprint === "string" ? raw.fingerprint.trim() : "";
  if (!textEn || !generatedAtIso || !model || !source || !fingerprint) return null;

  const temperatureChecks = Array.isArray(raw.temperatureChecks)
    ? raw.temperatureChecks
        .map((entry) => {
          if (!isRecord(entry)) return null;
          const key =
            entry.key === "global_surface_temperature" || entry.key === "global_sea_surface_temperature"
              ? entry.key
              : null;
          const tone = entry.tone === "critical" || entry.tone === "watch" || entry.tone === "normal" ? entry.tone : null;
          return key && tone ? { key, tone } : null;
        })
        .filter((entry): entry is AiSummary["temperatureChecks"][number] => entry != null)
    : [];

  return {
    textEn,
    textHu: typeof raw.textHu === "string" && raw.textHu.trim().length > 0 ? raw.textHu.trim() : null,
    generatedAtIso,
    model,
    source,
    fingerprint,
    temperatureChecks,
  };
}

async function loadGeneratedLocalDataSource(): Promise<DashboardDataSource | null> {
  const payload = await fetchJson(LOCAL_GENERATED_DATA_URL);
  if (!payload) return null;

  const parsedSeries = readGeneratedSeries(payload);
  if (!parsedSeries) return null;
  if (!isFreshGeneratedSeriesBundle(parsedSeries)) return null;
  const ensoOutlook = readGeneratedEnsoOutlook(payload);
  const aiSummary = readGeneratedAiSummary(payload);
  const mapAssets = readGeneratedMaps(payload);
  const mapWarnings = readGeneratedMapWarnings(payload);

  const generatedAtIso =
    isRecord(payload) && typeof payload.generatedAtIso === "string" && Number.isFinite(Date.parse(payload.generatedAtIso))
      ? payload.generatedAtIso
      : new Date().toISOString();

  return createDataSourceFromSeries({
    series: parsedSeries,
    warnings: [],
    updatedAtIso: generatedAtIso,
    ensoOutlook,
    aiSummary,
    maps: mapAssets,
    mapWarnings,
  });
}

function parseReanalyzerDailyJson(payload: unknown): DailyPoint[] {
  if (!Array.isArray(payload)) return [];

  const nowYear = new Date().getUTCFullYear();
  const points: DailyPoint[] = [];

  for (const row of payload) {
    if (!isRecord(row)) continue;

    const yearToken = typeof row.name === "number" || typeof row.name === "string" ? String(row.name).trim() : "";
    if (!/^\d{4}$/.test(yearToken)) continue;

    const year = Number(yearToken);
    if (!Number.isFinite(year) || year < 1940 || year > nowYear + 1) continue;

    let values: unknown[] = [];
    if (Array.isArray(row.data)) {
      values = row.data;
    } else if (typeof row.data === "string") {
      values = row.data.split(",");
    }

    let effectiveLength = values.length;
    while (effectiveLength > 0) {
      if (isMissingReanalyzerValue(values[effectiveLength - 1])) {
        effectiveLength -= 1;
        continue;
      }
      break;
    }

    for (let index = 0; index < effectiveLength; index += 1) {
      const numeric = toFiniteNumber(values[index]);
      if (numeric == null) continue;
      const date = dateFromYearAndDay(year, index + 1);
      if (!date) continue;
      points.push({ date, value: numeric });
    }
  }

  return normalizePoints(points);
}

function reanalyzerRowValues(row: Record<string, unknown>): unknown[] {
  if (Array.isArray(row.data)) return row.data;
  if (typeof row.data === "string") return row.data.split(",");
  return [];
}

function parseReanalyzerDailyAnomalyJson(payload: unknown, climatologyLabel = "1991-2020"): DailyPoint[] {
  if (!Array.isArray(payload)) return [];

  const baselineRow = payload.find(
    (row) => isRecord(row) && (typeof row.name === "string" || typeof row.name === "number") && String(row.name).trim() === climatologyLabel
  );
  if (!baselineRow || !isRecord(baselineRow)) return [];

  const baselineValues = reanalyzerRowValues(baselineRow).map((value) => toFiniteNumber(value));
  if (!baselineValues.length) return [];

  const nowYear = new Date().getUTCFullYear();
  const points: DailyPoint[] = [];

  for (const row of payload) {
    if (!isRecord(row)) continue;

    const yearToken = typeof row.name === "number" || typeof row.name === "string" ? String(row.name).trim() : "";
    if (!/^\d{4}$/.test(yearToken)) continue;

    const year = Number(yearToken);
    if (!Number.isFinite(year) || year < 1940 || year > nowYear + 1) continue;

    const values = reanalyzerRowValues(row);
    for (let index = 0; index < values.length; index += 1) {
      const numeric = toFiniteNumber(values[index]);
      const baseline = baselineValues[index];
      if (numeric == null || baseline == null || !Number.isFinite(baseline)) continue;
      const date = dateFromYearAndDay(year, index + 1);
      if (!date) continue;
      points.push({
        date,
        value: Math.round((numeric - baseline) * 1000) / 1000,
      });
    }
  }

  return normalizePoints(points);
}

function parseNsidcDailyExtentCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = rawCsv.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split(",").map((col) => col.replace(/"/g, "").trim());
    if (columns.length < 4) continue;

    const year = Number(columns[0]);
    const month = Number(columns[1]);
    const day = Number(columns[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) continue;

    const date = formatDateFromParts(year, month, day);
    if (!date) continue;

    const candidates = [columns[3], columns[4], columns[5]].map((value) => toFiniteNumber(value));
    const extent = candidates.find((value) => value != null && value > 0 && value < 100);
    if (extent == null) continue;

    points.push({ date, value: extent });
  }

  return normalizePoints(points);
}

function parseNoaaCo2DailyCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = rawCsv.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split(",").map((col) => col.trim());
    if (columns.length < 5) continue;

    const year = Number(columns[0]);
    const month = Number(columns[1]);
    const day = Number(columns[2]);
    const date = formatDateFromParts(year, month, day);
    if (!date) continue;

    const candidates = [columns[4], columns[5], columns[6]].map((value) => toFiniteNumber(value));
    const value = candidates.find((candidate) => candidate != null && candidate > 0 && candidate < 1000);
    if (value == null) continue;

    points.push({ date, value });
  }

  return normalizePoints(points);
}

function parseNoaaCh4MonthlyCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = rawCsv.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split(",").map((col) => col.trim());
    if (columns.length < 6) continue;

    const year = Number(columns[0]);
    const month = Number(columns[1]);
    const date = formatDateFromParts(year, month, 1);
    if (!date) continue;

    const average = toFiniteNumber(columns[3]);
    const trend = toFiniteNumber(columns[5]);
    const value = [average, trend].find((candidate) => candidate != null && candidate > 500 && candidate < 5000);
    if (value == null) continue;

    points.push({ date, value });
  }

  return normalizePoints(points);
}

function parseNoaaAggiCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = rawCsv.split(/\r?\n/);
  let yearColumn = -1;
  let aggiColumn = -1;
  let hasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split(",").map((col) => col.replace(/"/g, "").trim());
    if (!hasHeader) {
      const header = columns.map((col) => col.toLowerCase());
      yearColumn = header.indexOf("year");
      aggiColumn = header.findIndex((col) => col === "aggi" || col.includes("1990"));
      if (aggiColumn < 0) {
        aggiColumn = header.findIndex((col) => col.includes("= 1"));
      }
      hasHeader = true;
      continue;
    }

    if (yearColumn < 0 || aggiColumn < 0) continue;
    if (columns.length <= yearColumn || columns.length <= aggiColumn) continue;

    const year = Number(columns[yearColumn]);
    const value = toFiniteNumber(columns[aggiColumn]);
    if (!Number.isFinite(year) || year < 1970 || year > 2200 || value == null) continue;

    const date = formatDateFromParts(year, 1, 1);
    if (!date) continue;
    points.push({ date, value });
  }

  return normalizePoints(points);
}

function parseLaspTsisTsiDailyCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = String(rawCsv ?? "").split(/\r?\n/);
  let timeColumn = -1;
  let valueColumn = -1;
  let hasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const columns = line.split(",").map((col) => col.replace(/"/g, "").trim());
    if (!hasHeader) {
      const header = columns.map((col) => col.toLowerCase());
      timeColumn = header.findIndex((col) => col.startsWith("time"));
      valueColumn = header.findIndex((col) => col.startsWith("tsi_1au"));
      hasHeader = true;
      continue;
    }

    if (timeColumn < 0 || valueColumn < 0) continue;
    if (columns.length <= timeColumn || columns.length <= valueColumn) continue;

    const julianDate = toFiniteNumber(columns[timeColumn]);
    const value = toFiniteNumber(columns[valueColumn]);
    if (julianDate == null || value == null || value <= 0) continue;

    const date = dateFromJulianDate(julianDate);
    if (!date) continue;
    points.push({ date, value });
  }

  return normalizePoints(points);
}

function parseLaspNrl2TsiMonthlyCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = String(rawCsv ?? "").split(/\r?\n/);
  let timeColumn = -1;
  let valueColumn = -1;
  let hasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const columns = line.split(",").map((col) => col.replace(/"/g, "").trim());
    if (!hasHeader) {
      const header = columns.map((col) => col.toLowerCase());
      timeColumn = header.findIndex((col) => col.startsWith("time"));
      valueColumn = header.findIndex((col) => col.startsWith("irradiance"));
      hasHeader = true;
      continue;
    }

    if (timeColumn < 0 || valueColumn < 0) continue;
    if (columns.length <= timeColumn || columns.length <= valueColumn) continue;

    const daysSince1610 = toFiniteNumber(columns[timeColumn]);
    const value = toFiniteNumber(columns[valueColumn]);
    if (daysSince1610 == null || value == null || value <= 0) continue;

    const date = dateFromDaysSince1610(daysSince1610);
    if (!date) continue;
    points.push({ date: `${date.slice(0, 7)}-01`, value });
  }

  return normalizePoints(points);
}

function monthlyMeanSeries(points: DailyPoint[]): DailyPoint[] {
  const buckets = new Map<string, number[]>();
  for (const point of points) {
    const date = String(point.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const monthDate = `${date.slice(0, 7)}-01`;
    const values = buckets.get(monthDate) ?? [];
    values.push(Number(point.value));
    buckets.set(monthDate, values);
  }

  return normalizePoints(
    Array.from(buckets.entries()).map(([date, values]) => ({
      date,
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
    }))
  );
}

function mergeNrl2WithTsisExtension(nrl2MonthlyPoints: DailyPoint[], tsisDailyPoints: DailyPoint[]): DailyPoint[] {
  const nrl2Monthly = normalizePoints(nrl2MonthlyPoints);
  const tsisMonthly = monthlyMeanSeries(tsisDailyPoints);
  if (!nrl2Monthly.length) return tsisMonthly;
  if (!tsisMonthly.length) return nrl2Monthly;

  const nrl2ByDate = new Map(nrl2Monthly.map((point) => [point.date, point.value]));
  const overlapDifferences = tsisMonthly
    .filter((point) => nrl2ByDate.has(point.date))
    .map((point) => point.value - (nrl2ByDate.get(point.date) ?? 0));
  const overlapOffset = overlapDifferences.length
    ? overlapDifferences.reduce((sum, value) => sum + value, 0) / overlapDifferences.length
    : 0;
  const lastNrl2Date = nrl2Monthly[nrl2Monthly.length - 1].date;
  const tsisExtension = tsisMonthly
    .filter((point) => point.date > lastNrl2Date)
    .map((point) => ({ date: point.date, value: point.value - overlapOffset }));

  return normalizePoints([...nrl2Monthly, ...tsisExtension]);
}

function parseLooseDateToken(token: string): string | null {
  const value = token.trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const yearMonth = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    return formatDateFromParts(year, month, 1);
  }

  const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slashDate) {
    const month = Number(slashDate[1]);
    const day = Number(slashDate[2]);
    const year = Number(slashDate[3]);
    return formatDateFromParts(year, month, day);
  }

  const decimalYear = toFiniteNumber(value);
  if (decimalYear != null) return dateFromDecimalYear(decimalYear);
  return null;
}

function parseNceiOceanHeatContentCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = rawCsv.split(/\r?\n/);
  let dateColumn = -1;
  let valueColumn = -1;
  let hasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split(",").map((col) => col.replace(/"/g, "").trim());
    if (!hasHeader) {
      const directDate = columns.length > 0 ? parseLooseDateToken(columns[0]) : null;
      const directValue = columns.length > 1 ? toFiniteNumber(columns[1]) : null;
      if (directDate && directValue != null) {
        points.push({ date: directDate, value: directValue });
        dateColumn = 0;
        valueColumn = 1;
        hasHeader = true;
        continue;
      }

      const header = columns.map((col) => col.toLowerCase());
      dateColumn = header.indexOf("date");
      valueColumn = header.findIndex((col) => col === "value" || col.includes("heat") || col.includes("global"));
      hasHeader = true;
      continue;
    }

    if (dateColumn < 0 || valueColumn < 0) {
      valueColumn = columns.length > 1 ? 1 : -1;
    }
    if (dateColumn < 0 || valueColumn < 0) continue;
    if (columns.length <= dateColumn || columns.length <= valueColumn) continue;

    const date = parseLooseDateToken(columns[dateColumn]);
    const value = toFiniteNumber(columns[valueColumn]);
    if (!date || value == null) continue;
    points.push({ date, value });
  }

  return normalizePoints(points);
}

function parseGlobalMeanSeaLevelText(rawText: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = rawText.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split(/\s+/).map((col) => col.trim());
    if (columns.length < 2) continue;

    const decimalYear = toFiniteNumber(columns[0]);
    const value = toFiniteNumber(columns[1]);
    if (decimalYear == null || value == null) continue;

    const date = dateFromDecimalYear(decimalYear);
    if (!date) continue;
    points.push({ date, value });
  }

  return normalizePoints(points);
}

function parseEcmwfClimatePulseGlobal2tDailyCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = rawCsv.split(/\r?\n/);
  let dateColumn = -1;
  let anomalyColumn = -1;
  let hasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split(",").map((col) => col.replace(/"/g, "").trim());
    if (!hasHeader) {
      const header = columns.map((col) => col.toLowerCase());
      dateColumn = header.indexOf("date");
      anomalyColumn = header.indexOf("ano_91-20");
      hasHeader = true;
      continue;
    }

    if (dateColumn < 0 || anomalyColumn < 0) continue;
    if (columns.length <= dateColumn || columns.length <= anomalyColumn) continue;

    const date = columns[dateColumn];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const anomaly19912020 = toFiniteNumber(columns[anomalyColumn]);
    if (anomaly19912020 == null) continue;
    const value = anomaly19912020 + ECMWF_PREINDUSTRIAL_OFFSET_C;

    points.push({ date, value });
  }

  return normalizePoints(points);
}

function extractLatestCeresEebafDatasetName(rawHtml: string): string | null {
  const matches = rawHtml.match(NASA_CERES_EBAF_FILE_PATTERN) ?? [];
  if (!matches.length) return null;
  const ordered = matches.sort();
  return ordered[ordered.length - 1] ?? null;
}

function buildCeresEarthEnergyImbalanceAsciiUrl(fileName: string): string {
  return `${NASA_CERES_EBAF_OPENDAP_BASE_URL}/${fileName}.ascii?time,gtoa_net_all_mon`;
}

function parseCeresEarthEnergyImbalanceAscii(rawText: string): DailyPoint[] {
  const lines = rawText.split(/\r?\n/);
  let timeValues: number[] = [];
  let fluxValues: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("time,")) {
      timeValues = line
        .split(",")
        .slice(1)
        .map((token) => toFiniteNumber(token))
        .filter((value): value is number => value != null);
    } else if (line.startsWith("gtoa_net_all_mon.gtoa_net_all_mon,")) {
      fluxValues = line
        .split(",")
        .slice(1)
        .map((token) => toFiniteNumber(token))
        .filter((value): value is number => value != null && value > -998);
    }
  }

  if (!timeValues.length || !fluxValues.length) return [];

  const points: DailyPoint[] = [];
  const length = Math.min(timeValues.length, fluxValues.length);
  for (let index = 0; index < length; index += 1) {
    const dayOffset = timeValues[index];
    const value = fluxValues[index];
    if (!Number.isFinite(dayOffset) || !Number.isFinite(value)) continue;
    const date = monthDateFromUtcTimestamp(NASA_CERES_EBAF_TIME_BASE_UTC + dayOffset * DAY_MS);
    if (!date) continue;
    points.push({ date, value });
  }

  return normalizePoints(points);
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

async function inflateRawDeflateText(bytes: Uint8Array): Promise<string> {
  const DecompressionStreamCtor = (globalThis as unknown as {
    DecompressionStream?: new (format: string) => unknown;
  }).DecompressionStream;
  if (!DecompressionStreamCtor) {
    throw new Error("Browser does not support DecompressionStream.");
  }

  let lastError: unknown = null;
  for (const format of ["deflate-raw", "deflate"]) {
    try {
      const compressedBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(compressedBuffer).set(bytes);
      const compressedStream = new Blob([compressedBuffer]).stream();
      const inflatedStream = compressedStream.pipeThrough(new DecompressionStreamCtor(format) as never);
      return await new Response(inflatedStream).text();
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Unable to decompress ZIP entry: ${reason}`);
}

async function extractZipEntryText(zipBytes: Uint8Array, entryName: string): Promise<string | null> {
  if (zipBytes.length < 22) return null;

  let eocdOffset = -1;
  for (let offset = zipBytes.length - 22; offset >= 0; offset -= 1) {
    if (readUint32Le(zipBytes, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const entryCount = readUint16Le(zipBytes, eocdOffset + 10);
  const centralDirectoryOffset = readUint32Le(zipBytes, eocdOffset + 16);
  const decoder = new TextDecoder();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32Le(zipBytes, offset) !== 0x02014b50) break;

    const compressionMethod = readUint16Le(zipBytes, offset + 10);
    const compressedSize = readUint32Le(zipBytes, offset + 20);
    const fileNameLength = readUint16Le(zipBytes, offset + 28);
    const extraFieldLength = readUint16Le(zipBytes, offset + 30);
    const commentLength = readUint16Le(zipBytes, offset + 32);
    const localHeaderOffset = readUint32Le(zipBytes, offset + 42);
    const fileName = decoder.decode(zipBytes.subarray(offset + 46, offset + 46 + fileNameLength));

    if (fileName === entryName) {
      if (readUint32Le(zipBytes, localHeaderOffset) !== 0x04034b50) return null;

      const localFileNameLength = readUint16Le(zipBytes, localHeaderOffset + 26);
      const localExtraLength = readUint16Le(zipBytes, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      const compressedBytes = zipBytes.subarray(dataStart, dataEnd);

      if (compressionMethod === 0) return decoder.decode(compressedBytes);
      if (compressionMethod === 8) return await inflateRawDeflateText(compressedBytes);
      return null;
    }

    offset += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return null;
}

function extractWgmsAmceZipUrl(rawHtml: string | null | undefined): string | null {
  const matches = String(rawHtml ?? "").match(WGMS_AMCE_ZIP_PATTERN) ?? [];
  if (!matches.length) return null;
  return new URL(matches[matches.length - 1], WGMS_MASS_CHANGE_ESTIMATES_URL).toString();
}

function parseWgmsGlobalGlacierCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = String(rawCsv ?? "").split(/\r?\n/);
  let yearColumn = -1;
  let gtColumn = -1;
  let hasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const columns = line.split(",").map((column) => column.replace(/"/g, "").trim());
    if (!hasHeader) {
      const header = columns.map((column) => column.toLowerCase());
      yearColumn = header.indexOf("year");
      gtColumn = header.indexOf("gt");
      hasHeader = true;
      continue;
    }

    if (yearColumn < 0 || gtColumn < 0) continue;
    if (columns.length <= yearColumn || columns.length <= gtColumn) continue;

    const year = Number(columns[yearColumn]);
    const value = toFiniteNumber(columns[gtColumn]);
    if (!Number.isFinite(year) || year < 1900 || year > 2200 || value == null) continue;

    const date = formatDateFromParts(year, 1, 1);
    if (!date) continue;
    points.push({ date, value });
  }

  return normalizePoints(points);
}

function parseWgmsReferenceGlacierMassBalanceCsv(rawCsv: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const lines = String(rawCsv ?? "").split(/\r?\n/);
  let yearColumn = -1;
  let valueColumn = -1;
  let hasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const columns = line.split(",").map((column) => column.replace(/"/g, "").trim());
    if (!hasHeader) {
      const header = columns.map((column) => column.replace(/^\uFEFF/, "").toLowerCase());
      yearColumn = header.findIndex((column) => column === "year");
      valueColumn = header.findIndex((column) => column === "ref_regionavg" || column.includes("regionavg"));
      hasHeader = true;
      continue;
    }

    if (yearColumn < 0 || valueColumn < 0) continue;
    if (columns.length <= yearColumn || columns.length <= valueColumn) continue;

    const year = Number(columns[yearColumn]);
    const millimetersWaterEquivalent = toFiniteNumber(columns[valueColumn]);
    if (!Number.isFinite(year) || year < 1900 || year > 2200 || millimetersWaterEquivalent == null) continue;

    const date = formatDateFromParts(year, 1, 1);
    if (!date) continue;
    points.push({ date, value: Math.round((millimetersWaterEquivalent / 1000) * 1000) / 1000 });
  }

  return normalizePoints(points);
}

function parseNoaaCpcOniText(rawText: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  const centerMonthBySeason: Record<string, number> = {
    DJF: 1,
    JFM: 2,
    FMA: 3,
    MAM: 4,
    AMJ: 5,
    MJJ: 6,
    JJA: 7,
    JAS: 8,
    ASO: 9,
    SON: 10,
    OND: 11,
    NDJ: 12,
  };

  for (const rawLine of String(rawText ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^seas\b/i.test(line)) continue;

    const columns = line.split(/\s+/);
    if (columns.length < 4) continue;

    const season = columns[0];
    const year = Number(columns[1]);
    const anomaly = toFiniteNumber(columns[3]);
    const centerMonth = centerMonthBySeason[season];
    if (!Number.isFinite(year) || !Number.isFinite(centerMonth) || anomaly == null) continue;

    const date = formatDateFromParts(year, centerMonth, 1);
    if (!date) continue;
    points.push({ date, value: anomaly });
  }

  return normalizePoints(points);
}

function parseImbieCumulativeMassLossCsv(rawCsv: string): DailyPoint[] {
  const rows: Array<{ date: string; cumulativeMassBalance: number }> = [];
  const lines = String(rawCsv ?? "").split(/\r?\n/);
  let yearColumn = -1;
  let cumulativeColumn = -1;
  let hasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const columns = line.split(",").map((column) => column.replace(/"/g, "").trim());
    if (!hasHeader) {
      const header = columns.map((column) => column.replace(/^\uFEFF/, "").toLowerCase());
      yearColumn = header.indexOf("year");
      cumulativeColumn = header.findIndex((column) => column === "cumulative mass balance (gt)");
      hasHeader = true;
      continue;
    }

    if (yearColumn < 0 || cumulativeColumn < 0) continue;
    if (columns.length <= yearColumn || columns.length <= cumulativeColumn) continue;

    const decimalYear = toFiniteNumber(columns[yearColumn]);
    const cumulativeMassBalance = toFiniteNumber(columns[cumulativeColumn]);
    if (decimalYear == null || cumulativeMassBalance == null) continue;

    const date = dateFromDecimalYear(decimalYear);
    if (!date) continue;
    rows.push({ date, cumulativeMassBalance });
  }

  if (!rows.length) return [];
  const baseline = rows[0].cumulativeMassBalance;
  return normalizePoints(
    rows.map((row) => ({
      date: row.date,
      value: Math.round((baseline - row.cumulativeMassBalance) * 1000) / 1000,
    }))
  );
}

function parseNasaMassVariationChartJson(payload: unknown): DailyPoint[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];

  const points: DailyPoint[] = [];
  for (const item of payload.items) {
    if (!isRecord(item) || item.y == null) continue;
    const year = Number(item.year);
    const month = Number(item.month);
    const day = Number(item.day);
    const value = toFiniteNumber(item.y);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || value == null) continue;
    const date = formatDateFromParts(year, month, day);
    if (!date) continue;
    points.push({ date, value });
  }

  return normalizePoints(points);
}

function buildCumulativeLossSeries(points: DailyPoint[]): DailyPoint[] {
  const normalized = normalizePoints(points);
  if (!normalized.length) return [];

  const baseline = normalized[0].value;
  return normalized.map((point) => ({
    date: point.date,
    value: Math.round((baseline - point.value) * 1000) / 1000,
  }));
}

function mergeSeaIceSeries(north: DailyPoint[], south: DailyPoint[]): DailyPoint[] {
  const northMap = new Map<string, number>(north.map((point) => [point.date, point.value]));
  const southMap = new Map<string, number>(south.map((point) => [point.date, point.value]));

  const dates = Array.from(new Set([...northMap.keys(), ...southMap.keys()]));
  const merged: DailyPoint[] = [];

  for (const date of dates) {
    const northValue = northMap.get(date);
    const southValue = southMap.get(date);
    if (northValue == null || southValue == null) continue;
    merged.push({
      date,
      value: northValue + southValue,
    });
  }

  return normalizePoints(merged);
}

interface TemperatureSeriesBundle {
  absolute: DailyPoint[] | null;
  anomaly: DailyPoint[] | null;
}

async function loadSurfaceTempSeriesBundle(): Promise<TemperatureSeriesBundle> {
  const payload = await fetchJson(ERA5_GLOBAL_SURFACE_TEMP_URL);
  if (!payload) return { absolute: null, anomaly: null };
  const absolute = sanitizeSeries(parseReanalyzerDailyJson(payload), {
    minValue: 5,
    maxValue: 40,
    maxAgeDays: 20,
  });
  const anomaly = filterSeriesToReferenceDates(
    sanitizeSeries(parseReanalyzerDailyAnomalyJson(payload, "1991-2020"), {
      minValue: -10,
      maxValue: 10,
      maxAgeDays: 20,
    }),
    absolute
  );
  return {
    absolute: absolute.length ? absolute : null,
    anomaly: anomaly.length ? anomaly : null,
  };
}

async function loadSeaSurfaceTempSeriesBundle(): Promise<TemperatureSeriesBundle> {
  const payload = await fetchJson(OISST_GLOBAL_SST_URL);
  if (!payload) return { absolute: null, anomaly: null };
  const absolute = sanitizeSeries(parseReanalyzerDailyJson(payload), {
    minValue: 10,
    maxValue: 40,
    maxAgeDays: 45,
  });
  const anomaly = filterSeriesToReferenceDates(
    sanitizeSeries(parseReanalyzerDailyAnomalyJson(payload, "1991-2020"), {
      minValue: -10,
      maxValue: 10,
      maxAgeDays: 45,
    }),
    absolute
  );
  return {
    absolute: absolute.length ? absolute : null,
    anomaly: anomaly.length ? anomaly : null,
  };
}

interface RegionalTemperatureSeriesBundle {
  northernHemisphere: DailyPoint[] | null;
  southernHemisphere: DailyPoint[] | null;
  arctic: DailyPoint[] | null;
  antarctic: DailyPoint[] | null;
  northAtlanticSst: DailyPoint[] | null;
  northernHemisphereAnomaly: DailyPoint[] | null;
  southernHemisphereAnomaly: DailyPoint[] | null;
  arcticAnomaly: DailyPoint[] | null;
  antarcticAnomaly: DailyPoint[] | null;
  northAtlanticSstAnomaly: DailyPoint[] | null;
}

async function loadRegionalTemperatureSeriesBundle(): Promise<RegionalTemperatureSeriesBundle> {
  const [nhPayload, shPayload, arcticPayload, antarcticPayload, northAtlanticSstPayload] = await Promise.all([
    fetchJson(ERA5_NH_SURFACE_TEMP_URL),
    fetchJson(ERA5_SH_SURFACE_TEMP_URL),
    fetchJson(ERA5_ARCTIC_SURFACE_TEMP_URL),
    fetchJson(ERA5_ANTARCTIC_SURFACE_TEMP_URL),
    fetchJson(OISST_NORTH_ATLANTIC_SST_URL),
  ]);

  const northernHemisphere = nhPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(nhPayload), {
        minValue: -20,
        maxValue: 40,
        maxAgeDays: 20,
      })
    : [];
  const northernHemisphereAnomaly = nhPayload
    ? filterSeriesToReferenceDates(
        sanitizeSeries(parseReanalyzerDailyAnomalyJson(nhPayload, "1991-2020"), {
          minValue: -10,
          maxValue: 10,
          maxAgeDays: 20,
        }),
        northernHemisphere
      )
    : [];

  const southernHemisphere = shPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(shPayload), {
        minValue: -20,
        maxValue: 35,
        maxAgeDays: 20,
      })
    : [];
  const southernHemisphereAnomaly = shPayload
    ? filterSeriesToReferenceDates(
        sanitizeSeries(parseReanalyzerDailyAnomalyJson(shPayload, "1991-2020"), {
          minValue: -10,
          maxValue: 10,
          maxAgeDays: 20,
        }),
        southernHemisphere
      )
    : [];

  const arctic = arcticPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(arcticPayload), {
        minValue: -70,
        maxValue: 25,
        maxAgeDays: 20,
      })
    : [];
  const arcticAnomaly = arcticPayload
    ? filterSeriesToReferenceDates(
        sanitizeSeries(parseReanalyzerDailyAnomalyJson(arcticPayload, "1991-2020"), {
          minValue: -10,
          maxValue: 10,
          maxAgeDays: 20,
        }),
        arctic
      )
    : [];

  const antarctic = antarcticPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(antarcticPayload), {
        minValue: -80,
        maxValue: 25,
        maxAgeDays: 20,
      })
    : [];
  const antarcticAnomaly = antarcticPayload
    ? filterSeriesToReferenceDates(
        sanitizeSeries(parseReanalyzerDailyAnomalyJson(antarcticPayload, "1991-2020"), {
          minValue: -10,
          maxValue: 10,
          maxAgeDays: 20,
        }),
        antarctic
      )
    : [];

  const northAtlanticSst = northAtlanticSstPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(northAtlanticSstPayload), {
        minValue: -5,
        maxValue: 40,
        maxAgeDays: 45,
      })
    : [];
  const northAtlanticSstAnomaly = northAtlanticSstPayload
    ? filterSeriesToReferenceDates(
        sanitizeSeries(parseReanalyzerDailyAnomalyJson(northAtlanticSstPayload, "1991-2020"), {
          minValue: -10,
          maxValue: 10,
          maxAgeDays: 45,
        }),
        northAtlanticSst
      )
    : [];

  return {
    northernHemisphere: northernHemisphere.length ? northernHemisphere : null,
    southernHemisphere: southernHemisphere.length ? southernHemisphere : null,
    arctic: arctic.length ? arctic : null,
    antarctic: antarctic.length ? antarctic : null,
    northAtlanticSst: northAtlanticSst.length ? northAtlanticSst : null,
    northernHemisphereAnomaly: northernHemisphereAnomaly.length ? northernHemisphereAnomaly : null,
    southernHemisphereAnomaly: southernHemisphereAnomaly.length ? southernHemisphereAnomaly : null,
    arcticAnomaly: arcticAnomaly.length ? arcticAnomaly : null,
    antarcticAnomaly: antarcticAnomaly.length ? antarcticAnomaly : null,
    northAtlanticSstAnomaly: northAtlanticSstAnomaly.length ? northAtlanticSstAnomaly : null,
  };
}

interface SeaIceSeriesBundle {
  global: DailyPoint[] | null;
  arctic: DailyPoint[] | null;
  antarctic: DailyPoint[] | null;
}

async function loadSeaIceSeriesBundle(): Promise<SeaIceSeriesBundle> {
  const [northCsv, southCsv] = await Promise.all([fetchText(NSIDC_NORTH_DAILY_EXTENT_URL), fetchText(NSIDC_SOUTH_DAILY_EXTENT_URL)]);

  const arctic = northCsv
    ? sanitizeSeries(parseNsidcDailyExtentCsv(northCsv), {
        minValue: 0,
        maxValue: 30,
        maxAgeDays: 20,
      })
    : [];

  const antarctic = southCsv
    ? sanitizeSeries(parseNsidcDailyExtentCsv(southCsv), {
        minValue: 0,
        maxValue: 35,
        maxAgeDays: 20,
      })
    : [];

  const global = arctic.length && antarctic.length
    ? sanitizeSeries(mergeSeaIceSeries(arctic, antarctic), {
        minValue: 0,
        maxValue: 60,
        maxAgeDays: 20,
      })
    : [];

  return {
    global: global.length ? global : null,
    arctic: arctic.length ? arctic : null,
    antarctic: antarctic.length ? antarctic : null,
  };
}

async function loadCo2Series(): Promise<DailyPoint[] | null> {
  const csv = await fetchText(NOAA_MAUNA_LOA_CO2_DAILY_URL);
  if (!csv) return null;
  const points = sanitizeSeries(parseNoaaCo2DailyCsv(csv), {
    minValue: 200,
    maxValue: 700,
    maxAgeDays: 120,
  });
  return points.length ? points : null;
}

async function loadCh4Series(): Promise<DailyPoint[] | null> {
  const csv = await fetchText(NOAA_GLOBAL_CH4_MONTHLY_URL);
  if (!csv) return null;
  const points = sanitizeSeries(parseNoaaCh4MonthlyCsv(csv), {
    minValue: 1000,
    maxValue: 3000,
    maxAgeDays: 220,
  });
  return points.length ? points : null;
}

async function loadAggiSeries(): Promise<DailyPoint[] | null> {
  const csv = await fetchText(NOAA_AGGI_CSV_URL);
  if (!csv) return null;
  const points = sanitizeSeries(parseNoaaAggiCsv(csv), {
    minValue: 0.5,
    maxValue: 3.5,
    maxAgeDays: 1000,
  });
  return points.length ? points : null;
}

async function loadIncomingSolarEnergySeries(): Promise<DailyPoint[] | null> {
  const [nrl2Csv, tsisCsv] = await Promise.all([fetchText(LASP_NRL2_TSI_MONTHLY_URL), fetchText(LASP_TSIS_TSI_DAILY_URL)]);
  if (!nrl2Csv && !tsisCsv) return null;
  const points = sanitizeSeries(mergeNrl2WithTsisExtension(parseLaspNrl2TsiMonthlyCsv(nrl2Csv ?? ""), parseLaspTsisTsiDailyCsv(tsisCsv ?? "")), {
    minValue: 1358,
    maxValue: 1364,
    maxAgeDays: 220,
  });
  return points.length ? points : null;
}

async function loadNino34IndexSeries(): Promise<DailyPoint[] | null> {
  const text = await fetchText(NOAA_CPC_ONI_URL);
  if (!text) return null;
  const points = sanitizeSeries(parseNoaaCpcOniText(text), {
    minValue: -4,
    maxValue: 4,
    maxAgeDays: 220,
  });
  return points.length ? points : null;
}

interface OceanSeriesBundle {
  globalMeanSeaLevel: DailyPoint[] | null;
  oceanHeatContent: DailyPoint[] | null;
  earthEnergyImbalance: DailyPoint[] | null;
}

async function loadOceanSeriesBundle(): Promise<OceanSeriesBundle> {
  const [gmslText, ohcCsv, ceresContentsHtml] = await Promise.all([
    loadGlobalMeanSeaLevelText(),
    fetchText(NOAA_OCEAN_HEAT_CONTENT_2000M_URL),
    fetchText(NASA_CERES_EBAF_OPENDAP_DIRECTORY_URL),
  ]);

  const globalMeanSeaLevel = gmslText
    ? sanitizeSeries(parseGlobalMeanSeaLevelText(gmslText), {
        minValue: -200,
        maxValue: 300,
        maxAgeDays: 450,
      })
    : [];

  const oceanHeatContent = ohcCsv
    ? sanitizeSeries(parseNceiOceanHeatContentCsv(ohcCsv), {
        minValue: -50,
        maxValue: 120,
        maxAgeDays: 900,
      })
    : [];

  const ceresFileName = ceresContentsHtml ? extractLatestCeresEebafDatasetName(ceresContentsHtml) : null;
  const ceresAscii = ceresFileName ? await fetchText(buildCeresEarthEnergyImbalanceAsciiUrl(ceresFileName)) : null;
  const earthEnergyImbalance = ceresAscii
    ? sanitizeSeries(parseCeresEarthEnergyImbalanceAscii(ceresAscii), {
        minValue: -20,
        maxValue: 20,
        maxAgeDays: 220,
      })
    : [];

  return {
    globalMeanSeaLevel: globalMeanSeaLevel.length ? globalMeanSeaLevel : null,
    oceanHeatContent: oceanHeatContent.length ? oceanHeatContent : null,
    earthEnergyImbalance: earthEnergyImbalance.length ? earthEnergyImbalance : null,
  };
}

async function loadDailyGlobalMeanTemperatureAnomalySeries(): Promise<DailyPoint[] | null> {
  const csv = await fetchText(ECMWF_CLIMATE_PULSE_GLOBAL_2T_DAILY_URL);
  if (!csv) return null;
  const points = sanitizeSeries(parseEcmwfClimatePulseGlobal2tDailyCsv(csv), {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
  });
  return points.length ? points : null;
}

async function loadGlobalGlacierMassBalanceSeries(): Promise<DailyPoint[] | null> {
  const wgmsHtml = await fetchText(WGMS_MASS_CHANGE_ESTIMATES_URL);
  const wgmsAmceZipUrl = extractWgmsAmceZipUrl(wgmsHtml);
  if (!wgmsAmceZipUrl) return null;

  const wgmsAmceZipBytes = await fetchBinary(wgmsAmceZipUrl);
  if (!wgmsAmceZipBytes) return null;

  const wgmsGlobalCsv = await extractZipEntryText(wgmsAmceZipBytes, WGMS_AMCE_GLOBAL_CSV_ENTRY);
  if (!wgmsGlobalCsv) return null;

  const points = sanitizeSeries(parseWgmsGlobalGlacierCsv(wgmsGlobalCsv), {
    minValue: -1200,
    maxValue: 250,
    maxAgeDays: 1600,
  });
  return points.length ? points : null;
}

async function loadMountainGlacierMassBalanceSeries(): Promise<DailyPoint[] | null> {
  const csv = await fetchText(WGMS_REFERENCE_GLACIERS_MASS_BALANCE_URL);
  if (!csv) return null;

  const points = sanitizeSeries(parseWgmsReferenceGlacierMassBalanceCsv(csv), {
    minValue: -4,
    maxValue: 2,
    maxAgeDays: 1600,
  });
  return points.length ? points : null;
}

async function loadWestAntarcticIceSheetMassBalanceSeries(): Promise<DailyPoint[] | null> {
  const csv = await fetchText(IMBIE_WEST_ANTARCTICA_MASS_BALANCE_CSV_URL);
  if (!csv) return null;

  const points = sanitizeSeries(parseImbieCumulativeMassLossCsv(csv), {
    minValue: 0,
    maxValue: 4000,
    maxAgeDays: 3200,
  });
  return points.length ? points : null;
}

async function loadIceSheetMassLossSeries(url: string, maxValue: number): Promise<DailyPoint[] | null> {
  const payload = await fetchJson(url);
  const points = sanitizeSeries(buildCumulativeLossSeries(parseNasaMassVariationChartJson(payload)), {
    minValue: 0,
    maxValue,
    maxAgeDays: 430,
  });
  return points.length ? points : null;
}

interface IceSheetAndGlacierSeriesBundle {
  globalGlacierMassBalance: DailyPoint[] | null;
  mountainGlacierMassBalance: DailyPoint[] | null;
  antarcticIceSheetMassBalance: DailyPoint[] | null;
  westAntarcticIceSheetMassBalance: DailyPoint[] | null;
  greenlandIceSheetMassBalance: DailyPoint[] | null;
}

async function loadIceSheetAndGlacierSeriesBundle(): Promise<IceSheetAndGlacierSeriesBundle> {
  const [glacierResult, mountainGlacierResult, antarcticResult, westAntarcticResult, greenlandResult] = await Promise.allSettled([
    loadGlobalGlacierMassBalanceSeries(),
    loadMountainGlacierMassBalanceSeries(),
    loadIceSheetMassLossSeries(NASA_ANTARCTICA_MASS_VARIATION_CHART_URL, 4000),
    loadWestAntarcticIceSheetMassBalanceSeries(),
    loadIceSheetMassLossSeries(NASA_GREENLAND_MASS_VARIATION_CHART_URL, 7000),
  ]);

  return {
    globalGlacierMassBalance: glacierResult.status === "fulfilled" ? glacierResult.value : null,
    mountainGlacierMassBalance: mountainGlacierResult.status === "fulfilled" ? mountainGlacierResult.value : null,
    antarcticIceSheetMassBalance: antarcticResult.status === "fulfilled" ? antarcticResult.value : null,
    westAntarcticIceSheetMassBalance: westAntarcticResult.status === "fulfilled" ? westAntarcticResult.value : null,
    greenlandIceSheetMassBalance: greenlandResult.status === "fulfilled" ? greenlandResult.value : null,
  };
}

export async function loadRuntimeDataSource(): Promise<DashboardDataSource> {
  const localDataSource = await loadGeneratedLocalDataSource();
  if (localDataSource) return localDataSource;

  const warnings: string[] = [];
  const liveSeries: Partial<ClimateSeriesBundle> = {};

  const [
    surfaceResult,
    sstResult,
    oceanResult,
    regionalResult,
    seaIceResult,
    co2Result,
    ch4Result,
    aggiResult,
    incomingSolarEnergyResult,
    dailyGlobalMeanAnomalyResult,
    iceSheetAndGlacierResult,
    nino34IndexResult,
  ] = await Promise.allSettled([
    loadSurfaceTempSeriesBundle(),
    loadSeaSurfaceTempSeriesBundle(),
    loadOceanSeriesBundle(),
    loadRegionalTemperatureSeriesBundle(),
    loadSeaIceSeriesBundle(),
    loadCo2Series(),
    loadCh4Series(),
    loadAggiSeries(),
    loadIncomingSolarEnergySeries(),
    loadDailyGlobalMeanTemperatureAnomalySeries(),
    loadIceSheetAndGlacierSeriesBundle(),
    loadNino34IndexSeries(),
  ]);

  if (surfaceResult.status === "fulfilled" && surfaceResult.value.absolute?.length) {
    liveSeries.global_surface_temperature = surfaceResult.value.absolute;
  } else {
    warnings.push("Live Global Surface Temperature feed was unavailable or stale; using bundled fallback.");
  }

  if (surfaceResult.status === "fulfilled" && surfaceResult.value.anomaly?.length) {
    liveSeries.global_surface_temperature_anomaly = surfaceResult.value.anomaly;
  } else {
    warnings.push("Live Global Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
  }

  if (sstResult.status === "fulfilled" && sstResult.value.absolute?.length) {
    liveSeries.global_sea_surface_temperature = sstResult.value.absolute;
  } else {
    warnings.push("Live Global Sea Surface Temperature feed was unavailable or stale; using bundled fallback.");
  }

  if (sstResult.status === "fulfilled" && sstResult.value.anomaly?.length) {
    liveSeries.global_sea_surface_temperature_anomaly = sstResult.value.anomaly;
  } else {
    warnings.push("Live Global Sea Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
  }

  if (oceanResult.status === "fulfilled") {
    if (oceanResult.value.globalMeanSeaLevel?.length) {
      liveSeries.global_mean_sea_level = oceanResult.value.globalMeanSeaLevel;
    } else {
      warnings.push("Live Global Mean Sea Level feed was unavailable or stale; using bundled fallback.");
    }

    if (oceanResult.value.oceanHeatContent?.length) {
      liveSeries.ocean_heat_content = oceanResult.value.oceanHeatContent;
    } else {
      warnings.push("Live Ocean Heat Content feed was unavailable or stale; using bundled fallback.");
    }

    if (oceanResult.value.earthEnergyImbalance?.length) {
      liveSeries.earth_energy_imbalance = oceanResult.value.earthEnergyImbalance;
    } else {
      warnings.push("Live Earth Energy Imbalance feed was unavailable or stale; using bundled fallback.");
    }
  } else {
    warnings.push("Live Global Mean Sea Level feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Ocean Heat Content feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Earth Energy Imbalance feed was unavailable or stale; using bundled fallback.");
  }

  if (regionalResult.status === "fulfilled") {
    if (regionalResult.value.northernHemisphere?.length) {
      liveSeries.northern_hemisphere_surface_temperature = regionalResult.value.northernHemisphere;
    } else {
      warnings.push("Live Northern Hemisphere Surface Temperature feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.southernHemisphere?.length) {
      liveSeries.southern_hemisphere_surface_temperature = regionalResult.value.southernHemisphere;
    } else {
      warnings.push("Live Southern Hemisphere Surface Temperature feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.arctic?.length) {
      liveSeries.arctic_surface_temperature = regionalResult.value.arctic;
    } else {
      warnings.push("Live Arctic Surface Temperature feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.antarctic?.length) {
      liveSeries.antarctic_surface_temperature = regionalResult.value.antarctic;
    } else {
      warnings.push("Live Antarctic Surface Temperature feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.northAtlanticSst?.length) {
      liveSeries.north_atlantic_sea_surface_temperature = regionalResult.value.northAtlanticSst;
    } else {
      warnings.push("Live North Atlantic Sea Surface Temperature feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.northernHemisphereAnomaly?.length) {
      liveSeries.northern_hemisphere_surface_temperature_anomaly = regionalResult.value.northernHemisphereAnomaly;
    } else {
      warnings.push("Live Northern Hemisphere Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.southernHemisphereAnomaly?.length) {
      liveSeries.southern_hemisphere_surface_temperature_anomaly = regionalResult.value.southernHemisphereAnomaly;
    } else {
      warnings.push("Live Southern Hemisphere Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.arcticAnomaly?.length) {
      liveSeries.arctic_surface_temperature_anomaly = regionalResult.value.arcticAnomaly;
    } else {
      warnings.push("Live Arctic Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.antarcticAnomaly?.length) {
      liveSeries.antarctic_surface_temperature_anomaly = regionalResult.value.antarcticAnomaly;
    } else {
      warnings.push("Live Antarctic Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    }

    if (regionalResult.value.northAtlanticSstAnomaly?.length) {
      liveSeries.north_atlantic_sea_surface_temperature_anomaly = regionalResult.value.northAtlanticSstAnomaly;
    } else {
      warnings.push("Live North Atlantic Sea Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    }
  } else {
    warnings.push("Live Northern Hemisphere Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Southern Hemisphere Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Arctic Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Antarctic Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live North Atlantic Sea Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Northern Hemisphere Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Southern Hemisphere Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Arctic Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Antarctic Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live North Atlantic Sea Surface Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
  }

  if (seaIceResult.status === "fulfilled") {
    if (seaIceResult.value.global?.length) {
      liveSeries.global_sea_ice_extent = seaIceResult.value.global;
    } else {
      warnings.push("Live Global Sea Ice Extent feed was unavailable or stale; using bundled fallback.");
    }

    if (seaIceResult.value.arctic?.length) {
      liveSeries.arctic_sea_ice_extent = seaIceResult.value.arctic;
    } else {
      warnings.push("Live Arctic Sea Ice Extent feed was unavailable or stale; using bundled fallback.");
    }

    if (seaIceResult.value.antarctic?.length) {
      liveSeries.antarctic_sea_ice_extent = seaIceResult.value.antarctic;
    } else {
      warnings.push("Live Antarctic Sea Ice Extent feed was unavailable or stale; using bundled fallback.");
    }
  } else {
    warnings.push("Live Global Sea Ice Extent feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Arctic Sea Ice Extent feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Antarctic Sea Ice Extent feed was unavailable or stale; using bundled fallback.");
  }

  if (co2Result.status === "fulfilled" && co2Result.value?.length) {
    liveSeries.atmospheric_co2 = co2Result.value;
  } else {
    warnings.push("Live Mauna Loa CO2 feed was unavailable or stale; using bundled fallback.");
  }

  if (ch4Result.status === "fulfilled" && ch4Result.value?.length) {
    liveSeries.atmospheric_ch4 = ch4Result.value;
  } else {
    warnings.push("Live global CH4 feed was unavailable or stale; using bundled fallback.");
  }

  if (aggiResult.status === "fulfilled" && aggiResult.value?.length) {
    liveSeries.atmospheric_aggi = aggiResult.value;
  } else {
    warnings.push("Live NOAA AGGI feed was unavailable or stale; using bundled fallback.");
  }

  if (incomingSolarEnergyResult.status === "fulfilled" && incomingSolarEnergyResult.value?.length) {
    liveSeries.incoming_solar_energy = incomingSolarEnergyResult.value;
  } else {
    warnings.push("Live incoming solar energy feed was unavailable or stale; using bundled fallback.");
  }

  if (dailyGlobalMeanAnomalyResult.status === "fulfilled" && dailyGlobalMeanAnomalyResult.value?.length) {
    liveSeries.daily_global_mean_temperature_anomaly = dailyGlobalMeanAnomalyResult.value;
  } else {
    warnings.push("Live Daily Global Mean Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
  }

  if (iceSheetAndGlacierResult.status === "fulfilled") {
    if (iceSheetAndGlacierResult.value.globalGlacierMassBalance?.length) {
      liveSeries.global_glacier_mass_balance = iceSheetAndGlacierResult.value.globalGlacierMassBalance;
    } else {
      warnings.push("Live Global Glacier Mass Balance feed was unavailable or stale; using bundled fallback.");
    }

    if (iceSheetAndGlacierResult.value.mountainGlacierMassBalance?.length) {
      liveSeries.mountain_glacier_mass_balance = iceSheetAndGlacierResult.value.mountainGlacierMassBalance;
    } else {
      warnings.push("Live Mountain Glacier Mass Balance feed was unavailable or stale; using bundled fallback.");
    }

    if (iceSheetAndGlacierResult.value.antarcticIceSheetMassBalance?.length) {
      liveSeries.antarctic_ice_sheet_mass_balance = iceSheetAndGlacierResult.value.antarcticIceSheetMassBalance;
    } else {
      warnings.push("Live Antarctic Ice Sheet Mass Loss feed was unavailable or stale; using bundled fallback.");
    }

    if (iceSheetAndGlacierResult.value.westAntarcticIceSheetMassBalance?.length) {
      liveSeries.west_antarctic_ice_sheet_mass_balance = iceSheetAndGlacierResult.value.westAntarcticIceSheetMassBalance;
    } else {
      warnings.push("Live West Antarctic Ice Sheet Mass Loss feed was unavailable or stale; using bundled fallback.");
    }

    if (iceSheetAndGlacierResult.value.greenlandIceSheetMassBalance?.length) {
      liveSeries.greenland_ice_sheet_mass_balance = iceSheetAndGlacierResult.value.greenlandIceSheetMassBalance;
    } else {
      warnings.push("Live Greenland Ice Sheet Mass Loss feed was unavailable or stale; using bundled fallback.");
    }
  } else {
    warnings.push("Live Global Glacier Mass Balance feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Mountain Glacier Mass Balance feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Antarctic Ice Sheet Mass Loss feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live West Antarctic Ice Sheet Mass Loss feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Greenland Ice Sheet Mass Loss feed was unavailable or stale; using bundled fallback.");
  }

  if (nino34IndexResult.status === "fulfilled" && nino34IndexResult.value?.length) {
    liveSeries.nino34_index = nino34IndexResult.value;
  } else {
    warnings.push("Live Oceanic Nino Index feed was unavailable or stale; using bundled fallback.");
  }

  return createDataSourceFromSeries({
    series: liveSeries,
    warnings: [
      "Local generated real-data file was missing or invalid; attempted direct remote feeds.",
      ...warnings,
    ],
    updatedAtIso: new Date().toISOString(),
  });
}
