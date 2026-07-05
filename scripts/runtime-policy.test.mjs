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

test("optional WGMS refresh cannot block daily data and map publication", async () => {
  const updateScript = await readProjectFile("scripts/update-climate-data.mjs");

  assert.match(
    updateScript,
    /fetchText\(WGMS_MASS_CHANGE_ESTIMATES_URL,\s*\{\s*timeoutMs: OPTIONAL_SOURCE_TIMEOUT_MS,\s*attempts: OPTIONAL_SOURCE_RETRY_ATTEMPTS/
  );
  assert.match(updateScript, /global_glacier_mass_balance: WGMS archive refresh failed/);
  assert.match(updateScript, /global_glacier_mass_balance: retaining the previous validated WGMS series/);
});

test("optional solar history refresh cannot block daily data publication", async () => {
  const updateScript = await readProjectFile("scripts/update-climate-data.mjs");

  assert.match(
    updateScript,
    /fetchText\(LASP_NRL2_TSI_MONTHLY_URL,\s*\{\s*timeoutMs: OPTIONAL_SOURCE_TIMEOUT_MS,\s*attempts: OPTIONAL_SOURCE_RETRY_ATTEMPTS/
  );
  assert.match(updateScript, /incoming_solar_energy: NRLTSI2 historical refresh failed/);
  assert.match(updateScript, /incoming_solar_energy: retaining the previous validated NRLTSI2 history/);
  assert.match(updateScript, /incoming_solar_energy: retaining the previous validated NRLTSI2\/TSIS-1 series/);
});

test("NASA ice-sheet chart refreshes fall back to retained validated data", async () => {
  const updateScript = await readProjectFile("scripts/update-climate-data.mjs");

  assert.match(updateScript, /fetchJson\(NASA_ANTARCTICA_MASS_VARIATION_CHART_URL\)\.catch/);
  assert.match(updateScript, /fetchJson\(NASA_GREENLAND_MASS_VARIATION_CHART_URL\)\.catch/);
  assert.match(updateScript, /antarctic_ice_sheet_mass_balance: retaining the previous validated NASA GRACE\/GRACE-FO series/);
  assert.match(updateScript, /greenland_ice_sheet_mass_balance: retaining the previous validated NASA GRACE\/GRACE-FO series/);
});

test("daily dataset publication retries transient push failures", async () => {
  const workflow = await readProjectFile(".github/workflows/daily-climate-data.yml");

  assert.match(workflow, /for attempt in 1 2 3 4; do/);
  assert.match(workflow, /git push origin HEAD:main/);
  assert.match(workflow, /Push attempt \$\{attempt\} failed; retrying/);
  assert.match(workflow, /Failed to publish refreshed climate dataset after/);
});

test("ENSO outlook prefers NOAA CPC diagnostic updates when available", async () => {
  const updateScript = await readProjectFile("scripts/update-climate-data.mjs");

  assert.match(updateScript, /fetchText\(NOAA_CPC_ENSO_DISCUSSION_URL\)/);
  assert.match(updateScript, /isCompleteEnsoOutlook\(parsedCpcEnsoOutlook\)/);
  assert.match(updateScript, /enso_outlook: retaining the previous validated ENSO forecast windows/);
});

test("ENSO outlook handles current IRI prose forecast format", async () => {
  const updateScript = await readProjectFile("scripts/update-climate-data.mjs");

  assert.match(updateScript, /function parseIriProseEnsoOutlook/);
  assert.match(updateScript, /const ENSO_SEASON_TARGET_LABELS/);
  assert.match(updateScript, /JJA:\s+"June-August"/);
  assert.match(updateScript, /targetLabel:\s+formatIriSeasonTargetLabel\(row\.season,\s+year\)/);
  assert.match(updateScript, /strongly favors\(\?:\\s\+the\\s\+persistence\\s\+of\)\?/);
  assert.match(updateScript, /El\\s\+Ni\(\?:n\|ñ\)o/);
  assert.match(updateScript, /from\\s\+\(\[A-Z\]\{3\}\)\\s\+through\\s\+\(\[A-Z\]\{3\}\)/);
  assert.match(updateScript, /followed by\\s\+\(\\d\{1,3\}\)\\s\*%\\s\+and\\s\+\(\\d\{1,3\}\)\\s\*%/);
  assert.match(updateScript, /parseIriProseEnsoOutlook\(pageText, issuedDate\)/);
});

test("ENSO outlook staleness warns before it blocks daily publication", async () => {
  const verifyScript = await readProjectFile("scripts/verify-climate-data.mjs");

  assert.match(verifyScript, /const ENSO_OUTLOOK_STALE_WARNING_DAYS = 50/);
  assert.match(verifyScript, /const ENSO_OUTLOOK_STALE_ERROR_DAYS = 140/);
  assert.match(verifyScript, /warnings\.push\(`ensoOutlook: issuedDate \$\{issuedDate\} is stale/);
  assert.match(verifyScript, /errors\.push\(`ensoOutlook: issuedDate \$\{issuedDate\} is stale/);
});

test("AI summary prompt prioritizes daily records over slow background indicators", async () => {
  const updateScript = await readProjectFile("scripts/update-climate-data.mjs");

  assert.match(updateScript, /const AI_SUMMARY_PROMPT_VERSION = 4/);
  assert.match(updateScript, /Write a compact daily climate-watch briefing as bullet points, not a long-term climate-status recap/);
  assert.match(updateScript, /Use 2 or 3 concise bullet points/);
  assert.match(updateScript, /start each bullet line with "- "/);
  assert.match(updateScript, /first bullet must copy the first sentence of temperatureBrief\.requiredSentenceEn verbatim/);
  assert.match(updateScript, /record-low or near-record-low sea-ice extent/);
  assert.match(updateScript, /Treat greenhouse gas, AGGI, sea-level, and ocean-heat-content records as background context/);
  assert.match(updateScript, /Use long-term background indicators such as atmospheric CO2, CH4, AGGI, global mean sea level, and ocean heat content only as a fallback/);
  assert.match(updateScript, /const dailyRecordSignals = anomalySignals\.filter\(isDailyRecordLeadSignal\)/);
  assert.match(updateScript, /const AI_SUMMARY_BACKGROUND_SIGNAL_KEYS = new Set/);
  assert.match(updateScript, /global_sea_ice_extent: 8/);
  assert.match(updateScript, /atmospheric_co2: 1/);
});
