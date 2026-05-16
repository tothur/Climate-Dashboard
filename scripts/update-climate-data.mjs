import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = resolve(ROOT_DIR, "public/data/climate-realtime.json");
const MAP_OUTPUT_DIR = resolve(ROOT_DIR, "public/data/maps");
const BUNDLED_ENSO_OUTPUT_PATH = resolve(ROOT_DIR, "src/data/bundled-enso.ts");

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
const NASA_CERES_EBAF_PROJECT_URL = "https://asdc.larc.nasa.gov/project/CERES/CERES_EBAF-TOA_Edition4.2.1";
const NASA_CERES_EBAF_FILE_PATTERN = /CERES_EBAF-TOA_Edition4\.2\.1_\d{6}-\d{6}\.nc/g;
const NASA_CERES_EBAF_TIME_BASE_UTC = Date.UTC(2000, 2, 1);
const WGMS_MASS_CHANGE_ESTIMATES_URL = "https://wgms.ch/mass_change_estimates/";
const WGMS_AMCE_ZIP_PATTERN = /(?:https:\/\/wgms\.ch)?\/downloads\/wgms-amce-\d{4}-\d{2}-\d{2}\.zip/g;
const WGMS_AMCE_GLOBAL_CSV_ENTRY = "global.csv";
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
const IRI_ENSO_CURRENT_URL = "https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/";
const NOAA_CPC_ENSO_DISCUSSION_URL = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml";
const CR_T2_LAST_MAP_DATE_URL = "https://cr.acg.maine.edu/clim/t2_daily/json/last_map_date.json";
const CR_SST_LAST_MAP_DATE_URL = "https://cr.acg.maine.edu/clim/sst_daily/json/dates_sstanom.json";
const MAP_CLIMATOLOGY_PERIOD = "1991-2020";

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
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MONTH_NAME_TO_NUMBER = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
};
const ENSO_SEASON_CODES = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"];
const ENSO_SEASON_CENTER_MONTH = {
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
const MAP_KEYS = ["global_2m_temperature", "global_2m_temperature_anomaly", "global_sst", "global_sst_anomaly"];
const DEFAULT_OPENAI_SUMMARY_MODEL = "gpt-5.4-mini";
const OPENAI_SUMMARY_ALLOWED_MODELS = new Set([DEFAULT_OPENAI_SUMMARY_MODEL]);
const OPENAI_SUMMARY_MAX_OUTPUT_TOKENS = 600;
const OPENAI_SUMMARY_TIMEOUT_MS = 20_000;
const AI_SUMMARY_FINGERPRINT_KEYS = [
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
  "global_mean_sea_level",
  "ocean_heat_content",
  "earth_energy_imbalance",
  "global_glacier_mass_balance",
  "antarctic_ice_sheet_mass_balance",
  "greenland_ice_sheet_mass_balance",
  "global_sea_ice_extent",
  "arctic_sea_ice_extent",
  "antarctic_sea_ice_extent",
  "atmospheric_co2",
  "atmospheric_ch4",
  "atmospheric_aggi",
];
const AI_SUMMARY_DISALLOWED_TEXT_PATTERN = /\brecord\s+lows?\b|\brecord\s+cold\b|\bcoldest\b|\bcooling\b/i;
const AI_SUMMARY_STALE_TEXT_PATTERN = /\bhistorical rank\b/i;
const AI_SUMMARY_SIGNAL_LABELS = {
  global_surface_temperature: "Global Surface Temperature",
  global_sea_surface_temperature: "Global Sea Surface Temperature",
  northern_hemisphere_surface_temperature: "Northern Hemisphere Surface Temperature",
  southern_hemisphere_surface_temperature: "Southern Hemisphere Surface Temperature",
  arctic_surface_temperature: "Arctic Surface Temperature",
  antarctic_surface_temperature: "Antarctic Surface Temperature",
  north_atlantic_sea_surface_temperature: "North Atlantic Sea Surface Temperature",
  global_surface_temperature_anomaly: "Global Surface Temperature Anomaly",
  global_sea_surface_temperature_anomaly: "Global Sea Surface Temperature Anomaly",
  daily_global_mean_temperature_anomaly: "Daily Global Mean Temperature Anomaly",
  global_mean_sea_level: "Global Mean Sea Level",
  ocean_heat_content: "Ocean Heat Content",
  earth_energy_imbalance: "Earth Energy Imbalance",
  global_glacier_mass_balance: "Global Glacier Mass Balance",
  antarctic_ice_sheet_mass_balance: "Antarctic Ice Sheet Mass Balance",
  greenland_ice_sheet_mass_balance: "Greenland Ice Sheet Mass Balance",
  global_sea_ice_extent: "Global Sea Ice Extent",
  arctic_sea_ice_extent: "Arctic Sea Ice Extent",
  antarctic_sea_ice_extent: "Antarctic Sea Ice Extent",
  atmospheric_co2: "Atmospheric CO2",
  atmospheric_ch4: "Atmospheric CH4",
  atmospheric_aggi: "Annual Greenhouse Gas Index",
};
const AI_SUMMARY_SIGNAL_CATEGORIES = {
  northern_hemisphere_surface_temperature: "regional",
  southern_hemisphere_surface_temperature: "regional",
  arctic_surface_temperature: "regional",
  antarctic_surface_temperature: "regional",
  north_atlantic_sea_surface_temperature: "oceanic",
  global_mean_sea_level: "oceanic",
  ocean_heat_content: "oceanic",
  earth_energy_imbalance: "energy imbalance",
  global_glacier_mass_balance: "cryosphere",
  antarctic_ice_sheet_mass_balance: "cryosphere",
  greenland_ice_sheet_mass_balance: "cryosphere",
  global_sea_ice_extent: "sea ice",
  arctic_sea_ice_extent: "sea ice",
  antarctic_sea_ice_extent: "sea ice",
  atmospheric_co2: "forcing",
  atmospheric_ch4: "forcing",
  atmospheric_aggi: "forcing",
};

function toFiniteNumber(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingReanalyzerValue(value) {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized === "null" || normalized === "nan" || normalized === "na";
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-")
    .replace(/&deg;/gi, " deg ")
    .replace(/&#37;/g, "%")
    .replace(/&Ntilde;/g, "N")
    .replace(/&ntilde;/g, "n");
}

function stripHtmlTags(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ");
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(stripHtmlTags(value)).replace(/\s+/g, " ").trim();
}

function isPngBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < PNG_SIGNATURE.length) return false;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
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

function dateFromDecimalYear(decimalYear) {
  if (!Number.isFinite(decimalYear)) return null;
  const year = Math.trunc(decimalYear);
  if (!Number.isFinite(year) || year < 1800 || year > 2200) return null;
  const fraction = Math.max(0, Math.min(0.999999, decimalYear - year));
  const month = Math.max(1, Math.min(12, Math.floor(fraction * 12) + 1));
  return formatDateFromParts(year, month, 1);
}

function monthDateFromUtcTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return formatDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function extractLatestGlobalMeanSeaLevelUrl(homepageHtml) {
  let latestYear = -Infinity;
  let latestUrl = null;

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

function buildGlobalMeanSeaLevelCandidateUrls(homepageHtml) {
  const candidateUrls = [];
  const discoveredUrl = extractLatestGlobalMeanSeaLevelUrl(homepageHtml);
  if (discoveredUrl) candidateUrls.push(discoveredUrl);

  const currentYear = new Date().getUTCFullYear();
  for (let year = currentYear; year >= currentYear - 2; year -= 1) {
    candidateUrls.push(`${SEA_LEVEL_RESEARCH_GROUP_URL}files/${year}_rel1/gmsl_${year}rel1_seasons_rmvd.txt`);
  }

  return Array.from(new Set(candidateUrls));
}

async function loadGlobalMeanSeaLevelSource() {
  let homepageHtml = "";
  try {
    homepageHtml = await fetchText(SEA_LEVEL_RESEARCH_GROUP_URL);
  } catch {}

  let lastError = null;
  for (const url of buildGlobalMeanSeaLevelCandidateUrls(homepageHtml)) {
    try {
      const text = await fetchText(url);
      return { text, sourceUrl: url };
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : "no release URL could be resolved";
  throw new Error(`Failed to fetch a Colorado global mean sea level release: ${reason}`);
}

function parseEnglishLongDateToIso(rawDate) {
  const normalized = String(rawDate ?? "").trim().replace(/,\s*/g, " ");
  let match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(normalized);
  if (match) {
    const day = Number(match[1]);
    const month = MONTH_NAME_TO_NUMBER[match[2]];
    const year = Number(match[3]);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    return formatDateFromParts(year, month, day);
  }

  match = /^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/.exec(normalized);
  if (!match) return null;
  const month = MONTH_NAME_TO_NUMBER[match[1]];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  return formatDateFromParts(year, month, day);
}

function parseIsoDateToUtc(dateIso) {
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseStoredMapAsset(rawAsset) {
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

async function loadPreviousMapSources() {
  if (!(await fileExists(OUTPUT_PATH))) return {};

  try {
    const payload = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    if (!isRecord(payload) || !isRecord(payload.maps)) return {};

    const previousMapSources = {};
    for (const key of MAP_KEYS) {
      const asset = parseStoredMapAsset(payload.maps[key]);
      if (asset) previousMapSources[key] = asset;
    }
    return previousMapSources;
  } catch {
    return {};
  }
}

async function loadPreviousAiSummary() {
  if (!(await fileExists(OUTPUT_PATH))) return null;

  try {
    const payload = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    const aiSummary = isRecord(payload) && isRecord(payload.aiSummary) ? payload.aiSummary : null;
    if (!aiSummary) return null;

    const textEn = typeof aiSummary.textEn === "string" ? aiSummary.textEn.trim() : "";
    const generatedAtIso =
      typeof aiSummary.generatedAtIso === "string" && Number.isFinite(Date.parse(aiSummary.generatedAtIso))
        ? aiSummary.generatedAtIso
        : "";
    const model = typeof aiSummary.model === "string" ? aiSummary.model.trim() : "";
    const source = aiSummary.source === "openai" || aiSummary.source === "local" ? aiSummary.source : null;
    const fingerprint = typeof aiSummary.fingerprint === "string" ? aiSummary.fingerprint.trim() : "";
    if (!textEn || !generatedAtIso || !model || !source || !fingerprint) return null;

    const temperatureChecks = Array.isArray(aiSummary.temperatureChecks)
      ? aiSummary.temperatureChecks.filter(
          (entry) =>
            isRecord(entry) &&
            (entry.key === "global_surface_temperature" || entry.key === "global_sea_surface_temperature") &&
            (entry.tone === "critical" || entry.tone === "watch" || entry.tone === "normal")
        )
      : [];

    return {
      textEn,
      textHu: typeof aiSummary.textHu === "string" && aiSummary.textHu.trim().length > 0 ? aiSummary.textHu.trim() : null,
      generatedAtIso,
      model,
      source,
      fingerprint,
      temperatureChecks,
      usage: isRecord(aiSummary.usage) ? aiSummary.usage : undefined,
    };
  } catch {
    return null;
  }
}

function formatMapDateCandidate(year, month, day) {
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null;
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  return formatDateFromParts(year, month, day);
}

function collectMapDateCandidates(payload, candidates, depth = 0) {
  if (depth > 5 || payload == null) return;

  if (typeof payload === "string") {
    const token = payload.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) candidates.push(token);
    return;
  }

  if (Array.isArray(payload)) {
    if (payload.length >= 6) {
      const legacyDate = formatMapDateCandidate(Number(payload[3]), Number(payload[4]), Number(payload[5]));
      if (legacyDate) candidates.push(legacyDate);
    }

    for (let index = 0; index <= payload.length - 3; index += 1) {
      const tupleDate = formatMapDateCandidate(Number(payload[index]), Number(payload[index + 1]), Number(payload[index + 2]));
      if (tupleDate) candidates.push(tupleDate);
    }

    for (const entry of payload) {
      collectMapDateCandidates(entry, candidates, depth + 1);
    }
    return;
  }

  if (typeof payload !== "object") return;
  const record = payload;

  const dateKeys = ["date", "latest_date", "last_date", "map_date", "latestDate", "lastDate", "updated"];
  for (const key of dateKeys) {
    const token = typeof record[key] === "string" ? record[key].trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) candidates.push(token);
  }

  const ymdDate = formatMapDateCandidate(
    Number(record.year ?? record.y ?? record.yr),
    Number(record.month ?? record.mon ?? record.m),
    Number(record.day ?? record.dy ?? record.d)
  );
  if (ymdDate) candidates.push(ymdDate);

  for (const value of Object.values(record)) {
    collectMapDateCandidates(value, candidates, depth + 1);
  }
}

function dateIsoFromMapDatePayload(payload) {
  const candidates = [];
  collectMapDateCandidates(payload, candidates);
  if (!candidates.length) return null;

  const dated = candidates
    .map((dateIso) => ({ dateIso, timestamp: parseIsoDateToUtc(dateIso) }))
    .filter((entry) => entry.timestamp != null)
    .sort((left, right) => left.timestamp - right.timestamp);

  return dated.length ? dated[dated.length - 1].dateIso : null;
}

function yearDayFromIso(dateIso) {
  const parsed = parseIsoDateToUtc(dateIso);
  if (parsed == null) return null;
  const date = new Date(parsed);
  const year = date.getUTCFullYear();
  const dayOfYear = Math.floor((parsed - Date.UTC(year, 0, 1)) / DAY_MS) + 1;
  if (!Number.isFinite(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null;
  return {
    year,
    dayOfYear,
  };
}

function mapDayToken(dayOfYear) {
  return String(Math.max(1, Math.min(366, dayOfYear))).padStart(3, "0");
}

function addUtcDays(dateIso, deltaDays) {
  const parsed = parseIsoDateToUtc(dateIso);
  if (parsed == null) return null;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return formatIsoDate(next);
}

function buildT2MapUrl(year, dayOfYear) {
  const doy = mapDayToken(dayOfYear);
  return `https://cr.acg.maine.edu/clim/t2_daily/maps/t2/world-wt/${year}/t2_world-wt_${year}_d${doy}.png`;
}

function buildT2AnomalyMapUrl(year, dayOfYear) {
  const doy = mapDayToken(dayOfYear);
  return `https://cr.acg.maine.edu/clim/t2_daily/maps/t2anom_${MAP_CLIMATOLOGY_PERIOD}/world-wt/${year}/t2anom_world-wt_${year}_d${doy}.png`;
}

function buildSstMapUrl(year, dayOfYear) {
  const doy = mapDayToken(dayOfYear);
  return `https://cr.acg.maine.edu/clim/sst_daily/maps/sst/world-wt3/${year}/sst_world-wt3_${year}_d${doy}.png`;
}

function buildSstAnomalyMapUrl(year, dayOfYear) {
  const doy = mapDayToken(dayOfYear);
  return `https://cr.acg.maine.edu/clim/sst_daily/maps/sstanom_${MAP_CLIMATOLOGY_PERIOD}/world-wt3/${year}/sstanom_world-wt3_${year}_d${doy}.png`;
}

function buildMapSearchOffsets(maxBackDays, maxForwardDays) {
  const offsets = [];
  for (let forward = Math.max(0, maxForwardDays); forward >= 1; forward -= 1) {
    offsets.push(forward);
  }
  offsets.push(0);
  for (let back = 1; back <= Math.max(0, maxBackDays); back += 1) {
    offsets.push(-back);
  }
  return offsets;
}

async function downloadMapWithFallback(dateIso, buildUrl, options = {}) {
  if (!dateIso) throw new Error("Missing map date.");
  let lastError = null;
  const maxBackDays = Number.isFinite(options.maxBackDays) ? Number(options.maxBackDays) : 35;
  const maxForwardDays = Number.isFinite(options.maxForwardDays) ? Number(options.maxForwardDays) : 2;
  const offsets = buildMapSearchOffsets(maxBackDays, maxForwardDays);
  const seenDates = new Set();

  for (const offset of offsets) {
    const candidateDate = addUtcDays(dateIso, offset);
    if (!candidateDate || seenDates.has(candidateDate)) continue;
    seenDates.add(candidateDate);
    const candidate = yearDayFromIso(candidateDate);
    if (!candidate) continue;

    const url = buildUrl(candidate.year, candidate.dayOfYear);
    try {
      const bytes = await fetchBinary(url);
      if (bytes instanceof Uint8Array && bytes.length > 0 && isPngBytes(bytes)) {
        return { bytes, url, dateIso: candidateDate };
      }
      lastError = new Error(`Non-PNG response received for ${url}`);
    } catch (error) {
      lastError = error;
    }
  }

  const reason =
    lastError instanceof Error
      ? lastError.message
      : lastError != null
        ? String(lastError)
        : "No map files found in forward/backward search window.";
  throw new Error(`Failed to download map after fallback attempts: ${reason}`);
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

      if (responseType === "json") return await response.json();
      if (responseType === "arrayBuffer") return new Uint8Array(await response.arrayBuffer());
      return await response.text();
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

async function fetchBinary(url) {
  return await fetchWithRetry(url, "arrayBuffer");
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

function parseNoaaAggiCsv(rawCsv) {
  const points = [];
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

function parseLooseDateToken(token) {
  const value = String(token ?? "").trim();
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

function parseNceiOceanHeatContentCsv(rawCsv) {
  const points = [];
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

function parseGlobalMeanSeaLevelText(rawText) {
  const points = [];
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

    const anomaly19912020 = toFiniteNumber(columns[anomalyColumn]);
    if (anomaly19912020 == null) continue;
    const value = anomaly19912020 + ECMWF_PREINDUSTRIAL_OFFSET_C;

    points.push({ date, value });
  }

  return normalizePoints(points);
}

function extractLatestCeresEebafDatasetName(rawHtml) {
  const matches = String(rawHtml ?? "").match(NASA_CERES_EBAF_FILE_PATTERN) ?? [];
  if (!matches.length) return null;
  return matches.sort().at(-1) ?? null;
}

function buildCeresEarthEnergyImbalanceAsciiUrl(fileName) {
  return `${NASA_CERES_EBAF_OPENDAP_BASE_URL}/${fileName}.ascii?time,gtoa_net_all_mon`;
}

function parseCeresEarthEnergyImbalanceAscii(rawText) {
  const lines = String(rawText ?? "").split(/\r?\n/);
  let timeValues = [];
  let fluxValues = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("time,")) {
      timeValues = line
        .split(",")
        .slice(1)
        .map((token) => toFiniteNumber(token))
        .filter((value) => value != null);
    } else if (line.startsWith("gtoa_net_all_mon.gtoa_net_all_mon,")) {
      fluxValues = line
        .split(",")
        .slice(1)
        .map((token) => toFiniteNumber(token))
        .filter((value) => value != null && value > -998);
    }
  }

  if (!timeValues.length || !fluxValues.length) return [];

  const points = [];
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

function readUint16Le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32Le(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function extractZipEntryText(zipBytes, entryName) {
  if (!(zipBytes instanceof Uint8Array) || zipBytes.length < 22) {
    throw new Error("WGMS ZIP archive was empty or invalid.");
  }

  let eocdOffset = -1;
  for (let offset = zipBytes.length - 22; offset >= 0; offset -= 1) {
    if (readUint32Le(zipBytes, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error("WGMS ZIP archive is missing the end-of-central-directory record.");
  }

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
      if (readUint32Le(zipBytes, localHeaderOffset) !== 0x04034b50) {
        throw new Error(`WGMS ZIP local header for ${entryName} was invalid.`);
      }

      const localFileNameLength = readUint16Le(zipBytes, localHeaderOffset + 26);
      const localExtraLength = readUint16Le(zipBytes, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      const compressedBytes = zipBytes.subarray(dataStart, dataEnd);

      if (compressionMethod === 0) {
        return decoder.decode(compressedBytes);
      }
      if (compressionMethod === 8) {
        return decoder.decode(inflateRawSync(compressedBytes));
      }

      throw new Error(`WGMS ZIP entry ${entryName} used unsupported compression method ${compressionMethod}.`);
    }

    offset += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  throw new Error(`WGMS ZIP archive did not contain ${entryName}.`);
}

function extractWgmsAmceZipUrl(rawHtml) {
  const matches = String(rawHtml ?? "").match(WGMS_AMCE_ZIP_PATTERN) ?? [];
  if (!matches.length) return null;
  return new URL(matches[matches.length - 1], WGMS_MASS_CHANGE_ESTIMATES_URL).toString();
}

function parseWgmsGlobalGlacierCsv(rawCsv) {
  const points = [];
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

function parseNasaMassVariationChartJson(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];

  const points = [];
  for (const item of payload.items) {
    if (!isRecord(item)) continue;
    if (item.y == null) continue;
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

function buildCumulativeLossSeries(points) {
  const normalized = normalizePoints(points);
  if (!normalized.length) return [];

  const baseline = normalized[0].value;
  return normalized.map((point) => ({
    date: point.date,
    value: Math.round((baseline - point.value) * 1000) / 1000,
  }));
}

function normalizeEnsoCondition(rawValue) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ");

  if (normalized.includes("neutral")) return "neutral";
  if (normalized.includes("la nina")) return "la_nina";
  if (normalized.includes("el nino")) return "el_nino";
  return null;
}

function extractEnsoWindowFromClause(clause) {
  const cleanClause = String(clause ?? "").replace(/\s+/g, " ").trim();
  if (!cleanClause) return null;

  const probabilityMatch = cleanClause.match(/(\d{1,3})\s*%\s*chance/i);
  if (!probabilityMatch) return null;

  const conditionMatches = [...cleanClause.matchAll(/ENSO-neutral|El Nino|La Nina/gi)];
  if (!conditionMatches.length) return null;

  const lastCondition = conditionMatches[conditionMatches.length - 1]?.[0] ?? "";
  const condition = normalizeEnsoCondition(lastCondition);
  if (!condition) return null;

  let targetLabel = null;
  const chanceInMatch = cleanClause.match(/\(\s*\d{1,3}\s*%\s*chance\s+in\s+([^)]+?)\s*\)/i);
  if (chanceInMatch) {
    targetLabel = chanceInMatch[1].trim();
  } else {
    const inlinePeriodMatch = cleanClause.match(/\bin\s+([A-Za-z]+(?:-[A-Za-z]+)*(?:\s+[A-Za-z]+(?:-[A-Za-z]+)*)?\s+\d{4})/i);
    if (inlinePeriodMatch) {
      targetLabel = inlinePeriodMatch[1].trim();
    }
  }

  return {
    condition,
    probability: Number(probabilityMatch[1]),
    targetLabel,
  };
}

function parseCpcEnsoOutlook(html) {
  const rawHtml = String(html ?? "");
  if (!rawHtml.trim()) return null;

  const issuedMatch = cleanHtmlText(rawHtml).match(/\b\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\b/);
  const issuedDate = issuedMatch ? parseEnglishLongDateToIso(issuedMatch[0]) : null;

  const synopsisMatch = rawHtml.match(/<u>\s*Synopsis:\s*<\/u>\s*&nbsp;\s*<strong>([\s\S]*?)<\/strong>/i);
  const synopsis = synopsisMatch ? cleanHtmlText(synopsisMatch[1]) : null;

  const pageText = cleanHtmlText(rawHtml);
  const alertStatusMatch = pageText.match(/ENSO Alert System Status:\s*(.*?)\s*Synopsis:/i);
  const alertStatus = alertStatusMatch ? alertStatusMatch[1].trim() : null;

  const clauses = synopsis ? synopsis.split(/\s*,\s+with\s+/i) : [];
  let nextThreeMonths = clauses.length ? extractEnsoWindowFromClause(clauses[0]) : null;
  let nextSixMonths = clauses.length > 1 ? extractEnsoWindowFromClause(clauses.slice(1).join(", with ")) : null;

  // CPC periodically changes synopsis prose. Some editions describe multiple forecast
  // windows in one sentence, e.g. "... (82% chance in May-July 2026) and continue ...
  // (96% chance in December 2026-February 2027)." Preserve those windows even when
  // there is no ", with " separator to split on.
  if ((!nextThreeMonths || !nextSixMonths) && synopsis) {
    const synopsisConditionMatches = [...synopsis.matchAll(/ENSO-neutral|El Nino|La Nina/gi)];
    const inheritedCondition = normalizeEnsoCondition(
      synopsisConditionMatches[synopsisConditionMatches.length - 1]?.[0] ?? ""
    );
    const chanceWindows = Array.from(
      synopsis.matchAll(/\(\s*(\d{1,3})\s*%\s*chance\s+in\s+([^)]+?)\s*\)/gi),
      (match) => ({
        condition: inheritedCondition,
        probability: Number(match[1]),
        targetLabel: match[2].trim(),
      })
    ).filter(
      (window) =>
        window.condition != null &&
        Number.isFinite(window.probability) &&
        window.probability >= 0 &&
        window.probability <= 100 &&
        window.targetLabel.length > 0
    );

    if (!nextThreeMonths && chanceWindows.length > 0) {
      nextThreeMonths = chanceWindows[0];
    }
    if (!nextSixMonths && chanceWindows.length > 1) {
      nextSixMonths = chanceWindows[chanceWindows.length - 1];
    }
  }

  return {
    issuedDate,
    alertStatus,
    synopsis,
    sourceLabel: "NOAA CPC ENSO Diagnostic Discussion",
    sourceUrl: NOAA_CPC_ENSO_DISCUSSION_URL,
    nextThreeMonths,
    nextSixMonths,
  };
}

function buildEnsoWindowFromProbabilities(targetLabel, laNinaProbability, neutralProbability, elNinoProbability) {
  const probabilities = [
    { condition: "la_nina", probability: Number(laNinaProbability) },
    { condition: "neutral", probability: Number(neutralProbability) },
    { condition: "el_nino", probability: Number(elNinoProbability) },
  ].filter((entry) => Number.isFinite(entry.probability));

  if (!probabilities.length) return null;

  probabilities.sort((left, right) => right.probability - left.probability);
  const strongest = probabilities[0];
  return {
    condition: strongest.condition,
    probability: strongest.probability,
    targetLabel,
  };
}

function assignIriSeasonYears(rows, issuedDate) {
  const parsedIssued = typeof issuedDate === "string" ? Date.parse(`${issuedDate}T00:00:00Z`) : Number.NaN;
  const issuedDateValue = Number.isFinite(parsedIssued) ? new Date(parsedIssued) : new Date();
  const issueOrdinal = issuedDateValue.getUTCFullYear() * 12 + issuedDateValue.getUTCMonth();
  let previousOrdinal = issueOrdinal - 1;

  return rows.map((row, index) => {
    const centerMonth = ENSO_SEASON_CENTER_MONTH[row.season];
    if (!Number.isFinite(centerMonth)) return row;

    let year = issuedDateValue.getUTCFullYear();
    let ordinal = year * 12 + (centerMonth - 1);
    const minOrdinal = index === 0 ? issueOrdinal : previousOrdinal + 1;
    while (ordinal < minOrdinal) {
      year += 1;
      ordinal = year * 12 + (centerMonth - 1);
    }

    previousOrdinal = ordinal;
    return {
      ...row,
      year: String(year),
      targetLabel: `${row.season} ${year}`,
    };
  });
}

function parseIriEnsoOutlook(html) {
  const rawHtml = String(html ?? "");
  if (!rawHtml.trim()) return null;

  const pageText = cleanHtmlText(rawHtml);
  const issuedMatch = pageText.match(/Published:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  const issuedDate = issuedMatch ? parseEnglishLongDateToIso(issuedMatch[1]) : null;
  const forecastYear = issuedDate ? Number(issuedDate.slice(0, 4)) : new Date().getUTCFullYear();

  const rows = [];
  const rowKeys = new Set();
  const seasonPattern = new RegExp(
    `\\b(${ENSO_SEASON_CODES.join("|")})\\s+(\\d{1,3})\\s+(\\d{1,3})\\s+(\\d{1,3})\\b`,
    "g"
  );
  for (const match of pageText.matchAll(seasonPattern)) {
    const season = match[1];
    const key = season;
    if (rowKeys.has(key)) continue;
    rowKeys.add(key);
    rows.push({
      season,
      year: String(forecastYear),
      targetLabel: `${season} ${forecastYear}`,
      laNinaProbability: Number(match[2]),
      neutralProbability: Number(match[3]),
      elNinoProbability: Number(match[4]),
    });
  }

  if (!rows.length) return null;
  const datedRows = assignIriSeasonYears(rows, issuedDate);

  const discussionMatch = pageText.match(
    /Most recent model forecasts indicate([\s\S]*?)(?:For the [A-Za-z]{3}-[A-Za-z]{3}\s+\d{4}(?:\/\d{2,4})?\s+season|Season La Ni|Based on the latest observations)/i
  );
  const synopsis = discussionMatch ? `Most recent model forecasts indicate${discussionMatch[1].trim()}` : null;

  const nextSeasonRow = datedRows[0];
  const nextThreeMonths = buildEnsoWindowFromProbabilities(
    nextSeasonRow?.targetLabel ?? null,
    nextSeasonRow?.laNinaProbability,
    nextSeasonRow?.neutralProbability,
    nextSeasonRow?.elNinoProbability
  );
  const mediumRangeRow = datedRows[Math.min(4, datedRows.length - 1)];
  const nextSixMonths = buildEnsoWindowFromProbabilities(
    mediumRangeRow?.targetLabel ?? null,
    mediumRangeRow?.laNinaProbability,
    mediumRangeRow?.neutralProbability,
    mediumRangeRow?.elNinoProbability
  );

  return {
    issuedDate,
    alertStatus: null,
    synopsis,
    sourceLabel: "IRI ENSO Forecast",
    sourceUrl: IRI_ENSO_CURRENT_URL,
    nextThreeMonths,
    nextSixMonths,
  };
}

function renderBundledEnsoModule(ensoOutlook) {
  return `import type { EnsoOutlook } from "../domain/model";

export const BUNDLED_ENSO_OUTLOOK: EnsoOutlook | null = ${JSON.stringify(ensoOutlook ?? null, null, 2)};
`;
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

function latestFinitePoint(series) {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const point = series[index];
    if (Number.isFinite(point?.value)) return point;
  }
  return null;
}

function sameDateTemperatureCheck(key, series) {
  const latestPoint = latestFinitePoint(series);
  if (!latestPoint || !/^\d{4}-\d{2}-\d{2}$/.test(latestPoint.date)) return null;

  const monthDay = latestPoint.date.slice(5);
  const historicalValues = [];
  const baselineValues = [];

  for (const point of series) {
    if (!point?.date || point.date.slice(5) !== monthDay || !Number.isFinite(point.value)) continue;
    const year = Number(point.date.slice(0, 4));
    if (point.date < latestPoint.date) historicalValues.push(point.value);
    if (year >= 1991 && year <= 2020) baselineValues.push(point.value);
  }

  if (!historicalValues.length) return null;
  const baselineMean = baselineValues.length ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length : null;
  const previousRecord = Math.max(...historicalValues);
  const differenceFromMean = baselineMean == null ? null : latestPoint.value - baselineMean;
  const differenceFromRecord = latestPoint.value - previousRecord;
  const rank = [...historicalValues, latestPoint.value].filter((value) => value > latestPoint.value).length + 1;
  const watchThreshold = key === "global_sea_surface_temperature" ? 0.35 : 0.5;
  const nearRecordMargin = key === "global_sea_surface_temperature" ? 0.05 : 0.12;
  const tone =
    differenceFromRecord >= -0.005
      ? "critical"
      : rank <= 3 || (differenceFromMean != null && differenceFromMean >= watchThreshold) || differenceFromRecord >= -nearRecordMargin
        ? "watch"
        : "normal";

  return {
    key,
    latestDate: latestPoint.date,
    latestValue: Math.round(latestPoint.value * 1000) / 1000,
    baselineMean: baselineMean == null ? null : Math.round(baselineMean * 1000) / 1000,
    differenceFromMean: differenceFromMean == null ? null : Math.round(differenceFromMean * 1000) / 1000,
    previousRecord: Math.round(previousRecord * 1000) / 1000,
    differenceFromRecord: Math.round(differenceFromRecord * 1000) / 1000,
    rank,
    sampleSize: historicalValues.length + 1,
    tone,
  };
}

function sameDateRankSignal(key, series, { direction = "high", watchRank = 3, nearRecordMargin = null } = {}) {
  const latestPoint = latestFinitePoint(series);
  if (!latestPoint || !/^\d{4}-\d{2}-\d{2}$/.test(latestPoint.date)) return null;

  const monthDay = latestPoint.date.slice(5);
  const historicalValues = [];

  for (const point of series) {
    if (!point?.date || point.date.slice(5) !== monthDay || !Number.isFinite(point.value) || point.date >= latestPoint.date) continue;
    historicalValues.push(point.value);
  }

  if (historicalValues.length < 20) return null;

  const betterThanLatest =
    direction === "low"
      ? historicalValues.filter((value) => value < latestPoint.value).length
      : historicalValues.filter((value) => value > latestPoint.value).length;
  const rank = betterThanLatest + 1;
  const record = direction === "low" ? Math.min(...historicalValues) : Math.max(...historicalValues);
  const differenceFromRecord = latestPoint.value - record;
  const nearRecord =
    nearRecordMargin == null
      ? false
      : direction === "low"
        ? differenceFromRecord <= nearRecordMargin
        : differenceFromRecord >= -nearRecordMargin;
  const tone = rank === 1 || nearRecord ? "critical" : rank <= watchRank ? "watch" : "normal";
  if (tone === "normal") return null;

  return {
    key,
    label: AI_SUMMARY_SIGNAL_LABELS[key] ?? key,
    category: AI_SUMMARY_SIGNAL_CATEGORIES[key] ?? "climate",
    tone,
    direction,
    basis: "same-date historical rank",
    latestDate: latestPoint.date,
    latestValue: Math.round(latestPoint.value * 1000) / 1000,
    recordValue: Math.round(record * 1000) / 1000,
    differenceFromRecord: Math.round(differenceFromRecord * 1000) / 1000,
    rank,
    sampleSize: historicalValues.length + 1,
  };
}

function historicalRankSignal(key, series, { direction = "high", watchRank = 3, minSampleSize = 20 } = {}) {
  const latestPoint = latestFinitePoint(series);
  if (!latestPoint) return null;

  const historicalValues = series
    .filter((point) => point?.date < latestPoint.date && Number.isFinite(point.value))
    .map((point) => point.value);
  if (historicalValues.length < minSampleSize) return null;

  const betterThanLatest =
    direction === "low"
      ? historicalValues.filter((value) => value < latestPoint.value).length
      : historicalValues.filter((value) => value > latestPoint.value).length;
  const rank = betterThanLatest + 1;
  const record = direction === "low" ? Math.min(...historicalValues) : Math.max(...historicalValues);
  const mean = historicalValues.reduce((sum, value) => sum + value, 0) / historicalValues.length;
  const variance = historicalValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / historicalValues.length;
  const stdDev = variance > 0 ? Math.sqrt(variance) : null;
  const zScore = stdDev ? (latestPoint.value - mean) / stdDev : null;
  const severityScore = zScore == null ? null : direction === "low" ? -zScore : zScore;
  const tone =
    rank === 1 || (severityScore != null && severityScore >= 3)
      ? "critical"
      : rank <= watchRank || (severityScore != null && severityScore >= 2.5)
        ? "watch"
        : "normal";
  if (tone === "normal") return null;

  return {
    key,
    label: AI_SUMMARY_SIGNAL_LABELS[key] ?? key,
    category: AI_SUMMARY_SIGNAL_CATEGORIES[key] ?? "climate",
    tone,
    direction,
    basis: "full-record historical rank",
    latestDate: latestPoint.date,
    latestValue: Math.round(latestPoint.value * 1000) / 1000,
    recordValue: Math.round(record * 1000) / 1000,
    differenceFromRecord: Math.round((latestPoint.value - record) * 1000) / 1000,
    zScore: zScore == null ? null : Math.round(zScore * 100) / 100,
    rank,
    sampleSize: historicalValues.length + 1,
  };
}

function signalPriority(signal) {
  const categoryPriority = {
    regional: 4,
    oceanic: 4,
    cryosphere: 4,
    "energy imbalance": 4,
    "sea ice": 4,
    forcing: 3,
    climate: 2,
  };
  return (
    (signal.tone === "critical" ? 100 : 50) +
    (categoryPriority[signal.category] ?? 1) * 5 +
    Math.max(0, 8 - signal.rank)
  );
}

function buildAiSummaryAnomalySignals(series) {
  const signalBuilders = [
    () => sameDateRankSignal("northern_hemisphere_surface_temperature", series.northern_hemisphere_surface_temperature, { nearRecordMargin: 0.12 }),
    () => sameDateRankSignal("southern_hemisphere_surface_temperature", series.southern_hemisphere_surface_temperature, { nearRecordMargin: 0.12 }),
    () => sameDateRankSignal("arctic_surface_temperature", series.arctic_surface_temperature, { nearRecordMargin: 0.3 }),
    () => sameDateRankSignal("antarctic_surface_temperature", series.antarctic_surface_temperature, { nearRecordMargin: 0.3 }),
    () => sameDateRankSignal("north_atlantic_sea_surface_temperature", series.north_atlantic_sea_surface_temperature, { nearRecordMargin: 0.08 }),
    () => historicalRankSignal("global_mean_sea_level", series.global_mean_sea_level),
    () => historicalRankSignal("ocean_heat_content", series.ocean_heat_content),
    () => historicalRankSignal("earth_energy_imbalance", series.earth_energy_imbalance),
    () => historicalRankSignal("global_glacier_mass_balance", series.global_glacier_mass_balance, { direction: "low" }),
    () => historicalRankSignal("antarctic_ice_sheet_mass_balance", series.antarctic_ice_sheet_mass_balance),
    () => historicalRankSignal("greenland_ice_sheet_mass_balance", series.greenland_ice_sheet_mass_balance),
    () => sameDateRankSignal("global_sea_ice_extent", series.global_sea_ice_extent, { direction: "low", nearRecordMargin: 0.15 }),
    () => sameDateRankSignal("arctic_sea_ice_extent", series.arctic_sea_ice_extent, { direction: "low", nearRecordMargin: 0.1 }),
    () => sameDateRankSignal("antarctic_sea_ice_extent", series.antarctic_sea_ice_extent, { direction: "low", nearRecordMargin: 0.1 }),
    () => historicalRankSignal("atmospheric_co2", series.atmospheric_co2),
    () => historicalRankSignal("atmospheric_ch4", series.atmospheric_ch4),
    () => historicalRankSignal("atmospheric_aggi", series.atmospheric_aggi),
  ];

  return signalBuilders
    .map((buildSignal) => buildSignal())
    .filter(Boolean)
    .sort((left, right) => signalPriority(right) - signalPriority(left) || left.label.localeCompare(right.label))
    .slice(0, 6);
}

function buildAiSummaryFingerprint(summary, ensoOutlook) {
  const compact = {
    series: Object.fromEntries(
      AI_SUMMARY_FINGERPRINT_KEYS.map((key) => [
        key,
        {
          latestDate: summary[key]?.latestDate ?? null,
          latestValue: summary[key]?.latestValue ?? null,
        },
      ])
    ),
    enso: ensoOutlook?.nextSixMonths
      ? {
          condition: ensoOutlook.nextSixMonths.condition,
          probability: ensoOutlook.nextSixMonths.probability,
          targetLabel: ensoOutlook.nextSixMonths.targetLabel,
        }
      : null,
  };
  return Buffer.from(JSON.stringify(compact)).toString("base64url").slice(0, 64);
}

function aiSummaryModel(warnings) {
  const requestedModel = process.env.OPENAI_SUMMARY_MODEL?.trim();
  if (!requestedModel) return DEFAULT_OPENAI_SUMMARY_MODEL;
  if (OPENAI_SUMMARY_ALLOWED_MODELS.has(requestedModel)) return requestedModel;

  warnings.push("OpenAI daily summary model was not allowed; using gpt-5.4-mini.");
  return DEFAULT_OPENAI_SUMMARY_MODEL;
}

function anomalySignalPhrase(signal) {
  const scope = signal.basis === "same-date historical rank" ? "for this date" : "in its historical record";
  const rankText =
    signal.direction === "low"
      ? signal.rank === 1
        ? `is the lowest observed value ${scope}`
        : `is among the lowest observed values ${scope}`
      : signal.rank === 1
        ? `is at a record high ${scope}`
        : `is near a record high ${scope}`;
  return `${signal.label} ${rankText}`;
}

function buildTemperatureSummaryTextEn(temperatureChecks, anomalySignals = []) {
  const warningChecks = temperatureChecks.filter((check) => check.tone !== "normal");
  const normalChecks = temperatureChecks.filter((check) => check.tone === "normal");
  const names = {
    global_surface_temperature: "Global Surface Temperature",
    global_sea_surface_temperature: "Global Sea Surface Temperature",
  };
  const reasons = {
    critical: "latest value is at or above the same-date historical record",
    watch: "latest value is near the same-date historical record",
  };
  const normalText = normalChecks.length
    ? `${normalChecks.map((check) => names[check.key]).join(" and ")} ${
        normalChecks.length === 1 ? "is" : "are"
      } not unusually high versus the same-date historical record.`
    : "Other temperature checks are shown below.";
  const selectedAnomalies = anomalySignals.slice(0, 2);
  const anomalyText = selectedAnomalies.length
    ? `Broader notable signal${selectedAnomalies.length === 1 ? "" : "s"}: ${selectedAnomalies.map(anomalySignalPhrase).join("; ")}.`
    : "Key climate indicators below show the latest available readings.";

  return warningChecks.length
    ? `${warningChecks.map((check) => `${names[check.key]} ${reasons[check.tone]}`).join("; ")}. ${
        anomalySignals.length ? anomalyText : normalText
      }`
    : `Global surface temperature and global sea surface temperature are not unusually high versus their same-date historical records. ${anomalyText}`;
}

function anomalySignalPhraseHu(signal) {
  const recordText = signal.rank === 1 ? "rekordszinten van" : "rekordközeli szinten van";
  return `${signal.label} ${recordText}`;
}

function buildTemperatureSummaryTextHu(temperatureChecks, anomalySignals = []) {
  const warningChecks = temperatureChecks.filter((check) => check.tone !== "normal");
  const normalChecks = temperatureChecks.filter((check) => check.tone === "normal");
  const names = {
    global_surface_temperature: "Globális felszíni hőmérséklet",
    global_sea_surface_temperature: "Globális tengerfelszíni hőmérséklet",
  };
  const reasons = {
    critical: "a legfrissebb érték eléri vagy meghaladja az azonos dátumú történeti rekordot",
    watch: "a legfrissebb érték közel van az azonos dátumú történeti rekordhoz",
  };
  const normalText = normalChecks.length
    ? `${normalChecks.map((check) => names[check.key]).join(" és ")} nem szokatlanul magas az azonos dátumú történeti rekordhoz képest.`
    : "A további hőmérsékleti ellenőrzések lent láthatók.";
  const anomalyText = anomalySignals.length
    ? `További fontos jelzés: ${anomalySignals.slice(0, 2).map(anomalySignalPhraseHu).join("; ")}.`
    : "A lenti fő indikátorok a legfrissebb elérhető adatokat mutatják.";

  return warningChecks.length
    ? `${warningChecks.map((check) => `${names[check.key]} ${reasons[check.tone]}`).join("; ")}. ${
        anomalySignals.length ? anomalyText : normalText
      }`
    : `A globális felszíni hőmérséklet és a globális tengerfelszíni hőmérséklet nem szokatlanul magas az azonos dátumú történeti rekordokhoz képest. ${anomalyText}`;
}

function buildLocalAiSummary({ fingerprint, generatedAtIso, temperatureChecks, anomalySignals }) {
  return {
    textEn: buildTemperatureSummaryTextEn(temperatureChecks, anomalySignals),
    textHu: buildTemperatureSummaryTextHu(temperatureChecks, anomalySignals),
    generatedAtIso,
    model: "local-rules",
    source: "local",
    fingerprint,
    temperatureChecks: temperatureChecks.map(({ key, tone }) => ({ key, tone })),
  };
}

function shouldReusePreviousAiSummary(previousAiSummary, fingerprint, now = new Date()) {
  if (!previousAiSummary) return false;
  if (previousAiSummary.fingerprint === fingerprint) return true;

  const generated = new Date(previousAiSummary.generatedAtIso);
  if (!Number.isFinite(generated.getTime())) return false;
  return generated.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

function extractResponseOutputText(responsePayload) {
  if (!isRecord(responsePayload)) return "";
  if (typeof responsePayload.output_text === "string") return responsePayload.output_text.trim();
  if (!Array.isArray(responsePayload.output)) return "";

  const chunks = [];
  for (const outputItem of responsePayload.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) continue;
      if (typeof contentItem.text === "string") chunks.push(contentItem.text);
    }
  }
  return chunks.join("").trim();
}

function openAiResponseDiagnostic(responsePayload) {
  if (!isRecord(responsePayload)) return "response payload was not an object";
  const status = typeof responsePayload.status === "string" ? responsePayload.status : "unknown";
  const incompleteReason = isRecord(responsePayload.incomplete_details)
    ? responsePayload.incomplete_details.reason ?? "unknown"
    : null;
  const outputTokenCount = isRecord(responsePayload.usage) ? responsePayload.usage.output_tokens : null;
  return [
    `status=${status}`,
    incompleteReason ? `incomplete_reason=${incompleteReason}` : null,
    Number.isFinite(outputTokenCount) ? `output_tokens=${outputTokenCount}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function parseAiSummaryJson(rawText) {
  const trimmed = String(rawText ?? "").trim();
  const jsonText = trimmed.startsWith("{") ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    if (!isRecord(parsed)) return null;
    const textEn = typeof parsed.textEn === "string" ? parsed.textEn.trim() : "";
    if (!textEn || textEn.length > 650) return null;
    const textHu = typeof parsed.textHu === "string" && parsed.textHu.trim().length <= 750 ? parsed.textHu.trim() : null;
    return { textEn, textHu };
  } catch {
    return null;
  }
}

function sentenceCount(text) {
  return String(text ?? "")
    .split(/[.!?]+(?:\s|$)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
}

function buildAllowedContextSignals(summary, ensoOutlook) {
  const signals = [];
  const dailyAnomaly = summary.daily_global_mean_temperature_anomaly;
  const co2 = summary.atmospheric_co2;
  const seaIce = summary.global_sea_ice_extent;

  if (dailyAnomaly?.latestDate && Number.isFinite(dailyAnomaly.latestValue)) {
    signals.push(
      `Daily global mean temperature anomaly is ${dailyAnomaly.latestValue}C versus the approximate 1850-1900 baseline as of ${dailyAnomaly.latestDate}.`
    );
  }
  if (co2?.latestDate && Number.isFinite(co2.latestValue)) {
    signals.push(`Atmospheric CO2 is ${co2.latestValue} ppm as of ${co2.latestDate}.`);
  }
  if (seaIce?.latestDate && Number.isFinite(seaIce.latestValue)) {
    signals.push(`Global sea ice extent is ${seaIce.latestValue} million square kilometers as of ${seaIce.latestDate}.`);
  }
  if (ensoOutlook?.targetLabel && ensoOutlook.condition && Number.isFinite(ensoOutlook.probability)) {
    signals.push(
      `ENSO outlook shows ${ensoOutlook.probability}% probability of ${ensoOutlook.condition.replaceAll("_", " ")} for ${ensoOutlook.targetLabel}.`
    );
  }

  return signals.slice(0, 4);
}

function buildAiSummaryContextSignals(summary, ensoOutlook, anomalySignals) {
  const anomalyContext = anomalySignals.map((signal) => `${anomalySignalPhrase(signal)} as of ${signal.latestDate}.`);
  return [...anomalyContext, ...buildAllowedContextSignals(summary, ensoOutlook)].slice(0, 6);
}

function validateOpenAiSummaryText(openAiSummary, localSummary, temperatureChecks, anomalySignals = []) {
  const textEn = openAiSummary.textEn.trim();
  const textHu = openAiSummary.textHu?.trim() || localSummary.textHu;
  const textEnSentenceCount = sentenceCount(textEn);
  if (
    !textEn ||
    textEn.length > 650 ||
    textEnSentenceCount < 2 ||
    textEnSentenceCount > 3 ||
    AI_SUMMARY_DISALLOWED_TEXT_PATTERN.test(textEn) ||
    AI_SUMMARY_STALE_TEXT_PATTERN.test(textEn)
  ) {
    return null;
  }

  const hasTemperatureWarning = temperatureChecks.some((check) => check.tone !== "normal");
  if (hasTemperatureWarning) {
    const requiredPrefixEn = localSummary.textEn.replace(/\.$/, "");
    const requiredPrefixHu = localSummary.textHu.replace(/\.$/, "");
    if (!textEn.startsWith(requiredPrefixEn.split(".")[0])) return null;
    if (!textHu.startsWith(requiredPrefixHu.split(".")[0])) {
      return {
        textEn,
        textHu: localSummary.textHu,
      };
    }
  } else if (!/not unusually high/i.test(textEn)) {
    return null;
  }

  if (anomalySignals.length) {
    const requiredAnomalyLabels = anomalySignals.slice(0, 3).map((signal) => signal.label.toLowerCase());
    const normalizedText = textEn.toLowerCase();
    if (!requiredAnomalyLabels.some((label) => normalizedText.includes(label))) return null;
  }

  return {
    textEn,
    textHu: textHu.length <= 750 ? textHu : localSummary.textHu,
  };
}

async function requestOpenAiSummary(summaryInput, model) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_SUMMARY_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
    model,
    instructions:
          "You write a compact climate dashboard briefing in 2 or 3 sentences. Use only the supplied JSON facts and the required temperature language. Do not add causes, advice, unsupplied trends, or extra forecasts. Never describe temperatures as record lows or cooling. Return JSON only.",
        input: JSON.stringify(summaryInput),
        text: {
          format: {
            type: "json_schema",
            name: "daily_climate_summary",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                textEn: {
                  type: "string",
                  description: "Two or three concise English sentences. It must follow the supplied temperatureBrief rules.",
                },
                textHu: {
                  type: ["string", "null"],
                  description: "Hungarian equivalent of textEn, or null if a faithful translation is not possible.",
                },
              },
              required: ["textEn", "textHu"],
            },
          },
        },
        max_output_tokens: OPENAI_SUMMARY_MAX_OUTPUT_TOKENS,
        store: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`OpenAI summary request failed with HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 180)}` : ""}`);
    }

    const payload = await response.json();
    const outputText = extractResponseOutputText(payload);
    const parsed = parseAiSummaryJson(outputText);
    if (!parsed) throw new Error(`OpenAI summary response was not valid compact JSON (${openAiResponseDiagnostic(payload)}).`);
    return {
      ...parsed,
      usage: isRecord(payload.usage) ? payload.usage : undefined,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildDailyAiSummary({ summary, series, ensoOutlook, previousAiSummary, generatedAtIso, warnings }) {
  const temperatureChecks = [
    sameDateTemperatureCheck("global_surface_temperature", series.global_surface_temperature),
    sameDateTemperatureCheck("global_sea_surface_temperature", series.global_sea_surface_temperature),
  ].filter(Boolean);
  const anomalySignals = buildAiSummaryAnomalySignals(series);
  const fingerprint = buildAiSummaryFingerprint(summary, ensoOutlook);
  const localSummary = buildLocalAiSummary({ fingerprint, generatedAtIso, temperatureChecks, anomalySignals });
  const hasOpenAiApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const model = aiSummaryModel(warnings);

  if (shouldReusePreviousAiSummary(previousAiSummary, fingerprint, new Date(generatedAtIso))) {
    const validatedPreviousSummary = validateOpenAiSummaryText(previousAiSummary, localSummary, temperatureChecks, anomalySignals);
    const canReusePreviousSummary =
      !hasOpenAiApiKey || (previousAiSummary.source === "openai" && previousAiSummary.model === model);
    if (validatedPreviousSummary && canReusePreviousSummary) {
      return {
        ...previousAiSummary,
        textEn: validatedPreviousSummary.textEn,
        textHu: validatedPreviousSummary.textHu,
        temperatureChecks: temperatureChecks.map(({ key, tone }) => ({ key, tone })),
      };
    }
    warnings.push(
      validatedPreviousSummary
        ? "Previous AI summary cache skipped; refreshing summary text with the configured OpenAI model."
        : "Previous AI summary failed validation; refreshing summary text."
    );
  }

  const hasTemperatureWarning = temperatureChecks.some((check) => check.tone !== "normal");
  const summaryInput = {
    generatedAtIso,
    temperatureBrief: {
      hasWarning: hasTemperatureWarning,
      requiredSentenceEn: localSummary.textEn,
      requiredSentenceHu: localSummary.textHu,
      rules: hasTemperatureWarning
        ? "textEn must start with the first sentence of requiredSentenceEn. textHu must start with the first sentence of requiredSentenceHu. Do not mention normal temperature checks unless they are already in requiredSentenceEn."
        : "textEn must clearly say both global surface temperature and global sea surface temperature are not unusually high versus same-date historical records.",
      checks: temperatureChecks,
    },
    anomalySignals,
    allowedContextSignals: buildAiSummaryContextSignals(summary, ensoOutlook?.nextSixMonths ?? null, anomalySignals),
    requiredBehavior:
      "Temperature status is authoritative. Do not reinterpret the temperature checks. Write 2 or 3 sentences total. Mention temperature status first. If anomalySignals is not empty, include at least one of the first three anomalySignals by label before general context. If you add context, use only anomalySignals or allowedContextSignals items and keep the output compact.",
  };

  try {
    const openAiSummary = await requestOpenAiSummary(summaryInput, model);
    if (!openAiSummary) return localSummary;
    const validatedSummary = validateOpenAiSummaryText(openAiSummary, localSummary, temperatureChecks, anomalySignals);
    if (!validatedSummary) {
      warnings.push("OpenAI daily summary failed validation; using local summary fallback.");
      return localSummary;
    }
    return {
      textEn: validatedSummary.textEn,
      textHu: validatedSummary.textHu,
      generatedAtIso,
      model,
      source: "openai",
      fingerprint,
      temperatureChecks: localSummary.temperatureChecks,
      usage: openAiSummary.usage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ai-summary] ${message}`);
    warnings.push("OpenAI daily summary unavailable; using local summary fallback.");
    return localSummary;
  }
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
    gmslSource,
    ohcCsv,
    nhPayload,
    shPayload,
    arcticPayload,
    antarcticPayload,
    northAtlanticSstPayload,
    northCsv,
    southCsv,
    co2Csv,
    ch4Csv,
    aggiCsv,
    dailyGlobalMeanAnomalyCsv,
    ceresContentsHtml,
    wgmsAmceHtml,
    antarcticaMassVariationPayload,
    greenlandMassVariationPayload,
    iriEnsoHtml,
    ensoDiscussionHtml,
    t2MapDatePayload,
    sstMapDatePayload,
  ] = await Promise.all([
    fetchJson(ERA5_GLOBAL_SURFACE_TEMP_URL),
    fetchJson(OISST_GLOBAL_SST_URL),
    loadGlobalMeanSeaLevelSource(),
    fetchText(NOAA_OCEAN_HEAT_CONTENT_2000M_URL),
    fetchJson(ERA5_NH_SURFACE_TEMP_URL),
    fetchJson(ERA5_SH_SURFACE_TEMP_URL),
    fetchJson(ERA5_ARCTIC_SURFACE_TEMP_URL),
    fetchJson(ERA5_ANTARCTIC_SURFACE_TEMP_URL),
    fetchJson(OISST_NORTH_ATLANTIC_SST_URL),
    fetchText(NSIDC_NORTH_DAILY_EXTENT_URL),
    fetchText(NSIDC_SOUTH_DAILY_EXTENT_URL),
    fetchText(NOAA_MAUNA_LOA_CO2_DAILY_URL),
    fetchText(NOAA_GLOBAL_CH4_MONTHLY_URL),
    fetchText(NOAA_AGGI_CSV_URL),
    fetchText(ECMWF_CLIMATE_PULSE_GLOBAL_2T_DAILY_URL),
    fetchText(NASA_CERES_EBAF_OPENDAP_DIRECTORY_URL),
    fetchText(WGMS_MASS_CHANGE_ESTIMATES_URL),
    fetchJson(NASA_ANTARCTICA_MASS_VARIATION_CHART_URL),
    fetchJson(NASA_GREENLAND_MASS_VARIATION_CHART_URL),
    fetchText(IRI_ENSO_CURRENT_URL),
    fetchText(NOAA_CPC_ENSO_DISCUSSION_URL),
    fetchJson(CR_T2_LAST_MAP_DATE_URL),
    fetchJson(CR_SST_LAST_MAP_DATE_URL),
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
  const globalMeanSeaLevel = sanitizeSeries(parseGlobalMeanSeaLevelText(gmslSource.text), {
    minValue: -200,
    maxValue: 300,
    maxAgeDays: 450,
  });
  const oceanHeatContent = sanitizeSeries(parseNceiOceanHeatContentCsv(ohcCsv), {
    minValue: -50,
    maxValue: 120,
    maxAgeDays: 900,
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
  const atmosphericAggi = sanitizeSeries(parseNoaaAggiCsv(aggiCsv), {
    minValue: 0.5,
    maxValue: 3.5,
    maxAgeDays: 1000,
  });
  const ceresFileName = extractLatestCeresEebafDatasetName(ceresContentsHtml);
  const earthEnergyImbalanceAscii = ceresFileName ? await fetchText(buildCeresEarthEnergyImbalanceAsciiUrl(ceresFileName)) : "";
  const earthEnergyImbalance = sanitizeSeries(parseCeresEarthEnergyImbalanceAscii(earthEnergyImbalanceAscii), {
    minValue: -20,
    maxValue: 20,
    maxAgeDays: 220,
  });
  const wgmsAmceZipUrl = extractWgmsAmceZipUrl(wgmsAmceHtml);
  const wgmsAmceZipBytes = wgmsAmceZipUrl ? await fetchBinary(wgmsAmceZipUrl) : null;
  const wgmsGlobalCsv = wgmsAmceZipBytes ? extractZipEntryText(wgmsAmceZipBytes, WGMS_AMCE_GLOBAL_CSV_ENTRY) : "";
  const globalGlacierMassBalance = sanitizeSeries(parseWgmsGlobalGlacierCsv(wgmsGlobalCsv), {
    minValue: -1200,
    maxValue: 250,
    maxAgeDays: 1600,
  });
  const antarcticMassVariation = parseNasaMassVariationChartJson(antarcticaMassVariationPayload);
  const antarcticIceSheetMassBalance = sanitizeSeries(buildCumulativeLossSeries(antarcticMassVariation), {
    minValue: 0,
    maxValue: 4000,
    maxAgeDays: 430,
  });
  const greenlandMassVariation = parseNasaMassVariationChartJson(greenlandMassVariationPayload);
  const greenlandIceSheetMassBalance = sanitizeSeries(buildCumulativeLossSeries(greenlandMassVariation), {
    minValue: 0,
    maxValue: 7000,
    maxAgeDays: 430,
  });
  const dailyGlobalMeanTemperatureAnomaly = sanitizeSeries(parseEcmwfClimatePulseGlobal2tDailyCsv(dailyGlobalMeanAnomalyCsv), {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
  });
  const ensoOutlook = parseIriEnsoOutlook(iriEnsoHtml) ?? parseCpcEnsoOutlook(ensoDiscussionHtml);

  const todayIso = formatIsoDate(new Date());
  const t2MapDateIso = dateIsoFromMapDatePayload(t2MapDatePayload) ?? globalSurfaceTemperature.at(-1)?.date ?? todayIso;
  const sstMapDateIso = dateIsoFromMapDatePayload(sstMapDatePayload) ?? globalSeaSurfaceTemperature.at(-1)?.date ?? todayIso;
  const mapFiles = {
    global_2m_temperature: "global-2m-temperature.png",
    global_2m_temperature_anomaly: "global-2m-temperature-anomaly.png",
    global_sst: "global-sst.png",
    global_sst_anomaly: "global-sst-anomaly.png",
  };
  const previousMapSources = await loadPreviousMapSources();
  const previousAiSummary = await loadPreviousAiSummary();
  const mapSources = {};
  const mapWarnings = [];

  await mkdir(MAP_OUTPUT_DIR, { recursive: true });

  const mapJobs = [
    {
      key: "global_2m_temperature",
      dateIso: t2MapDateIso,
      fileName: mapFiles.global_2m_temperature,
      buildUrl: buildT2MapUrl,
      sourcePage: "https://climatereanalyzer.org/clim/t2_daily/",
    },
    {
      key: "global_2m_temperature_anomaly",
      dateIso: t2MapDateIso,
      fileName: mapFiles.global_2m_temperature_anomaly,
      buildUrl: buildT2AnomalyMapUrl,
      sourcePage: "https://climatereanalyzer.org/clim/t2_daily/",
    },
    {
      key: "global_sst",
      dateIso: sstMapDateIso,
      fileName: mapFiles.global_sst,
      buildUrl: buildSstMapUrl,
      sourcePage: "https://climatereanalyzer.org/clim/sst_daily/",
    },
    {
      key: "global_sst_anomaly",
      dateIso: sstMapDateIso,
      fileName: mapFiles.global_sst_anomaly,
      buildUrl: buildSstAnomalyMapUrl,
      sourcePage: "https://climatereanalyzer.org/clim/sst_daily/",
    },
  ];

  for (const mapJob of mapJobs) {
    const outputFilePath = resolve(MAP_OUTPUT_DIR, mapJob.fileName);
    try {
      const mapResult = await downloadMapWithFallback(mapJob.dateIso, mapJob.buildUrl);
      await writeFile(outputFilePath, mapResult.bytes);
      mapSources[mapJob.key] = {
        path: `data/maps/${mapJob.fileName}`,
        sourceUrl: mapResult.url,
        sourcePage: mapJob.sourcePage,
        date: mapResult.dateIso,
      };
    } catch (error) {
      const existing = await fileExists(outputFilePath);
      if (existing) {
        const existingBytes = await readFile(outputFilePath).catch(() => null);
        if (existingBytes instanceof Uint8Array && isPngBytes(existingBytes)) {
          const previousMapSource = previousMapSources[mapJob.key];
          if (previousMapSource?.date) {
            mapWarnings.push(`${mapJob.key}: refresh failed; keeping previous map file and metadata.`);
            mapSources[mapJob.key] = {
              path: `data/maps/${mapJob.fileName}`,
              sourceUrl: previousMapSource.sourceUrl,
              sourcePage: previousMapSource.sourcePage ?? mapJob.sourcePage,
              date: previousMapSource.date,
            };
          } else {
            await unlink(outputFilePath).catch(() => {});
            mapWarnings.push(`${mapJob.key}: refresh failed and previous metadata date was missing; removed stale map file.`);
          }
        } else {
          await unlink(outputFilePath).catch(() => {});
          mapWarnings.push(`${mapJob.key}: refresh failed and existing file was invalid; removed stale map file.`);
        }
      } else {
        const reason = error instanceof Error ? error.message : String(error);
        mapWarnings.push(`${mapJob.key}: ${reason}`);
      }
    }
  }

  const generatedAtIso = new Date().toISOString();
  const seriesOutput = {
    global_surface_temperature: globalSurfaceTemperature,
    global_sea_surface_temperature: globalSeaSurfaceTemperature,
    global_mean_sea_level: globalMeanSeaLevel,
    ocean_heat_content: oceanHeatContent,
    earth_energy_imbalance: earthEnergyImbalance,
    global_glacier_mass_balance: globalGlacierMassBalance,
    antarctic_ice_sheet_mass_balance: antarcticIceSheetMassBalance,
    greenland_ice_sheet_mass_balance: greenlandIceSheetMassBalance,
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
    atmospheric_aggi: atmosphericAggi,
  };
  const summaryOutput = Object.fromEntries(Object.entries(seriesOutput).map(([key, series]) => [key, summarize(series)]));
  const aiSummaryWarnings = [];
  const aiSummary = await buildDailyAiSummary({
    summary: summaryOutput,
    series: seriesOutput,
    ensoOutlook,
    previousAiSummary,
    generatedAtIso,
    warnings: aiSummaryWarnings,
  });

  const output = {
    generatedAtIso,
    sources: {
      global_surface_temperature: ERA5_GLOBAL_SURFACE_TEMP_URL,
      global_sea_surface_temperature: OISST_GLOBAL_SST_URL,
      global_mean_sea_level: gmslSource.sourceUrl,
      ocean_heat_content: NOAA_OCEAN_HEAT_CONTENT_2000M_URL,
      earth_energy_imbalance: ceresFileName
        ? buildCeresEarthEnergyImbalanceAsciiUrl(ceresFileName)
        : NASA_CERES_EBAF_PROJECT_URL,
      global_glacier_mass_balance: wgmsAmceZipUrl ?? WGMS_MASS_CHANGE_ESTIMATES_URL,
      antarctic_ice_sheet_mass_balance: NASA_ANTARCTICA_MASS_VARIATION_CHART_URL,
      greenland_ice_sheet_mass_balance: NASA_GREENLAND_MASS_VARIATION_CHART_URL,
      northern_hemisphere_surface_temperature: ERA5_NH_SURFACE_TEMP_URL,
      southern_hemisphere_surface_temperature: ERA5_SH_SURFACE_TEMP_URL,
      arctic_surface_temperature: ERA5_ARCTIC_SURFACE_TEMP_URL,
      antarctic_surface_temperature: ERA5_ANTARCTIC_SURFACE_TEMP_URL,
      north_atlantic_sea_surface_temperature: OISST_NORTH_ATLANTIC_SST_URL,
      global_surface_temperature_anomaly:
        "Derived from ERA5 daily global surface temperature minus 1991-2020 daily climatology from the same feed.",
      global_sea_surface_temperature_anomaly:
        "Derived from OISST v2.1 daily global SST minus 1991-2020 daily climatology from the same feed.",
      daily_global_mean_temperature_anomaly: `${ECMWF_CLIMATE_PULSE_GLOBAL_2T_DAILY_URL} (ano_91-20 adjusted by +${ECMWF_PREINDUSTRIAL_OFFSET_C}C to approximate 1850-1900 preindustrial baseline)`,
      global_sea_ice_extent: "Derived as north + south overlap from NSIDC Sea Ice Index v4 daily files.",
      arctic_sea_ice_extent: NSIDC_NORTH_DAILY_EXTENT_URL,
      antarctic_sea_ice_extent: NSIDC_SOUTH_DAILY_EXTENT_URL,
      atmospheric_co2: NOAA_MAUNA_LOA_CO2_DAILY_URL,
      atmospheric_ch4: NOAA_GLOBAL_CH4_MONTHLY_URL,
      atmospheric_aggi: NOAA_AGGI_CSV_URL,
      enso_outlook: ensoOutlook?.sourceUrl ?? IRI_ENSO_CURRENT_URL,
      maps_2m_temperature_dates: CR_T2_LAST_MAP_DATE_URL,
      maps_sst_dates: CR_SST_LAST_MAP_DATE_URL,
    },
    ensoOutlook,
    aiSummary,
    maps: mapSources,
    mapWarnings,
    series: seriesOutput,
    summary: summaryOutput,
  };

  const emptySeries = Object.entries(output.series)
    .filter(([, series]) => !Array.isArray(series) || series.length === 0)
    .map(([key]) => key);

  if (emptySeries.length) {
    throw new Error(
      `One or more series are empty after validation (${emptySeries.join(", ")}); refusing to write incomplete realtime dataset.`
    );
  }

  await mkdir(resolve(ROOT_DIR, "public/data"), { recursive: true });
  await mkdir(resolve(ROOT_DIR, "src/data"), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output)}\n`, "utf8");
  await writeFile(BUNDLED_ENSO_OUTPUT_PATH, renderBundledEnsoModule(ensoOutlook), "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${BUNDLED_ENSO_OUTPUT_PATH}`);
  console.log(JSON.stringify(output.summary, null, 2));
  if (output.mapWarnings.length) {
    console.warn("Update warnings:");
    for (const warning of output.mapWarnings) {
      console.warn(`- ${warning}`);
    }
  }
  if (aiSummaryWarnings.length) {
    console.warn("AI summary warnings:");
    for (const warning of aiSummaryWarnings) {
      console.warn(`- ${warning}`);
    }
  }
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
