import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseNoaaCh4MonthlyCsv,
  parseNoaaCo2DailyCsv,
  parseNoaaCpcMonthlyIndexTable,
  parseNoaaPslMonthlyIndexData,
  parseNsidcDailyExtentCsv,
  parseReanalyzerDailyAnomalyJson,
  parseReanalyzerDailyJson,
} from "./source-parsers.mjs";

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function fixture(name) {
  return await readFile(resolve(FIXTURE_DIR, name), "utf8");
}

test("Climate Reanalyzer fixture merges preliminary current-year values behind finalized observations", async () => {
  const payload = JSON.parse(await fixture("reanalyzer-daily.json"));

  assert.deepEqual(parseReanalyzerDailyJson(payload, { currentYear: 2025 }), [
    { date: "2024-01-01", value: 11.25 },
    { date: "2024-01-04", value: 14.5 },
    { date: "2025-01-01", value: 15 },
    { date: "2025-01-02", value: 16 },
    { date: "2025-01-05", value: 18 },
  ]);
  assert.deepEqual(parseReanalyzerDailyAnomalyJson(payload, "1991-2020", { currentYear: 2025 }), [
    { date: "2024-01-01", value: 1.25 },
    { date: "2024-01-04", value: 1.5 },
    { date: "2025-01-01", value: 5 },
    { date: "2025-01-02", value: 5 },
    { date: "2025-01-05", value: 4 },
  ]);
});

test("NSIDC fixture selects the usable extent column and rejects invalid dates", async () => {
  assert.deepEqual(parseNsidcDailyExtentCsv(await fixture("nsidc-daily.csv")), [
    { date: "2026-07-15", value: 7.125 },
    { date: "2026-07-16", value: 7.25 },
  ]);
});

test("NOAA CO2 fixture uses fallback columns, validates dates, and resolves duplicates", async () => {
  assert.deepEqual(parseNoaaCo2DailyCsv(await fixture("noaa-co2-daily.csv")), [
    { date: "2026-07-15", value: 428.15 },
    { date: "2026-07-16", value: 428.25 },
  ]);
});

test("NOAA monthly greenhouse-gas fixture falls back from missing averages to trend values", async () => {
  assert.deepEqual(parseNoaaCh4MonthlyCsv(await fixture("noaa-ghg-monthly.csv")), [
    { date: "2026-05-01", value: 1945.2 },
    { date: "2026-06-01", value: 1946.1 },
  ]);
});

test("monthly index fixtures accept partial current-year rows and discard missing sentinels", async () => {
  const cpc = parseNoaaCpcMonthlyIndexTable(await fixture("noaa-monthly-indices.txt"));
  assert.equal(cpc.length, 15);
  assert.deepEqual(cpc.slice(-3), [
    { date: "2026-01-01", value: -0.1 },
    { date: "2026-02-01", value: -0.2 },
    { date: "2026-04-01", value: 0.4 },
  ]);

  assert.deepEqual(parseNoaaPslMonthlyIndexData(await fixture("noaa-psl-index.txt")), [
    { date: "2025-01-01", value: 0.1 },
    { date: "2025-02-01", value: 0.2 },
    { date: "2025-03-01", value: 0.3 },
    { date: "2026-01-01", value: -0.1 },
    { date: "2026-02-01", value: -0.2 },
  ]);
});
