import { createDataSourceFromSeries } from "./adapter";
import type { ClimateSeriesBundle, DashboardDataSource, DailyPoint } from "../domain/model";

const ERA5_GLOBAL_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_world_t2_day.json";
const ERA5_NH_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_nh_t2_day.json";
const ERA5_SH_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_sh_t2_day.json";
const ERA5_ARCTIC_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_arctic_t2_day.json";
const ERA5_ANTARCTIC_SURFACE_TEMP_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/era5_antarctic_t2_day.json";
const OISST_GLOBAL_SST_URL = "https://cr.acg.maine.edu/clim/sst_daily/json_2clim/oisst2.1_world2_sst_day.json";
const OISST_NORTH_ATLANTIC_SST_URL = "https://cr.acg.maine.edu/clim/sst_daily/json_2clim/oisst2.1_natlan_sst_day.json";
const ECMWF_CLIMATE_PULSE_GLOBAL_2T_DAILY_URL = "https://sites.ecmwf.int/data/climatepulse/data/series/era5_daily_series_2t_global.csv";
const NSIDC_NORTH_DAILY_EXTENT_URL =
  "https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_daily_v4.0.csv";
const NSIDC_SOUTH_DAILY_EXTENT_URL =
  "https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/data/S_seaice_extent_daily_v4.0.csv";
const NOAA_MAUNA_LOA_CO2_DAILY_URL = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_daily_mlo.csv";
const NOAA_GLOBAL_CH4_MONTHLY_URL = "https://gml.noaa.gov/webdata/ccgg/trends/ch4/ch4_mm_gl.csv";
const LOCAL_GENERATED_DATA_URL = "./data/climate-realtime.json";
const DAY_MS = 86_400_000;
const FUTURE_TOLERANCE_DAYS = 0;
const SERIES_KEYS: (keyof ClimateSeriesBundle)[] = [
  "global_surface_temperature",
  "global_sea_surface_temperature",
  "northern_hemisphere_surface_temperature",
  "southern_hemisphere_surface_temperature",
  "arctic_surface_temperature",
  "antarctic_surface_temperature",
  "north_atlantic_sea_surface_temperature",
  "global_surface_temperature_anomaly",
  "global_sea_surface_temperature_anomaly",
  "daily_global_mean_temperature_anomaly",
  "global_sea_ice_extent",
  "arctic_sea_ice_extent",
  "antarctic_sea_ice_extent",
  "atmospheric_co2",
  "atmospheric_ch4",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function parseIsoDateToUtc(dateIso: string): number | null {
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function utcMidnightNow(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
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

async function loadGeneratedLocalDataSource(): Promise<DashboardDataSource | null> {
  const payload = await fetchJson(LOCAL_GENERATED_DATA_URL);
  if (!payload) return null;

  const parsedSeries = readGeneratedSeries(payload);
  if (!parsedSeries) return null;

  const generatedAtIso =
    isRecord(payload) && typeof payload.generatedAtIso === "string" && Number.isFinite(Date.parse(payload.generatedAtIso))
      ? payload.generatedAtIso
      : new Date().toISOString();

  return createDataSourceFromSeries({
    series: parsedSeries,
    warnings: [],
    updatedAtIso: generatedAtIso,
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
      const trailingValue = toFiniteNumber(values[effectiveLength - 1]);
      if (trailingValue == null || trailingValue === 0) {
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

    const value = toFiniteNumber(columns[anomalyColumn]);
    if (value == null) continue;

    points.push({ date, value });
  }

  return normalizePoints(points);
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
  const anomaly = sanitizeSeries(parseReanalyzerDailyAnomalyJson(payload, "1991-2020"), {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
  });
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
  const anomaly = sanitizeSeries(parseReanalyzerDailyAnomalyJson(payload, "1991-2020"), {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 45,
  });
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

  const southernHemisphere = shPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(shPayload), {
        minValue: -20,
        maxValue: 35,
        maxAgeDays: 20,
      })
    : [];

  const arctic = arcticPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(arcticPayload), {
        minValue: -70,
        maxValue: 25,
        maxAgeDays: 20,
      })
    : [];

  const antarctic = antarcticPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(antarcticPayload), {
        minValue: -80,
        maxValue: 25,
        maxAgeDays: 20,
      })
    : [];

  const northAtlanticSst = northAtlanticSstPayload
    ? sanitizeSeries(parseReanalyzerDailyJson(northAtlanticSstPayload), {
        minValue: -5,
        maxValue: 40,
        maxAgeDays: 45,
      })
    : [];

  return {
    northernHemisphere: northernHemisphere.length ? northernHemisphere : null,
    southernHemisphere: southernHemisphere.length ? southernHemisphere : null,
    arctic: arctic.length ? arctic : null,
    antarctic: antarctic.length ? antarctic : null,
    northAtlanticSst: northAtlanticSst.length ? northAtlanticSst : null,
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

export async function loadRuntimeDataSource(): Promise<DashboardDataSource> {
  const localDataSource = await loadGeneratedLocalDataSource();
  if (localDataSource) return localDataSource;

  const warnings: string[] = [];
  const liveSeries: Partial<ClimateSeriesBundle> = {};

  const [surfaceResult, sstResult, regionalResult, seaIceResult, co2Result, ch4Result, dailyGlobalMeanAnomalyResult] =
    await Promise.allSettled([
    loadSurfaceTempSeriesBundle(),
    loadSeaSurfaceTempSeriesBundle(),
    loadRegionalTemperatureSeriesBundle(),
    loadSeaIceSeriesBundle(),
    loadCo2Series(),
    loadCh4Series(),
    loadDailyGlobalMeanTemperatureAnomalySeries(),
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
  } else {
    warnings.push("Live Northern Hemisphere Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Southern Hemisphere Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Arctic Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live Antarctic Surface Temperature feed was unavailable or stale; using bundled fallback.");
    warnings.push("Live North Atlantic Sea Surface Temperature feed was unavailable or stale; using bundled fallback.");
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

  if (dailyGlobalMeanAnomalyResult.status === "fulfilled" && dailyGlobalMeanAnomalyResult.value?.length) {
    liveSeries.daily_global_mean_temperature_anomaly = dailyGlobalMeanAnomalyResult.value;
  } else {
    warnings.push("Live Daily Global Mean Temperature Anomaly feed was unavailable or stale; using bundled fallback.");
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
