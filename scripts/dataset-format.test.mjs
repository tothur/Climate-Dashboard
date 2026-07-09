import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_FILE_NAME,
  DATASET_FORMAT_VERSION,
  encodeSeriesChunks,
  decodeChunkSeriesPoints,
  loadPublishedDataset,
  mergeChunkPayloadIntoSeries,
  roundSeriesPoints,
  roundSeriesValue,
  writeDatasetArtifacts,
} from "./dataset-format.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dailySeries(startIso, count, valueAt) {
  const startTime = Date.parse(`${startIso}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(startTime + index * 86_400_000).toISOString().slice(0, 10),
    value: valueAt(index),
  }));
}

function roundTrip(series) {
  const decoded = {};
  for (const chunk of encodeSeriesChunks(series)) {
    mergeChunkPayloadIntoSeries({ range: [chunk.decadeStart, chunk.decadeStart + 9], series: chunk.series }, decoded);
  }
  return decoded;
}

test("rounding kills float noise while keeping precision", () => {
  assert.equal(roundSeriesValue(0.06999999999999995), 0.07);
  assert.equal(roundSeriesValue(-2.4000000000000004), -2.4);
  assert.equal(roundSeriesValue(430.1534), 430.1534);
  assert.equal(roundSeriesValue(0), 0);
});

test("daily series round-trips exactly, including decade boundaries", () => {
  const series = {
    temp: dailySeries("1948-12-20", 400, (index) => roundSeriesValue(Math.sin(index / 7) * 3 - 1)),
  };
  const decoded = roundTrip(series);
  assert.deepEqual(decoded, series);
});

test("daily series with gaps round-trips exactly", () => {
  const base = dailySeries("1979-01-01", 600, (index) => roundSeriesValue(index * 0.001 - 0.3));
  const gappy = base.filter((_, index) => index % 2 === 0 || index > 400);
  const decoded = roundTrip({ ice: gappy });
  assert.deepEqual(decoded.ice, gappy);
});

test("sparse monthly and annual series use list encoding and round-trip exactly", () => {
  const monthly = Array.from({ length: 30 }, (_, index) => ({
    date: isoDate(2000 + Math.floor(index / 12), (index % 12) + 1, 15),
    value: roundSeriesValue(370 + index * 0.2),
  }));
  const annual = Array.from({ length: 12 }, (_, index) => ({
    date: isoDate(1990 + index, 1, 1),
    value: roundSeriesValue(-index * 12.5),
  }));

  const chunks = encodeSeriesChunks({ co2: monthly, glacier: annual });
  for (const chunk of chunks) {
    for (const encoded of Object.values(chunk.series)) {
      assert.equal(encoded.enc, "list");
    }
  }

  const decoded = roundTrip({ co2: monthly, glacier: annual });
  assert.deepEqual(decoded, { co2: monthly, glacier: annual });
});

test("decoder rejects malformed chunk entries", () => {
  assert.equal(decodeChunkSeriesPoints({ enc: "days", start: "not-a-date", values: [1] }), null);
  assert.equal(decodeChunkSeriesPoints({ enc: "list", dates: ["2020-01-01"], values: [1, 2] }), null);
  assert.equal(decodeChunkSeriesPoints({ enc: "unknown" }), null);
});

test("write + load round-trips the whole dataset through disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "climate-format-"));
  try {
    const dataset = {
      generatedAtIso: "2026-07-09T05:17:00.000Z",
      sources: { temp: "https://example.org" },
      summary: { temp: { points: 500, latestDate: "1950-05-14", latestValue: 1.5 } },
      mapWarnings: [],
      series: {
        temp: dailySeries("1949-01-01", 500, (index) => roundSeriesValue(index * 0.003)),
        sparse: [
          { date: "1974-05-19", value: 333.37 },
          { date: "1974-06-02", value: 333.5 },
        ],
      },
    };

    const written = await writeDatasetArtifacts(dir, dataset);
    assert.ok(written.includes(CORE_FILE_NAME));
    assert.ok(written.some((path) => path.startsWith("series/")));

    const core = JSON.parse(await readFile(join(dir, CORE_FILE_NAME), "utf8"));
    assert.equal(core.formatVersion, DATASET_FORMAT_VERSION);
    assert.equal(core.series, undefined);
    assert.ok(Array.isArray(core.seriesChunks) && core.seriesChunks.length >= 2);
    for (const entry of core.seriesChunks) {
      assert.match(entry.token, /^[0-9a-f]{12}$/);
    }

    const reloaded = await loadPublishedDataset(dir);
    assert.deepEqual(reloaded, dataset);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("published artifacts round-trip the real dataset when present", async (t) => {
  const dataDir = resolve(ROOT_DIR, "public/data");
  const published = await loadPublishedDataset(dataDir);
  if (!published || !published.series) {
    t.skip("No published dataset available locally.");
    return;
  }

  const rounded = {};
  for (const [key, points] of Object.entries(published.series)) {
    rounded[key] = roundSeriesPoints(points);
  }
  const decoded = roundTrip(rounded);
  assert.deepEqual(decoded, rounded);

  for (const [key, points] of Object.entries(rounded)) {
    assert.ok(points.length > 0, `${key} has points`);
    for (let index = 1; index < points.length; index += 1) {
      assert.ok(points[index - 1].date < points[index].date, `${key} stays sorted`);
    }
  }
});
