/**
 * One-time migration: convert the legacy monolithic climate-realtime.json
 * into format v2 artifacts (climate-core.json + series/*.json).
 *
 * Series values are rounded (killing float-noise strings) and summary
 * entries are recomputed from the rounded series so the verifier's exact
 * latest-value check keeps passing. The legacy file is left in place;
 * remove it from git once the new artifacts are committed.
 */

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CORE_FILE_NAME,
  LEGACY_DATASET_FILE_NAME,
  loadPublishedDataset,
  roundSeriesPoints,
  writeDatasetArtifacts,
} from "./dataset-format.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(ROOT_DIR, "public/data");

function summarize(series) {
  const latest = series.length ? series[series.length - 1] : null;
  return {
    points: series.length,
    latestDate: latest?.date ?? null,
    latestValue: latest?.value ?? null,
  };
}

function deepEqual(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function main() {
  const legacyRaw = await readFile(join(DATA_DIR, LEGACY_DATASET_FILE_NAME), "utf8");
  const legacy = JSON.parse(legacyRaw);
  if (!legacy || typeof legacy !== "object" || !legacy.series) {
    throw new Error("Legacy dataset is missing or has no series.");
  }

  const dataset = { ...legacy };
  dataset.series = {};
  dataset.summary = { ...legacy.summary };
  for (const [key, points] of Object.entries(legacy.series)) {
    dataset.series[key] = roundSeriesPoints(points);
    dataset.summary[key] = summarize(dataset.series[key]);
  }

  const written = await writeDatasetArtifacts(DATA_DIR, dataset);

  const reloaded = await loadPublishedDataset(DATA_DIR);
  if (!deepEqual(reloaded, dataset)) {
    throw new Error("Round-trip mismatch: reloaded artifacts differ from the converted dataset.");
  }

  let totalBytes = 0;
  console.log("Written artifacts:");
  for (const artifact of written) {
    const bytes = await fileSize(join(DATA_DIR, artifact));
    totalBytes += bytes;
    console.log(`  ${artifact}  ${(bytes / 1024).toFixed(0)} KB`);
  }
  console.log(`Total: ${(totalBytes / 1048576).toFixed(2)} MB (legacy monolith: ${(legacyRaw.length / 1048576).toFixed(2)} MB)`);
  console.log(`Round-trip verified against ${CORE_FILE_NAME} + chunks.`);
}

await main();
