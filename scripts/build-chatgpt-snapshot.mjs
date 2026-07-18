import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPublishedDataset } from "./dataset-format.mjs";
import { LATEST_SNAPSHOT_METRICS } from "./metric-registry.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(ROOT_DIR, "public/data");
const OUTPUT_PATH = resolve(ROOT_DIR, "public/data/climate-latest.json");


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
    label: LATEST_SNAPSHOT_METRICS[key].label,
    latestDate: latest.latestDate,
    latestValue: latest.latestValue,
    unit: LATEST_SNAPSHOT_METRICS[key].unit,
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
  const realtime = await loadPublishedDataset(DATA_DIR);
  if (!realtime) {
    throw new Error("No published dataset found (expected climate-core.json + series chunks).");
  }
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
    metrics: Object.keys(LATEST_SNAPSHOT_METRICS).map((key) => buildMetric(key, realtime)),
    temperatureStatus: buildTemperatureStatus(realtime.aiSummary),
    ensoOutlook: buildEnsoOutlook(realtime.ensoOutlook),
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

await main();
