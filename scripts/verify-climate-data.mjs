import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_PATH = resolve(ROOT_DIR, "public/data/climate-realtime.json");
const DAY_MS = 86_400_000;

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
  global_sea_ice_extent: {
    minValue: 0,
    maxValue: 60,
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

function formatDate(dateIso) {
  return typeof dateIso === "string" ? dateIso : "(missing)";
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

  console.log(`Data verification passed (${Object.keys(SERIES_RULES).length} series checked).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
