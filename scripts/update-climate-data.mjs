import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = resolve(ROOT_DIR, "public/data/climate-realtime.json");

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

const DAY_MS = 86_400_000;
const FUTURE_TOLERANCE_DAYS = 0;
const DEFAULT_INTERVAL_MINUTES = 360;
const FETCH_TIMEOUT_MS = 30_000;
const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_BASE_DELAY_MS = 1_500;
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json,text/csv,*/*",
};

function toFiniteNumber(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateFromParts(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return formatIsoDate(date);
}

function dateFromYearAndDay(year, dayOfYear) {
  if (!Number.isFinite(year) || !Number.isFinite(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null;
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(dayOfYear);
  if (date.getUTCFullYear() !== year) return null;
  return formatIsoDate(date);
}

function parseIsoDateToUtc(dateIso) {
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizePoints(points) {
  const map = new Map();
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

function sanitizeSeries(points, limits) {
  const now = new Date();
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
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
  if (latestTime == null || latestTime < staleLimit) return [];

  return normalized;
}

async function fetchWithRetry(url, responseType) {
  let lastError = null;

  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: REQUEST_HEADERS,
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return responseType === "json" ? await response.json() : await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRY_ATTEMPTS) {
        const waitMs = FETCH_RETRY_BASE_DELAY_MS * attempt;
        await sleep(waitMs);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to fetch ${url} after ${FETCH_RETRY_ATTEMPTS} attempts: ${reason}`);
}

async function fetchJson(url) {
  return await fetchWithRetry(url, "json");
}

async function fetchText(url) {
  return await fetchWithRetry(url, "text");
}

function parseReanalyzerDailyJson(payload) {
  if (!Array.isArray(payload)) return [];

  const nowYear = new Date().getUTCFullYear();
  const points = [];

  for (const row of payload) {
    if (typeof row !== "object" || row == null || Array.isArray(row)) continue;

    const yearToken = typeof row.name === "number" || typeof row.name === "string" ? String(row.name).trim() : "";
    if (!/^\d{4}$/.test(yearToken)) continue;

    const year = Number(yearToken);
    if (!Number.isFinite(year) || year < 1940 || year > nowYear + 1) continue;

    const values = Array.isArray(row.data)
      ? row.data
      : typeof row.data === "string"
        ? row.data.split(",")
        : [];

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

function reanalyzerRowValues(row) {
  if (Array.isArray(row.data)) return row.data;
  if (typeof row.data === "string") return row.data.split(",");
  return [];
}

function parseReanalyzerDailyAnomalyJson(payload, climatologyLabel = "1991-2020") {
  if (!Array.isArray(payload)) return [];

  const baselineRow = payload.find((row) => {
    if (typeof row !== "object" || row == null || Array.isArray(row)) return false;
    if (typeof row.name !== "string" && typeof row.name !== "number") return false;
    return String(row.name).trim() === climatologyLabel;
  });
  if (!baselineRow || typeof baselineRow !== "object" || Array.isArray(baselineRow)) return [];

  const baselineValues = reanalyzerRowValues(baselineRow).map((value) => toFiniteNumber(value));
  if (!baselineValues.length) return [];

  const nowYear = new Date().getUTCFullYear();
  const points = [];

  for (const row of payload) {
    if (typeof row !== "object" || row == null || Array.isArray(row)) continue;

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

function parseNsidcDailyExtentCsv(rawCsv) {
  const points = [];
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

function parseNoaaCo2DailyCsv(rawCsv) {
  const points = [];
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

function parseNoaaCh4MonthlyCsv(rawCsv) {
  const points = [];
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

function parseEcmwfClimatePulseGlobal2tDailyCsv(rawCsv) {
  const points = [];
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

function mergeSeaIceSeries(north, south) {
  const northMap = new Map(north.map((point) => [point.date, point.value]));
  const southMap = new Map(south.map((point) => [point.date, point.value]));

  const dates = Array.from(new Set([...northMap.keys(), ...southMap.keys()]));
  const merged = [];

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

function summarize(series) {
  const latest = series.length ? series[series.length - 1] : null;
  return {
    points: series.length,
    latestDate: latest?.date ?? null,
    latestValue: latest?.value ?? null,
  };
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parseCliOptions(argv) {
  let watch = false;
  let intervalMinutes = DEFAULT_INTERVAL_MINUTES;
  let showHelp = false;

  for (const arg of argv) {
    if (arg === "--watch") {
      watch = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }

    if (arg.startsWith("--interval-minutes=")) {
      const rawValue = arg.slice("--interval-minutes=".length).trim();
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid --interval-minutes value "${rawValue}". Use a number >= 1.`);
      }
      intervalMinutes = parsed;
      continue;
    }

    throw new Error(`Unknown argument "${arg}". Use --help to see supported options.`);
  }

  return {
    watch,
    intervalMinutes,
    showHelp,
  };
}

function printHelp() {
  console.log("Usage: node scripts/update-climate-data.mjs [--watch] [--interval-minutes=<n>]");
  console.log("");
  console.log("Options:");
  console.log("  --watch                  Keep refreshing the dataset on an interval.");
  console.log(`  --interval-minutes=<n>   Refresh interval for --watch mode (default: ${DEFAULT_INTERVAL_MINUTES}).`);
  console.log("  --help, -h               Show this help.");
}

async function updateOnce() {
  const [
    surfacePayload,
    sstPayload,
    nhPayload,
    shPayload,
    arcticPayload,
    antarcticPayload,
    northAtlanticSstPayload,
    northCsv,
    southCsv,
    co2Csv,
    ch4Csv,
    dailyGlobalMeanAnomalyCsv,
  ] = await Promise.all([
    fetchJson(ERA5_GLOBAL_SURFACE_TEMP_URL),
    fetchJson(OISST_GLOBAL_SST_URL),
    fetchJson(ERA5_NH_SURFACE_TEMP_URL),
    fetchJson(ERA5_SH_SURFACE_TEMP_URL),
    fetchJson(ERA5_ARCTIC_SURFACE_TEMP_URL),
    fetchJson(ERA5_ANTARCTIC_SURFACE_TEMP_URL),
    fetchJson(OISST_NORTH_ATLANTIC_SST_URL),
    fetchText(NSIDC_NORTH_DAILY_EXTENT_URL),
    fetchText(NSIDC_SOUTH_DAILY_EXTENT_URL),
    fetchText(NOAA_MAUNA_LOA_CO2_DAILY_URL),
    fetchText(NOAA_GLOBAL_CH4_MONTHLY_URL),
    fetchText(ECMWF_CLIMATE_PULSE_GLOBAL_2T_DAILY_URL),
  ]);

  const globalSurfaceTemperature = sanitizeSeries(parseReanalyzerDailyJson(surfacePayload), {
    minValue: 5,
    maxValue: 40,
    maxAgeDays: 20,
  });
  const globalSurfaceTemperatureAnomaly = sanitizeSeries(parseReanalyzerDailyAnomalyJson(surfacePayload, "1991-2020"), {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
  });
  const globalSeaSurfaceTemperature = sanitizeSeries(parseReanalyzerDailyJson(sstPayload), {
    minValue: 10,
    maxValue: 40,
    maxAgeDays: 45,
  });
  const globalSeaSurfaceTemperatureAnomaly = sanitizeSeries(parseReanalyzerDailyAnomalyJson(sstPayload, "1991-2020"), {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 45,
  });
  const northernHemisphereSurfaceTemperature = sanitizeSeries(parseReanalyzerDailyJson(nhPayload), {
    minValue: -20,
    maxValue: 40,
    maxAgeDays: 20,
  });
  const southernHemisphereSurfaceTemperature = sanitizeSeries(parseReanalyzerDailyJson(shPayload), {
    minValue: -20,
    maxValue: 35,
    maxAgeDays: 20,
  });
  const arcticSurfaceTemperature = sanitizeSeries(parseReanalyzerDailyJson(arcticPayload), {
    minValue: -70,
    maxValue: 25,
    maxAgeDays: 20,
  });
  const antarcticSurfaceTemperature = sanitizeSeries(parseReanalyzerDailyJson(antarcticPayload), {
    minValue: -80,
    maxValue: 25,
    maxAgeDays: 20,
  });
  const northAtlanticSeaSurfaceTemperature = sanitizeSeries(parseReanalyzerDailyJson(northAtlanticSstPayload), {
    minValue: -5,
    maxValue: 40,
    maxAgeDays: 45,
  });
  const arcticSeaIceExtent = sanitizeSeries(parseNsidcDailyExtentCsv(northCsv), {
    minValue: 0,
    maxValue: 30,
    maxAgeDays: 20,
  });
  const antarcticSeaIceExtent = sanitizeSeries(parseNsidcDailyExtentCsv(southCsv), {
    minValue: 0,
    maxValue: 35,
    maxAgeDays: 20,
  });
  const globalSeaIceExtent = sanitizeSeries(
    mergeSeaIceSeries(arcticSeaIceExtent, antarcticSeaIceExtent),
    {
      minValue: 0,
      maxValue: 60,
      maxAgeDays: 20,
    }
  );
  const atmosphericCo2 = sanitizeSeries(parseNoaaCo2DailyCsv(co2Csv), {
    minValue: 200,
    maxValue: 700,
    maxAgeDays: 120,
  });
  const atmosphericCh4 = sanitizeSeries(parseNoaaCh4MonthlyCsv(ch4Csv), {
    minValue: 1000,
    maxValue: 3000,
    maxAgeDays: 220,
  });
  const dailyGlobalMeanTemperatureAnomaly = sanitizeSeries(parseEcmwfClimatePulseGlobal2tDailyCsv(dailyGlobalMeanAnomalyCsv), {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
  });

  const generatedAtIso = new Date().toISOString();

  const output = {
    generatedAtIso,
    sources: {
      global_surface_temperature: ERA5_GLOBAL_SURFACE_TEMP_URL,
      global_sea_surface_temperature: OISST_GLOBAL_SST_URL,
      northern_hemisphere_surface_temperature: ERA5_NH_SURFACE_TEMP_URL,
      southern_hemisphere_surface_temperature: ERA5_SH_SURFACE_TEMP_URL,
      arctic_surface_temperature: ERA5_ARCTIC_SURFACE_TEMP_URL,
      antarctic_surface_temperature: ERA5_ANTARCTIC_SURFACE_TEMP_URL,
      north_atlantic_sea_surface_temperature: OISST_NORTH_ATLANTIC_SST_URL,
      global_surface_temperature_anomaly:
        "Derived from ERA5 daily global surface temperature minus 1991-2020 daily climatology from the same feed.",
      global_sea_surface_temperature_anomaly:
        "Derived from OISST v2.1 daily global SST minus 1991-2020 daily climatology from the same feed.",
      daily_global_mean_temperature_anomaly: ECMWF_CLIMATE_PULSE_GLOBAL_2T_DAILY_URL,
      global_sea_ice_extent: "Derived as north + south overlap from NSIDC Sea Ice Index v4 daily files.",
      arctic_sea_ice_extent: NSIDC_NORTH_DAILY_EXTENT_URL,
      antarctic_sea_ice_extent: NSIDC_SOUTH_DAILY_EXTENT_URL,
      atmospheric_co2: NOAA_MAUNA_LOA_CO2_DAILY_URL,
      atmospheric_ch4: NOAA_GLOBAL_CH4_MONTHLY_URL,
    },
    series: {
      global_surface_temperature: globalSurfaceTemperature,
      global_sea_surface_temperature: globalSeaSurfaceTemperature,
      northern_hemisphere_surface_temperature: northernHemisphereSurfaceTemperature,
      southern_hemisphere_surface_temperature: southernHemisphereSurfaceTemperature,
      arctic_surface_temperature: arcticSurfaceTemperature,
      antarctic_surface_temperature: antarcticSurfaceTemperature,
      north_atlantic_sea_surface_temperature: northAtlanticSeaSurfaceTemperature,
      global_surface_temperature_anomaly: globalSurfaceTemperatureAnomaly,
      global_sea_surface_temperature_anomaly: globalSeaSurfaceTemperatureAnomaly,
      daily_global_mean_temperature_anomaly: dailyGlobalMeanTemperatureAnomaly,
      global_sea_ice_extent: globalSeaIceExtent,
      arctic_sea_ice_extent: arcticSeaIceExtent,
      antarctic_sea_ice_extent: antarcticSeaIceExtent,
      atmospheric_co2: atmosphericCo2,
      atmospheric_ch4: atmosphericCh4,
    },
    summary: {
      global_surface_temperature: summarize(globalSurfaceTemperature),
      global_sea_surface_temperature: summarize(globalSeaSurfaceTemperature),
      northern_hemisphere_surface_temperature: summarize(northernHemisphereSurfaceTemperature),
      southern_hemisphere_surface_temperature: summarize(southernHemisphereSurfaceTemperature),
      arctic_surface_temperature: summarize(arcticSurfaceTemperature),
      antarctic_surface_temperature: summarize(antarcticSurfaceTemperature),
      north_atlantic_sea_surface_temperature: summarize(northAtlanticSeaSurfaceTemperature),
      global_surface_temperature_anomaly: summarize(globalSurfaceTemperatureAnomaly),
      global_sea_surface_temperature_anomaly: summarize(globalSeaSurfaceTemperatureAnomaly),
      daily_global_mean_temperature_anomaly: summarize(dailyGlobalMeanTemperatureAnomaly),
      global_sea_ice_extent: summarize(globalSeaIceExtent),
      arctic_sea_ice_extent: summarize(arcticSeaIceExtent),
      antarctic_sea_ice_extent: summarize(antarcticSeaIceExtent),
      atmospheric_co2: summarize(atmosphericCo2),
      atmospheric_ch4: summarize(atmosphericCh4),
    },
  };

  if (
    !output.series.global_surface_temperature.length ||
    !output.series.global_sea_surface_temperature.length ||
    !output.series.northern_hemisphere_surface_temperature.length ||
    !output.series.southern_hemisphere_surface_temperature.length ||
    !output.series.arctic_surface_temperature.length ||
    !output.series.antarctic_surface_temperature.length ||
    !output.series.north_atlantic_sea_surface_temperature.length ||
    !output.series.global_surface_temperature_anomaly.length ||
    !output.series.global_sea_surface_temperature_anomaly.length ||
    !output.series.daily_global_mean_temperature_anomaly.length ||
    !output.series.global_sea_ice_extent.length ||
    !output.series.arctic_sea_ice_extent.length ||
    !output.series.antarctic_sea_ice_extent.length ||
    !output.series.atmospheric_co2.length ||
    !output.series.atmospheric_ch4.length
  ) {
    throw new Error("One or more series are empty after validation; refusing to write incomplete realtime dataset.");
  }

  await mkdir(resolve(ROOT_DIR, "public/data"), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output)}\n`, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

async function run() {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.showHelp) {
    printHelp();
    return;
  }

  if (!options.watch) {
    await updateOnce();
    return;
  }

  const intervalMs = Math.round(options.intervalMinutes * 60_000);
  console.log(
    `Auto-update mode enabled. Refreshing climate data every ${options.intervalMinutes} minute${options.intervalMinutes === 1 ? "" : "s"}.`
  );

  for (;;) {
    const startedAt = Date.now();
    try {
      await updateOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${new Date().toISOString()}] Update failed: ${message}`);
    }

    const elapsedMs = Date.now() - startedAt;
    const waitMs = Math.max(1_000, intervalMs - elapsedMs);
    await sleep(waitMs);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
