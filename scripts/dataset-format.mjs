/**
 * Published dataset format v2: a small core file plus per-decade columnar
 * series chunks, replacing the single monolithic climate-realtime.json.
 *
 * - climate-core.json: every top-level field except `series`, plus a
 *   `seriesChunks` manifest (path + content token per chunk).
 * - series/<start>-<end>.json: all series' points that fall in that decade,
 *   stored columnar. Daily runs use { enc: "days", start, values } with
 *   nulls for missing days; sparse/monthly/annual data uses
 *   { enc: "list", dates, values }.
 *
 * Decoding reassembles the exact legacy in-memory payload shape
 * ({ ..., series: { key: [{ date, value }, ...] } }) so every consumer
 * (updater self-reads, verifier, snapshot builder, dashboard runtime)
 * behaves identically to before.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const DATASET_FORMAT_VERSION = 2;
export const CORE_FILE_NAME = "climate-core.json";
export const SERIES_DIR_NAME = "series";
export const LEGACY_DATASET_FILE_NAME = "climate-realtime.json";

const DAY_MS = 86_400_000;
const VALUE_DECIMALS = 4;
const VALUE_SCALE = 10 ** VALUE_DECIMALS;
// Use "days" encoding only while implicit-day nulls stay cheaper than
// repeating explicit dates.
const MAX_DAYS_GAP_RATIO = 2.5;
const MIN_POINTS_FOR_DAYS_ENCODING = 24;

export function roundSeriesValue(value) {
  return Math.round(value * VALUE_SCALE) / VALUE_SCALE;
}

export function roundSeriesPoints(points) {
  return points.map((point) => ({ date: point.date, value: roundSeriesValue(point.value) }));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIsoDateToUtc(dateIso) {
  if (typeof dateIso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const timestamp = Date.parse(`${dateIso}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isoDateFromUtc(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function decadeStartOfYear(year) {
  return Math.floor(year / 10) * 10;
}

function chunkFileName(decadeStart) {
  return `${decadeStart}-${decadeStart + 9}.json`;
}

function contentToken(text) {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

function encodeChunkSeriesPoints(points) {
  const firstTime = parseIsoDateToUtc(points[0].date);
  const lastTime = parseIsoDateToUtc(points[points.length - 1].date);

  if (
    firstTime != null &&
    lastTime != null &&
    points.length >= MIN_POINTS_FOR_DAYS_ENCODING &&
    (lastTime - firstTime) / DAY_MS + 1 <= points.length * MAX_DAYS_GAP_RATIO
  ) {
    const spanDays = Math.round((lastTime - firstTime) / DAY_MS) + 1;
    const values = new Array(spanDays).fill(null);
    let valid = true;

    for (const point of points) {
      const pointTime = parseIsoDateToUtc(point.date);
      if (pointTime == null) {
        valid = false;
        break;
      }
      const offset = (pointTime - firstTime) / DAY_MS;
      if (!Number.isInteger(offset) || offset < 0 || offset >= spanDays) {
        valid = false;
        break;
      }
      values[offset] = point.value;
    }

    if (valid) {
      return { enc: "days", start: points[0].date, values };
    }
  }

  return {
    enc: "list",
    dates: points.map((point) => point.date),
    values: points.map((point) => point.value),
  };
}

/**
 * Split `series` ({ key: [{date, value}] }) into deterministic decade chunks.
 * Returns [{ decadeStart, fileName, series: { key: encoded } }] sorted by decade.
 */
export function encodeSeriesChunks(series) {
  const buckets = new Map();

  for (const key of Object.keys(series).sort()) {
    const points = series[key];
    if (!Array.isArray(points) || points.length === 0) continue;

    let currentDecade = null;
    let currentRun = null;
    for (const point of points) {
      const year = Number(String(point.date).slice(0, 4));
      if (!Number.isFinite(year)) {
        throw new Error(`Series ${key} has an invalid date: ${point.date}`);
      }
      if (!Number.isFinite(point.value)) {
        throw new Error(`Series ${key} has a non-finite value at ${point.date}`);
      }
      const decade = decadeStartOfYear(year);
      if (decade !== currentDecade) {
        currentDecade = decade;
        if (!buckets.has(decade)) buckets.set(decade, new Map());
        const decadeSeries = buckets.get(decade);
        if (!decadeSeries.has(key)) decadeSeries.set(key, []);
        currentRun = decadeSeries.get(key);
      }
      currentRun.push(point);
    }
  }

  return Array.from(buckets.keys())
    .sort((a, b) => a - b)
    .map((decadeStart) => {
      const encodedSeries = {};
      for (const [key, points] of buckets.get(decadeStart)) {
        encodedSeries[key] = encodeChunkSeriesPoints(points);
      }
      return {
        decadeStart,
        fileName: chunkFileName(decadeStart),
        series: encodedSeries,
      };
    });
}

export function decodeChunkSeriesPoints(encoded) {
  if (!isRecord(encoded)) return null;

  if (encoded.enc === "days") {
    const startTime = parseIsoDateToUtc(encoded.start);
    if (startTime == null || !Array.isArray(encoded.values)) return null;
    const points = [];
    for (let index = 0; index < encoded.values.length; index += 1) {
      const value = encoded.values[index];
      if (value == null) continue;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      points.push({ date: isoDateFromUtc(startTime + index * DAY_MS), value: numeric });
    }
    return points;
  }

  if (encoded.enc === "list") {
    if (!Array.isArray(encoded.dates) || !Array.isArray(encoded.values)) return null;
    if (encoded.dates.length !== encoded.values.length) return null;
    const points = [];
    for (let index = 0; index < encoded.dates.length; index += 1) {
      const date = encoded.dates[index];
      const numeric = Number(encoded.values[index]);
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!Number.isFinite(numeric)) continue;
      points.push({ date, value: numeric });
    }
    return points;
  }

  return null;
}

/**
 * Merge one parsed chunk payload into `series`. Chunks must be merged in
 * ascending decade order to keep points sorted without a final resort.
 */
export function mergeChunkPayloadIntoSeries(chunkPayload, series) {
  if (!isRecord(chunkPayload) || !isRecord(chunkPayload.series)) {
    throw new Error("Series chunk payload is malformed.");
  }
  for (const [key, encoded] of Object.entries(chunkPayload.series)) {
    const points = decodeChunkSeriesPoints(encoded);
    if (points == null) {
      throw new Error(`Series chunk entry for ${key} is malformed.`);
    }
    if (!series[key]) series[key] = [];
    series[key].push(...points);
  }
}

function stringifyArtifact(payload) {
  return `${JSON.stringify(payload)}\n`;
}

/**
 * Write climate-core.json + series/*.json under `dataDir` from a legacy-shape
 * dataset object. Removes stale chunk files from previous runs. Returns the
 * list of written file paths (relative to dataDir).
 */
export async function writeDatasetArtifacts(dataDir, dataset) {
  const { series, ...coreFields } = dataset;
  if (!isRecord(series)) {
    throw new Error("Dataset is missing its series map.");
  }

  const chunks = encodeSeriesChunks(series);
  if (!chunks.length) {
    throw new Error("Refusing to write a dataset with no series chunks.");
  }

  const seriesDir = join(dataDir, SERIES_DIR_NAME);
  await mkdir(seriesDir, { recursive: true });

  const manifest = [];
  const writtenFileNames = new Set();

  for (const chunk of chunks) {
    const body = stringifyArtifact({ range: [chunk.decadeStart, chunk.decadeStart + 9], series: chunk.series });
    await writeFile(join(seriesDir, chunk.fileName), body, "utf8");
    writtenFileNames.add(chunk.fileName);
    manifest.push({ path: `${SERIES_DIR_NAME}/${chunk.fileName}`, token: contentToken(body) });
  }

  const staleEntries = (await readdir(seriesDir)).filter(
    (name) => name.endsWith(".json") && !writtenFileNames.has(name)
  );
  for (const name of staleEntries) {
    await unlink(join(seriesDir, name));
  }

  const core = {
    formatVersion: DATASET_FORMAT_VERSION,
    ...coreFields,
    seriesChunks: manifest,
  };
  await writeFile(join(dataDir, CORE_FILE_NAME), stringifyArtifact(core), "utf8");

  return [CORE_FILE_NAME, ...manifest.map((entry) => entry.path)];
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

/**
 * Load the published dataset from `dataDir`, reassembled into the legacy
 * payload shape. Prefers format v2 artifacts; falls back to the legacy
 * monolithic file when no core file exists. Returns null when neither is
 * present or readable.
 */
export async function loadPublishedDataset(dataDir) {
  let core = null;
  try {
    core = await readJsonFile(join(dataDir, CORE_FILE_NAME));
  } catch {
    core = null;
  }

  if (isRecord(core) && core.formatVersion === DATASET_FORMAT_VERSION && Array.isArray(core.seriesChunks)) {
    const series = {};
    for (const entry of core.seriesChunks) {
      if (!isRecord(entry) || typeof entry.path !== "string") {
        throw new Error("Dataset core manifest is malformed.");
      }
      const chunkPath = resolve(dataDir, entry.path);
      if (!chunkPath.startsWith(resolve(dataDir))) {
        throw new Error(`Dataset chunk path escapes the data directory: ${entry.path}`);
      }
      mergeChunkPayloadIntoSeries(await readJsonFile(chunkPath), series);
    }
    const { formatVersion, seriesChunks, ...coreFields } = core;
    return { ...coreFields, series };
  }

  try {
    const legacy = await readJsonFile(join(dataDir, LEGACY_DATASET_FILE_NAME));
    return isRecord(legacy) ? legacy : null;
  } catch {
    return null;
  }
}

export function resolveDataDir(rootDir) {
  return resolve(rootDir, "public/data");
}
