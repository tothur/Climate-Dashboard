import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readProjectFile(path) {
  return await readFile(resolve(ROOT_DIR, path), "utf8");
}

test("runtime fallback can recover ice-sheet and glacier metrics from live sources", async () => {
  const runtimeSource = await readProjectFile("src/data/runtime-source.ts");

  assert.match(runtimeSource, /WGMS_MASS_CHANGE_ESTIMATES_URL/);
  assert.match(runtimeSource, /NASA_ANTARCTICA_MASS_VARIATION_CHART_URL/);
  assert.match(runtimeSource, /NASA_GREENLAND_MASS_VARIATION_CHART_URL/);
  assert.match(runtimeSource, /loadIceSheetAndGlacierSeriesBundle/);
  assert.doesNotMatch(runtimeSource, /only available through the generated local dataset snapshot/);
});

test("map panels prefer remote candidates when generated map metadata is unavailable", async () => {
  const appSource = await readProjectFile("src/app/App.tsx");

  assert.match(appSource, /function buildMapImageCandidates/);
  assert.match(appSource, /const hasGeneratedMapMetadata = typeof path === "string" && path\.trim\(\)\.length > 0/);
  assert.match(appSource, /imageUrl: remoteImageUrls\[0\]/);
  assert.match(appSource, /fallbackImageUrls: \[\.\.\.remoteImageUrls\.slice\(1\), localImageUrl\]/);
});

test("runtime fallback warnings are visible in the dashboard footer", async () => {
  const appSource = await readProjectFile("src/app/App.tsx");
  const styleSource = await readProjectFile("src/styles/app.css");

  assert.match(appSource, /const footerWarnings = useMemo/);
  assert.match(appSource, /<details className="footer-warnings">/);
  assert.match(styleSource, /\.footer-warnings/);
});

test("known year-specific labels and stale sea-level pins are absent", async () => {
  const appSource = await readProjectFile("src/app/App.tsx");
  const updateScript = await readProjectFile("scripts/update-climate-data.mjs");
  const runtimeSource = await readProjectFile("src/data/runtime-source.ts");
  const adapterSource = await readProjectFile("src/data/adapter.ts");

  assert.doesNotMatch(appSource, /Chance of 2026 > 1\.5/);
  assert.doesNotMatch(appSource, /Annak esélye, hogy 2026 > 1,5/);
  assert.doesNotMatch(updateScript, /2025_rel1/);
  assert.doesNotMatch(runtimeSource, /2025_rel1/);
  assert.doesNotMatch(adapterSource, /2025_rel1/);
});

test("optional CERES refresh fails fast and falls back to retained validated data", async () => {
  const updateScript = await readProjectFile("scripts/update-climate-data.mjs");

  assert.match(updateScript, /const OPTIONAL_SOURCE_TIMEOUT_MS = 10_000/);
  assert.match(updateScript, /const OPTIONAL_SOURCE_RETRY_ATTEMPTS = 1/);
  assert.match(
    updateScript,
    /fetchText\(NASA_CERES_EBAF_OPENDAP_DIRECTORY_URL,\s*\{\s*timeoutMs: OPTIONAL_SOURCE_TIMEOUT_MS,\s*attempts: OPTIONAL_SOURCE_RETRY_ATTEMPTS/
  );
  assert.match(updateScript, /earth_energy_imbalance: retaining the previous validated CERES series/);
});
