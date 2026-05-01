import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_PATH = resolve(ROOT_DIR, "public/data/climate-realtime.json");
const DAY_MS = 86_400_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const REQUIRED_MAP_FILES = [
  {
    key: "global_2m_temperature",
    path: "data/maps/global-2m-temperature.png",
    filePath: resolve(ROOT_DIR, "public/data/maps/global-2m-temperature.png"),
  },
  {
    key: "global_2m_temperature_anomaly",
    path: "data/maps/global-2m-temperature-anomaly.png",
    filePath: resolve(ROOT_DIR, "public/data/maps/global-2m-temperature-anomaly.png"),
  },
  {
    key: "global_sst",
    path: "data/maps/global-sst.png",
    filePath: resolve(ROOT_DIR, "public/data/maps/global-sst.png"),
  },
  {
    key: "global_sst_anomaly",
    path: "data/maps/global-sst-anomaly.png",
    filePath: resolve(ROOT_DIR, "public/data/maps/global-sst-anomaly.png"),
  },
];
const AI_SUMMARY_ALLOWED_MODELS = new Set(["local-rules", "gpt-5.4-mini"]);
const AI_SUMMARY_DISALLOWED_TEXT_PATTERN = /\brecord\s+lows?\b|\brecord\s+cold\b|\bcoldest\b|\bcooling\b/i;
const AI_SUMMARY_TEMPERATURE_KEYS = ["global_surface_temperature", "global_sea_surface_temperature"];

const SERIES_RULES = {
  global_surface_temperature: {
    minValue: 5,
    maxValue: 40,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  global_sea_surface_temperature: {
    minValue: 10,
    maxValue: 40,
    maxAgeDays: 45,
    minPoints: 8_000,
    minPointsLastYear: 250,
  },
  global_mean_sea_level: {
    minValue: -200,
    maxValue: 300,
    maxAgeDays: 450,
    minPoints: 300,
    minPointsLastYear: 0,
  },
  ocean_heat_content: {
    minValue: -50,
    maxValue: 120,
    maxAgeDays: 900,
    minPoints: 70,
    minPointsLastYear: 0,
  },
  earth_energy_imbalance: {
    minValue: -20,
    maxValue: 20,
    maxAgeDays: 220,
    minPoints: 250,
    minPointsLastYear: 6,
  },
  global_glacier_mass_balance: {
    minValue: -1200,
    maxValue: 250,
    maxAgeDays: 1600,
    minPoints: 30,
    minPointsLastYear: 0,
  },
  antarctic_ice_sheet_mass_balance: {
    minValue: 0,
    maxValue: 4000,
    maxAgeDays: 430,
    minPoints: 200,
    minPointsLastYear: 8,
  },
  greenland_ice_sheet_mass_balance: {
    minValue: 0,
    maxValue: 7000,
    maxAgeDays: 430,
    minPoints: 200,
    minPointsLastYear: 8,
  },
  northern_hemisphere_surface_temperature: {
    minValue: -20,
    maxValue: 40,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  southern_hemisphere_surface_temperature: {
    minValue: -20,
    maxValue: 35,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  arctic_surface_temperature: {
    minValue: -70,
    maxValue: 25,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  antarctic_surface_temperature: {
    minValue: -80,
    maxValue: 25,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  north_atlantic_sea_surface_temperature: {
    minValue: -5,
    maxValue: 40,
    maxAgeDays: 45,
    minPoints: 8_000,
    minPointsLastYear: 250,
  },
  global_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  global_sea_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 45,
    minPoints: 8_000,
    minPointsLastYear: 250,
  },
  daily_global_mean_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
    minPoints: 30_000,
    minPointsLastYear: 300,
  },
  global_sea_ice_extent: {
    minValue: 0,
    maxValue: 60,
    maxAgeDays: 20,
    minPoints: 8_000,
    minPointsLastYear: 300,
  },
  arctic_sea_ice_extent: {
    minValue: 0,
    maxValue: 30,
    maxAgeDays: 20,
    minPoints: 8_000,
    minPointsLastYear: 300,
  },
  antarctic_sea_ice_extent: {
    minValue: 0,
    maxValue: 35,
    maxAgeDays: 20,
    minPoints: 8_000,
    minPointsLastYear: 300,
  },
  atmospheric_co2: {
    minValue: 200,
    maxValue: 700,
    maxAgeDays: 120,
    minPoints: 8_000,
    minPointsLastYear: 120,
  },
  atmospheric_ch4: {
    minValue: 1000,
    maxValue: 3000,
    maxAgeDays: 220,
    minPoints: 400,
    minPointsLastYear: 6,
  },
  atmospheric_aggi: {
    minValue: 0.5,
    maxValue: 3.5,
    maxAgeDays: 1000,
    minPoints: 30,
    minPointsLastYear: 0,
  },
};

function utcMidnightNow() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function parseDailyIsoToUtc(dateIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isPngBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < PNG_SIGNATURE.length) return false;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
}

function formatDate(dateIso) {
  return typeof dateIso === "string" ? dateIso : "(missing)";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSummaryEntry(payload, key) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const summary = payload.summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const entry = summary[key];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return entry;
}

function verifySeries(key, points, payload, nowMidnight, errors, warnings) {
  const rules = SERIES_RULES[key];

  if (!Array.isArray(points)) {
    errors.push(`${key}: series is not an array`);
    return;
  }

  if (points.length < rules.minPoints) {
    errors.push(`${key}: too few points (${points.length}); expected at least ${rules.minPoints}`);
  }

  let previousTs = -Infinity;
  let lastPoint = null;
  let pointsLastYear = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point || typeof point !== "object" || Array.isArray(point)) {
      errors.push(`${key}: invalid point object at index ${index}`);
      continue;
    }

    const date = typeof point.date === "string" ? point.date.trim() : "";
    const value = Number(point.value);
    const ts = parseDailyIsoToUtc(date);

    if (ts == null) {
      errors.push(`${key}: invalid date at index ${index} (${JSON.stringify(point.date)})`);
      continue;
    }
    if (!Number.isFinite(value)) {
      errors.push(`${key}: non-numeric value at index ${index} (${JSON.stringify(point.value)})`);
      continue;
    }
    if (value < rules.minValue || value > rules.maxValue) {
      errors.push(`${key}: out-of-range value at ${date} (${value}); expected ${rules.minValue}..${rules.maxValue}`);
      continue;
    }

    if (ts <= previousTs) {
      errors.push(`${key}: dates are not strictly increasing around ${date}`);
      continue;
    }
    previousTs = ts;

    if (ts > nowMidnight) {
      errors.push(`${key}: future date detected (${date})`);
      continue;
    }

    if (ts >= nowMidnight - 365 * DAY_MS) {
      pointsLastYear += 1;
    }

    lastPoint = { date, value, ts };
  }

  if (!lastPoint) {
    errors.push(`${key}: no valid points after verification`);
    return;
  }

  const ageDays = Math.floor((nowMidnight - lastPoint.ts) / DAY_MS);
  if (ageDays > rules.maxAgeDays) {
    errors.push(`${key}: stale latest point ${formatDate(lastPoint.date)} (${ageDays} days old; max ${rules.maxAgeDays})`);
  }

  if (pointsLastYear < rules.minPointsLastYear) {
    warnings.push(`${key}: sparse recent data (${pointsLastYear} points in last 365 days)`);
  }

  const summaryEntry = getSummaryEntry(payload, key);
  if (!summaryEntry) {
    warnings.push(`${key}: missing summary entry`);
    return;
  }

  const summaryPoints = Number(summaryEntry.points);
  const summaryLatestDate = typeof summaryEntry.latestDate === "string" ? summaryEntry.latestDate : null;
  const summaryLatestValue = Number(summaryEntry.latestValue);

  if (summaryPoints !== points.length) {
    errors.push(`${key}: summary.points (${summaryPoints}) does not match series length (${points.length})`);
  }
  if (summaryLatestDate !== lastPoint.date) {
    errors.push(`${key}: summary.latestDate (${formatDate(summaryLatestDate)}) does not match ${lastPoint.date}`);
  }
  if (!Number.isFinite(summaryLatestValue) || Math.abs(summaryLatestValue - lastPoint.value) > 1e-9) {
    errors.push(`${key}: summary.latestValue (${summaryEntry.latestValue}) does not match ${lastPoint.value}`);
  }
}

function verifySeaIceConsistency(series, errors, warnings) {
  const globalSeries = Array.isArray(series.global_sea_ice_extent) ? series.global_sea_ice_extent : [];
  const arcticSeries = Array.isArray(series.arctic_sea_ice_extent) ? series.arctic_sea_ice_extent : [];
  const antarcticSeries = Array.isArray(series.antarctic_sea_ice_extent) ? series.antarctic_sea_ice_extent : [];

  if (!globalSeries.length || !arcticSeries.length || !antarcticSeries.length) return;

  const arcticByDate = new Map(arcticSeries.map((point) => [point.date, Number(point.value)]));
  const antarcticByDate = new Map(antarcticSeries.map((point) => [point.date, Number(point.value)]));

  let checked = 0;
  let mismatchCount = 0;
  const tolerance = 0.02;

  for (const point of globalSeries) {
    const globalValue = Number(point?.value);
    if (!Number.isFinite(globalValue)) continue;
    const arcticValue = arcticByDate.get(point.date);
    const antarcticValue = antarcticByDate.get(point.date);
    if (!Number.isFinite(arcticValue) || !Number.isFinite(antarcticValue)) continue;

    checked += 1;
    const delta = Math.abs(globalValue - (arcticValue + antarcticValue));
    if (delta <= tolerance) continue;

    mismatchCount += 1;
    if (mismatchCount <= 5) {
      errors.push(
        `global_sea_ice_extent mismatch at ${point.date}: global=${globalValue}, arctic+antarctic=${(
          arcticValue + antarcticValue
        ).toFixed(3)}`
      );
    }
  }

  if (!checked) {
    warnings.push("Sea-ice consistency check skipped: no overlapping dates across global/arctic/antarctic series.");
    return;
  }

  if (mismatchCount > 5) {
    errors.push(`global_sea_ice_extent mismatch on ${mismatchCount} overlapping dates (showing first 5).`);
  }
}

function verifyTemperatureAnomalyAlignment(series, errors, warnings) {
  const pairs = [
    ["global_surface_temperature", "global_surface_temperature_anomaly"],
    ["global_sea_surface_temperature", "global_sea_surface_temperature_anomaly"],
  ];

  for (const [absoluteKey, anomalyKey] of pairs) {
    const absoluteSeries = Array.isArray(series[absoluteKey]) ? series[absoluteKey] : [];
    const anomalySeries = Array.isArray(series[anomalyKey]) ? series[anomalyKey] : [];
    if (!absoluteSeries.length || !anomalySeries.length) continue;

    const absoluteDates = new Set(absoluteSeries.map((point) => point.date));
    const anomalyDates = new Set(anomalySeries.map((point) => point.date));
    const missing = [];

    for (const date of anomalyDates) {
      if (absoluteDates.has(date)) continue;
      missing.push(date);
      if (missing.length >= 5) break;
    }

    if (missing.length) {
      errors.push(`${anomalyKey}: found anomaly dates missing in ${absoluteKey}: ${missing.join(", ")}`);
    }

    const latestAbsolute = absoluteSeries[absoluteSeries.length - 1]?.date ?? null;
    const latestAnomaly = anomalySeries[anomalySeries.length - 1]?.date ?? null;
    if (latestAbsolute && latestAnomaly && latestAbsolute !== latestAnomaly) {
      warnings.push(`${anomalyKey}: latest date (${latestAnomaly}) differs from ${absoluteKey} (${latestAbsolute})`);
    }
  }
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

  return { key, tone };
}

function buildTemperatureSummaryTextEn(temperatureChecks) {
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

  return warningChecks.length
    ? `${warningChecks.map((check) => `${names[check.key]} ${reasons[check.tone]}`).join("; ")}. ${normalText}`
    : "Global surface temperature and global sea surface temperature are not unusually high versus their same-date historical records. Key climate indicators below show the latest available readings.";
}

function sentenceCount(text) {
  return String(text ?? "")
    .split(/[.!?]+(?:\s|$)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
}

function verifyAiSummary(payload, series, nowMidnight, errors) {
  const aiSummary = isRecord(payload) ? payload.aiSummary : null;
  if (!isRecord(aiSummary)) {
    errors.push("aiSummary: missing or invalid object");
    return;
  }

  const textEn = typeof aiSummary.textEn === "string" ? aiSummary.textEn.trim() : "";
  if (!textEn || textEn.length > 650) {
    errors.push("aiSummary.textEn is missing or too long");
  }
  if (aiSummary.source === "openai") {
    const textEnSentenceCount = sentenceCount(textEn);
    if (textEnSentenceCount < 2 || textEnSentenceCount > 3) {
      errors.push(`aiSummary.textEn has ${textEnSentenceCount} sentences; expected 2 or 3`);
    }
  }
  if (AI_SUMMARY_DISALLOWED_TEXT_PATTERN.test(textEn)) {
    errors.push("aiSummary.textEn contains disallowed temperature wording");
  }

  const generatedAtIso = typeof aiSummary.generatedAtIso === "string" ? aiSummary.generatedAtIso.trim() : "";
  const generatedAtMs = Date.parse(generatedAtIso);
  if (!Number.isFinite(generatedAtMs)) {
    errors.push("aiSummary.generatedAtIso is missing or invalid");
  } else if (generatedAtMs > nowMidnight + DAY_MS) {
    errors.push(`aiSummary.generatedAtIso is in the future (${generatedAtIso})`);
  }

  const model = typeof aiSummary.model === "string" ? aiSummary.model.trim() : "";
  if (!AI_SUMMARY_ALLOWED_MODELS.has(model)) {
    errors.push(`aiSummary.model is not allowed (${JSON.stringify(aiSummary.model)})`);
  }
  if (aiSummary.source !== "openai" && aiSummary.source !== "local") {
    errors.push(`aiSummary.source is invalid (${JSON.stringify(aiSummary.source)})`);
  }
  if (typeof aiSummary.fingerprint !== "string" || !aiSummary.fingerprint.trim()) {
    errors.push("aiSummary.fingerprint is missing");
  }

  const expectedChecks = AI_SUMMARY_TEMPERATURE_KEYS.map((key) =>
    sameDateTemperatureCheck(key, Array.isArray(series[key]) ? series[key] : [])
  ).filter(Boolean);
  const actualChecks = Array.isArray(aiSummary.temperatureChecks) ? aiSummary.temperatureChecks : [];

  for (const expectedCheck of expectedChecks) {
    const actualCheck = actualChecks.find((check) => isRecord(check) && check.key === expectedCheck.key);
    if (!actualCheck) {
      errors.push(`aiSummary.temperatureChecks missing ${expectedCheck.key}`);
      continue;
    }
    if (actualCheck.tone !== expectedCheck.tone) {
      errors.push(`aiSummary.temperatureChecks.${expectedCheck.key} is ${actualCheck.tone}; expected ${expectedCheck.tone}`);
    }
  }

  const hasTemperatureWarning = expectedChecks.some((check) => check.tone !== "normal");
  const expectedText = buildTemperatureSummaryTextEn(expectedChecks);
  if (hasTemperatureWarning && !textEn.startsWith(expectedText.split(".")[0])) {
    errors.push("aiSummary.textEn does not begin with the computed temperature warning");
  }
  if (!hasTemperatureWarning && !/not unusually high/i.test(textEn)) {
    errors.push("aiSummary.textEn does not include the computed normal temperature status");
  }
}

function verifyEnsoOutlook(payload, nowMidnight, errors, warnings) {
  const ensoOutlook = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.ensoOutlook : null;
  if (!ensoOutlook || typeof ensoOutlook !== "object" || Array.isArray(ensoOutlook)) {
    errors.push("ensoOutlook: missing or invalid object");
    return;
  }

  const issuedDate = typeof ensoOutlook.issuedDate === "string" ? ensoOutlook.issuedDate.trim() : "";
  const issuedTs = parseDailyIsoToUtc(issuedDate);
  if (issuedTs == null) {
    errors.push("ensoOutlook: issuedDate is missing or invalid");
  } else {
    const ageDays = Math.floor((nowMidnight - issuedTs) / DAY_MS);
    if (ageDays > 50) {
      errors.push(`ensoOutlook: issuedDate ${issuedDate} is stale (${ageDays} days old)`);
    }
  }

  if (typeof ensoOutlook.sourceLabel !== "string" || !ensoOutlook.sourceLabel.trim()) {
    errors.push("ensoOutlook: sourceLabel is missing");
  }
  if (typeof ensoOutlook.sourceUrl !== "string" || !ensoOutlook.sourceUrl.trim()) {
    errors.push("ensoOutlook: sourceUrl is missing");
  }

  const windowKeys = ["nextThreeMonths", "nextSixMonths"];
  for (const key of windowKeys) {
    const rawWindow = ensoOutlook[key];
    if (!rawWindow || typeof rawWindow !== "object" || Array.isArray(rawWindow)) {
      errors.push(`ensoOutlook: ${key} is missing or invalid`);
      continue;
    }

    const condition = typeof rawWindow.condition === "string" ? rawWindow.condition.trim() : "";
    if (!["la_nina", "neutral", "el_nino"].includes(condition)) {
      errors.push(`ensoOutlook: ${key}.condition is invalid (${JSON.stringify(rawWindow.condition)})`);
    }

    const probability = rawWindow.probability == null ? null : Number(rawWindow.probability);
    if (probability == null || !Number.isFinite(probability) || probability < 0 || probability > 100) {
      errors.push(`ensoOutlook: ${key}.probability is invalid (${JSON.stringify(rawWindow.probability)})`);
    }

    if (typeof rawWindow.targetLabel !== "string" || !rawWindow.targetLabel.trim()) {
      warnings.push(`ensoOutlook: ${key}.targetLabel is missing`);
    }
  }
}

async function verifyMapFiles(payload, errors, warnings) {
  const maps = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.maps : null;
  if (!maps || typeof maps !== "object" || Array.isArray(maps)) {
    errors.push("maps: missing maps metadata block");
  }

  for (const mapConfig of REQUIRED_MAP_FILES) {
    const mapEntry = maps && typeof maps === "object" && !Array.isArray(maps) ? maps[mapConfig.key] : null;
    if (!mapEntry || typeof mapEntry !== "object" || Array.isArray(mapEntry)) {
      errors.push(`maps.${mapConfig.key}: missing metadata entry`);
    } else {
      const path = typeof mapEntry.path === "string" ? mapEntry.path.trim() : "";
      if (!path) {
        errors.push(`maps.${mapConfig.key}.path is missing`);
      } else if (path !== mapConfig.path) {
        warnings.push(`maps.${mapConfig.key}.path is ${path}; expected ${mapConfig.path}`);
      }

      const date = typeof mapEntry.date === "string" ? mapEntry.date.trim() : "";
      const dateTs = parseDailyIsoToUtc(date);
      if (dateTs == null) {
        errors.push(`maps.${mapConfig.key}.date is missing or invalid`);
      } else if (dateTs > utcMidnightNow()) {
        errors.push(`maps.${mapConfig.key}.date is in the future (${date})`);
      }
    }

    try {
      await access(mapConfig.filePath);
      const bytes = await readFile(mapConfig.filePath);
      if (!isPngBytes(bytes)) {
        errors.push(`maps: expected PNG but found invalid image payload in ${mapConfig.filePath}`);
      }
    } catch {
      errors.push(`maps: missing expected map file ${mapConfig.filePath}`);
    }
  }
}

async function main() {
  const raw = await readFile(INPUT_PATH, "utf8");
  const payload = JSON.parse(raw);

  const errors = [];
  const warnings = [];
  const nowMidnight = utcMidnightNow();

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Dataset root is not an object.");
  }

  if (typeof payload.generatedAtIso !== "string" || !Number.isFinite(Date.parse(payload.generatedAtIso))) {
    errors.push("generatedAtIso is missing or invalid");
  }

  const series = payload.series;
  if (!series || typeof series !== "object" || Array.isArray(series)) {
    throw new Error("series is missing or invalid.");
  }

  for (const key of Object.keys(SERIES_RULES)) {
    verifySeries(key, series[key], payload, nowMidnight, errors, warnings);
  }

  verifyTemperatureAnomalyAlignment(series, errors, warnings);
  verifySeaIceConsistency(series, errors, warnings);
  verifyAiSummary(payload, series, nowMidnight, errors);
  verifyEnsoOutlook(payload, nowMidnight, errors, warnings);
  await verifyMapFiles(payload, errors, warnings);

  if (warnings.length) {
    console.warn("Data verification warnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length) {
    console.error("Data verification failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Data verification passed (${Object.keys(SERIES_RULES).length} series + ENSO outlook checked).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
