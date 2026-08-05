import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadPublishedDataset } from "./dataset-format.mjs";
import {
  LATEST_SNAPSHOT_METRICS,
  METRIC_KEYS,
  METRIC_REGISTRY,
  SERIES_RULES,
  metricSanitizeLimits,
} from "./metric-registry.mjs";

test("metric registry covers every published series and source", async () => {
  const dataset = await loadPublishedDataset(fileURLToPath(new URL("../public/data", import.meta.url)));
  assert.ok(dataset);
  assert.deepEqual([...METRIC_KEYS].sort(), Object.keys(dataset.series).sort());

  for (const key of METRIC_KEYS) {
    assert.equal(typeof dataset.sources[key], "string", `${key} must have a source`);
    assert.ok(dataset.sources[key].trim().length > 0, `${key} source must not be empty`);
  }
});

test("validation and sanitizer policies are derived from one registry", () => {
  assert.deepEqual(Object.keys(SERIES_RULES), [...METRIC_KEYS]);

  for (const key of METRIC_KEYS) {
    const rules = METRIC_REGISTRY[key].validation;
    assert.ok(Number.isFinite(rules.minValue));
    assert.ok(Number.isFinite(rules.maxValue));
    assert.ok(rules.minValue < rules.maxValue);
    assert.ok(rules.maxAgeDays > 0);
    assert.ok(rules.minPoints > 0);
    assert.ok(rules.minPointsLastYear >= 0);
    assert.deepEqual(metricSanitizeLimits(key), {
      minValue: rules.minValue,
      maxValue: rules.maxValue,
      maxAgeDays: rules.maxAgeDays,
    });
  }

  assert.throws(() => metricSanitizeLimits("not_a_metric"), /Unknown climate metric key/);
});

test("daily SST series cannot remain silently stale for weeks", () => {
  const dailySstKeys = [
    "global_sea_surface_temperature",
    "north_atlantic_sea_surface_temperature",
    "daily_nino34_sea_surface_temperature",
    "global_sea_surface_temperature_anomaly",
    "north_atlantic_sea_surface_temperature_anomaly",
  ];

  for (const key of dailySstKeys) {
    assert.equal(SERIES_RULES[key].maxAgeDays, 10, `${key} must use the daily SST freshness gate`);
  }
});

test("snapshot registry preserves the published API metric contract", async () => {
  const raw = await readFile(new URL("../public/data/climate-latest.json", import.meta.url), "utf8");
  const snapshot = JSON.parse(raw);
  const snapshotKeys = snapshot.metrics.map((metric) => metric.key);
  assert.deepEqual(Object.keys(LATEST_SNAPSHOT_METRICS), snapshotKeys);

  for (const metric of snapshot.metrics) {
    assert.deepEqual(LATEST_SNAPSHOT_METRICS[metric.key], {
      label: metric.label,
      unit: metric.unit,
    });
  }
});
