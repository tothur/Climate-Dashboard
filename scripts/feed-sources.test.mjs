import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCeresEarthEnergyImbalancePoints,
  buildGlobalMeanSeaLevelCandidateUrls,
  extractLatestCeresGranule,
  extractLatestGlobalMeanSeaLevelUrl,
  parseCpcEnsoOutlook,
  parseCpcEnsoProbabilityTable,
  parseIriEnsoOutlook,
} from "./update-climate-data.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = resolve(ROOT_DIR, "scripts/fixtures");

async function fixture(name) {
  return await readFile(resolve(FIXTURE_DIR, name), "utf8");
}

test("sea level picks the newest release, not only rel1", () => {
  const homepage = `
    <a href="/files/2025_rel4/gmsl_2025rel4_seasons_rmvd.txt">2025 rel4</a>
    <a href="https://sealevel.colorado.edu/files/2026_rel2/gmsl_2026rel2_seasons_rmvd.txt">2026 rel2</a>
    <a href="/files/2026_rel1/gmsl_2026rel1_seasons_rmvd.txt">2026 rel1</a>`;

  assert.equal(
    extractLatestGlobalMeanSeaLevelUrl(homepage),
    "https://sealevel.colorado.edu/files/2026_rel2/gmsl_2026rel2_seasons_rmvd.txt"
  );

  const candidates = buildGlobalMeanSeaLevelCandidateUrls("", 2026);
  assert.equal(candidates[0], "https://sealevel.colorado.edu/files/2026_rel4/gmsl_2026rel4_seasons_rmvd.txt");
  assert.ok(candidates.includes("https://sealevel.colorado.edu/files/2026_rel2/gmsl_2026rel2_seasons_rmvd.txt"));
  assert.ok(
    candidates.findIndex((url) => url.includes("2026_rel1")) < candidates.findIndex((url) => url.includes("2025_rel4"))
  );
});

test("CPC official probability table gives both ENSO windows and keeps the discussion text", async () => {
  const discussion = parseCpcEnsoOutlook(await fixture("cpc-enso-discussion.html"));
  const outlook = parseCpcEnsoProbabilityTable(await fixture("cpc-enso-probabilities.html"), discussion);

  assert.equal(outlook.issuedDate, "2026-10-08");
  assert.equal(outlook.sourceLabel, "NOAA CPC ENSO Probabilities");
  assert.match(outlook.synopsis, /strong-to-very strong El Ni[nñ]o likely through January-March 2027/);
  assert.deepEqual(outlook.nextThreeMonths, { condition: "el_nino", probability: 100, targetLabel: "October-December 2026" });
  assert.deepEqual(outlook.nextSixMonths, { condition: "el_nino", probability: 100, targetLabel: "January-March 2027" });
});

test("CPC probability table dates seasons across the new year and falls back to the issue month", () => {
  const html = `<p>Issued December 2026</p>
    <table><tr><th>NDJ Nov Dec Jan</th><td>0</td><td>10</td><td>90</td></tr>
    <tr><th>DJF Dec Jan Feb</th><td>0</td><td>20</td><td>80</td></tr>
    <tr><th>JFM Jan Feb Mar</th><td>0</td><td>30</td><td>70</td></tr>
    <tr><th>FMA Feb Mar Apr</th><td>5</td><td>45</td><td>50</td></tr>
    <tr><th>MAM Mar Apr May</th><td>10</td><td>60</td><td>30</td></tr></table>`;
  const outlook = parseCpcEnsoProbabilityTable(html);

  assert.equal(outlook.issuedDate, "2026-12-01");
  assert.deepEqual(outlook.nextThreeMonths, { condition: "el_nino", probability: 80, targetLabel: "December-February 2027" });
  assert.deepEqual(outlook.nextSixMonths, { condition: "neutral", probability: 60, targetLabel: "March-May 2027" });
  assert.equal(parseCpcEnsoProbabilityTable("<p>No table here</p>"), null);
});

test("CPC synopsis that names a single period still yields that window", async () => {
  const discussion = parseCpcEnsoOutlook(await fixture("cpc-enso-discussion.html"));

  assert.equal(discussion.issuedDate, "2026-10-08");
  assert.deepEqual(discussion.nextSixMonths, { condition: "el_nino", probability: 83, targetLabel: "January-March 2027" });
});

test("IRI prose with years after season codes and single-season percentages parses", async () => {
  const outlook = parseIriEnsoOutlook(await fixture("iri-enso-current.html"));

  assert.equal(outlook.issuedDate, "2026-10-19");
  assert.deepEqual(outlook.nextThreeMonths, { condition: "el_nino", probability: 100, targetLabel: "October-December 2026" });
  assert.deepEqual(outlook.nextSixMonths, { condition: "el_nino", probability: 100, targetLabel: "February-April 2027" });
});

test("CERES granule lookup takes the HTTPS download from the CMR search", () => {
  const name = "CERES_EBAF-TOA_Edition4.2.1_200003-202608.nc";
  const url = `https://data.asdc.earthdata.nasa.gov/asdc-prod-protected/CERES/CERES_EBAF-TOA_Edition4.2.1/${name}`;
  const payload = {
    items: [
      {
        umm: {
          GranuleUR: name,
          RelatedUrls: [
            { URL: `${url}.met`, Type: "EXTENDED METADATA" },
            { URL: `s3://asdc-prod-protected/CERES/CERES_EBAF-TOA_Edition4.2.1/${name}`, Type: "GET DATA VIA DIRECT ACCESS" },
            { URL: url, Type: "GET DATA" },
          ],
        },
      },
    ],
  };

  assert.deepEqual(extractLatestCeresGranule(payload), { name, url });
  assert.equal(extractLatestCeresGranule({ items: [] }), null);
});

test("CERES time offsets become monthly dates and fill values are dropped", () => {
  assert.deepEqual(
    buildCeresEarthEnergyImbalancePoints([14.5, 45, 9_660.5], [0.75, -999, 1.25], "days since 2000-03-01 00:00:00"),
    [
      { date: "2000-03-01", value: 0.75 },
      { date: "2026-08-01", value: 1.25 },
    ]
  );
});
