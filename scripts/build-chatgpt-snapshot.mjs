import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = resolve(ROOT_DIR, "public/data/climate-realtime.json");
const OUTPUT_PATH = resolve(ROOT_DIR, "public/data/climate-latest.json");

const METRICS = {
  global_surface_temperature: { label: "Global Surface Temperature", unit: "deg C" },
  global_sea_surface_temperature: { label: "Global Sea Surface Temperature", unit: "deg C" },
  global_mean_sea_level: { label: "Global Mean Sea Level", unit: "mm" },
  ocean_heat_content: { label: "Ocean Heat Content (0-2000m)", unit: "10^22 J" },
  earth_energy_imbalance: { label: "Earth Energy Imbalance", unit: "W/m2" },
  global_glacier_mass_balance: { label: "Global Glacier Mass Balance", unit: "Gt" },
  antarctic_ice_sheet_mass_balance: { label: "Antarctic Ice Sheet Mass Loss", unit: "Gt" },
  greenland_ice_sheet_mass_balance: { label: "Greenland Ice Sheet Mass Loss", unit: "Gt" },
  northern_hemisphere_surface_temperature: { label: "Northern Hemisphere Surface Temperature", unit: "deg C" },
  southern_hemisphere_surface_temperature: { label: "Southern Hemisphere Surface Temperature", unit: "deg C" },
  arctic_surface_temperature: { label: "Arctic Surface Temperature", unit: "deg C" },
  antarctic_surface_temperature: { label: "Antarctic Surface Temperature", unit: "deg C" },
  north_atlantic_sea_surface_temperature: { label: "North Atlantic Sea Surface Temperature", unit: "deg C" },
  global_surface_temperature_anomaly: { label: "Global Surface Temperature Anomaly", unit: "deg C" },
  global_sea_surface_temperature_anomaly: { label: "Global Sea Surface Temperature Anomaly", unit: "deg C" },
  daily_global_mean_temperature_anomaly: { label: "Daily Global Mean Temperature Anomaly", unit: "deg C" },
  global_sea_ice_extent: { label: "Global Sea Ice Extent", unit: "million sq km" },
  arctic_sea_ice_extent: { label: "Arctic Sea Ice Extent", unit: "million sq km" },
  antarctic_sea_ice_extent: { label: "Antarctic Sea Ice Extent", unit: "million sq km" },
  atmospheric_co2: { label: "Atmospheric CO2 (Mauna Loa)", unit: "ppm" },
  atmospheric_ch4: { label: "Atmospheric CH4 (Global)", unit: "ppb" },
  atmospheric_aggi: { label: "NOAA Annual Greenhouse Gas Index", unit: "index" },
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${name} in realtime dataset.`);
  }
  return value;
}

function buildMetric(key, data) {
  const latest = data.summary?.[key];
  if (!isRecord(latest) || !Number.isFinite(latest.latestValue) || typeof latest.latestDate !== "string") {
    throw new Error(`Missing valid current summary for ${key}.`);
  }

  return {
    key,
    label: METRICS[key].label,
    latestDate: latest.latestDate,
    latestValue: latest.latestValue,
    unit: METRICS[key].unit,
    source: typeof data.sources?.[key] === "string" ? data.sources[key] : null,
  };
}

function buildEnsoOutlook(raw) {
  if (!isRecord(raw)) return null;
  return {
    issuedDate: typeof raw.issuedDate === "string" ? raw.issuedDate : null,
    alertStatus: typeof raw.alertStatus === "string" ? raw.alertStatus : null,
    sourceLabel: typeof raw.sourceLabel === "string" ? raw.sourceLabel : null,
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : null,
    nextThreeMonths: isRecord(raw.nextThreeMonths) ? raw.nextThreeMonths : null,
    nextSixMonths: isRecord(raw.nextSixMonths) ? raw.nextSixMonths : null,
  };
}

function buildTemperatureStatus(raw) {
  if (!isRecord(raw) || !Array.isArray(raw.temperatureChecks)) return [];
  return raw.temperatureChecks
    .filter((check) => isRecord(check) && typeof check.key === "string" && ["normal", "watch", "critical"].includes(check.tone))
    .map((check) => ({ key: check.key, tone: check.tone }));
}

async function main() {
  const realtime = JSON.parse(await readFile(SOURCE_PATH, "utf8"));
  const generatedAtIso = requireString(realtime.generatedAtIso, "generatedAtIso");

  const output = {
    schemaVersion: 1,
    generatedAtIso,
    scope:
      "Read-only compact snapshot of the latest published Climate Dashboard observations. It excludes full historical series; answer historical trend questions only when data for them is present.",
    interpretationRules: [
      "State the observation date alongside each reported latest value.",
      "Do not describe an indicator as a record unless temperatureStatus explicitly supports it.",
      "Do not infer causes or forecasts from observations.",
    ],
    metrics: Object.keys(METRICS).map((key) => buildMetric(key, realtime)),
    temperatureStatus: buildTemperatureStatus(realtime.aiSummary),
    ensoOutlook: buildEnsoOutlook(realtime.ensoOutlook),
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

await main();
