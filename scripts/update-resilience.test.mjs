import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadPublishedDataset, writeDatasetArtifacts } from "./dataset-format.mjs";
import { parseNoaaCo2DailyCsv } from "./source-parsers.mjs";
import { loadSourceOrFallback, retainPreviousSeries } from "./update-resilience.mjs";

test("independent source failure does not reject successful loads", async () => {
  const warnings = [];
  const [failed, successful] = await Promise.all([
    loadSourceOrFallback({
      key: "failed_metric",
      load: async () => {
        throw new Error("mock HTTP 503");
      },
      warnings,
    }),
    loadSourceOrFallback({ key: "successful_metric", load: async () => "fresh payload", warnings }),
  ]);

  assert.equal(failed, null);
  assert.equal(successful, "fresh payload");
  assert.deepEqual(warnings, ["failed_metric: source refresh failed (mock HTTP 503)."]);
});

test("mocked fetch-to-artifact pipeline retains only unusable series", async () => {
  const dir = await mkdtemp(join(tmpdir(), "climate-resilience-"));
  const previous = {
    atmospheric_co2: [{ date: "2026-07-14", value: 427.9 }],
    global_surface_temperature: [{ date: "2026-07-14", value: 16.8 }],
  };
  const warnings = [];

  try {
    const [co2Payload, temperaturePayload] = await Promise.all([
      loadSourceOrFallback({
        key: "atmospheric_co2",
        load: async () => "2026,7,15,2026.53,428.15,428.14,426.10\n",
        warnings,
      }),
      loadSourceOrFallback({
        key: "global_surface_temperature",
        load: async () => {
          throw new Error("mock timeout");
        },
        warnings,
      }),
    ]);

    const series = {
      atmospheric_co2: parseNoaaCo2DailyCsv(co2Payload),
      global_surface_temperature: Array.isArray(temperaturePayload) ? temperaturePayload : [],
    };
    const retainedKeys = await retainPreviousSeries({
      series,
      loadPreviousSeries: async (key) => previous[key] ?? [],
      warnings,
    });

    await writeDatasetArtifacts(dir, {
      generatedAtIso: "2026-07-15T05:17:00.000Z",
      sources: {},
      summary: {},
      series,
    });
    const published = await loadPublishedDataset(dir);

    assert.deepEqual(retainedKeys, ["global_surface_temperature"]);
    assert.deepEqual(published.series.atmospheric_co2, [{ date: "2026-07-15", value: 428.15 }]);
    assert.deepEqual(published.series.global_surface_temperature, previous.global_surface_temperature);
    assert.match(warnings.join("\n"), /mock timeout/);
    assert.match(warnings.join("\n"), /retaining the previous validated series/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
