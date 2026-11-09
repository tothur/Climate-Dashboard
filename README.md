# Climate Dashboard

Climate Dashboard is a bilingual (English / Hungarian), responsive web app that tracks the state of the global climate from about 40 daily, monthly and annual series, refreshed automatically every day and published on GitHub Pages: https://tothur.github.io/Climate-Dashboard/

## Pages

- **Overview** (`#overview`): the daily global temperature anomaly against 1850-1900, today's air and ocean maps, an AI-written summary of the day's notable signals, headline indicators, regional anomalies, the Niño 3.4 anomaly and ENSO outlook, this year's warming estimate and the warming pathways to 2100.
- **Climate system** (`#climate-system/<topic>`): every indicator, grouped into eight topics: temperature, regions, oceans, ice & snow, energy, greenhouse gases & Sun, El Niño & La Niña, and circulation modes. Daily series are drawn against their 1991-2020 normal range and recent years; long records as trend charts.
- **Maps** (`#maps`): global 2 m air temperature and sea surface temperature maps, absolute and anomaly.
- **Projections** (`#projections`, experimental): an analog-year estimate of this year's annual mean, the CMIP7 ScenarioMIP warming pathways, and Earth-system tipping thresholds (Armstrong McKay et al. 2022) compared with long-term warming (the 10-year average).
- **Sources** (`#sources`): every series with its source, cadence and freshness.

Also: light / dark / system theme, saved language and theme preferences, per-page tab titles, link-preview metadata, and an installable offline-capable PWA.

## Data Sources

- Surface temperature, global and regional (ERA5) and sea surface temperature (NOAA OISST v2.1): Climate Reanalyzer
- Daily global mean anomaly against 1850-1900 (ERA5): ECMWF Climate Pulse
- Sea ice extent: NSIDC Sea Ice Index v4; snow cover: Rutgers Global Snow Lab
- Sea level: University of Colorado; ocean heat content: NOAA NCEI
- Earth energy imbalance: NASA CERES EBAF (needs `EARTHDATA_TOKEN`, see below)
- Ice sheets and glaciers: NASA GRACE/GRACE-FO, IMBIE, WGMS
- CO2, CH4, N2O and AGGI: NOAA GML; total solar irradiance: LASP
- ENSO, NAO, PNA, SOI and AO indices and the ENSO outlook: NOAA CPC
- Maps: Climate Reanalyzer (GFS)

The full list, with links, is on the Sources page and in `scripts/metric-registry.mjs`.

## Code Layout

- `src/app/App.tsx` - the app shell and pages; `src/app/strings.ts` - all interface copy in both languages
- `src/components/`, `src/charts/` - chart panels and their ECharts option builders
- `src/data/` - runtime loading, fallbacks and published reference values (`projection-reference.ts`)
- `scripts/` - the data updater, verifier, parsers and their tests

Generated dataset files:

- `public/data/climate-core.json` - latest values, summary, ENSO outlook, AI summary, map metadata, and a manifest of series chunks
- `public/data/series/<start>-<end>.json` - per-decade columnar series chunks (daily runs stored as value arrays with implicit dates; sparse series as date/value lists). Historical decades are immutable, so only the current decade changes day to day.
- `public/data/climate-latest.json` - compact read-only snapshot for a ChatGPT Action

## Runtime Loading Strategy

The app resolves data in this order:

1. Load local generated artifacts: `./data/climate-core.json` plus its series chunks (falls back to a legacy `./data/climate-realtime.json` monolith if present)
2. If unavailable/invalid, fetch live series directly from remote feeds at runtime
3. For any missing live series, fill with bundled fallback data

This produces `live`, `mixed`, or `bundled` source mode.

## Update And Verification Methodology

### Local Scripts

- One-time update + verification:

```bash
npm run data:update
```

- Raw update only (no verify):

```bash
npm run data:update:raw
```

- Verification only:

```bash
npm run data:verify
```

- Rebuild only the compact ChatGPT snapshot:

```bash
npm run data:chatgpt
```

- Continuous updater (default every 6 hours):

```bash
npm run data:update:auto
```

- Update once, then start dev server:

```bash
npm run dev:live
```

### What `data:update:raw` does

- Fetches all source datasets.
- Uses request timeout + retry/backoff for network robustness.
- Normalizes and sanitizes each series (value ranges, staleness windows, no future dates).
- Writes `public/data/climate-core.json` + `public/data/series/*.json` with:
  - `generatedAtIso`
  - `sources`
  - `aiSummary`
  - `series`
  - `summary`

### Optional OpenAI Daily Summary

If `OPENAI_API_KEY` is present in the update environment, `data:update:raw` generates one compact 2-3 sentence AI summary through the OpenAI Responses API and stores it in `public/data/climate-core.json` as `aiSummary`.

Cost and safety controls:

- The browser never receives the API key; the API call runs only inside the data updater.
- The updater sends only compact latest metrics and temperature-record checks, not full time series.
- The OpenAI summary model is restricted to `gpt-5.4-mini`; `OPENAI_SUMMARY_MODEL` cannot select any other model.
- Output is capped at 600 tokens, which is enough for strict JSON while keeping daily usage low.
- The updater reuses the previous summary when the relevant metrics have not changed, and also limits generation to at most once per UTC day in watch mode.
- If the API key is absent or the request fails, the dashboard uses the local rule-based summary.
- The model response must match a strict JSON schema and pass deterministic validation against the computed temperature status before it is published.

For GitHub Actions, add `OPENAI_API_KEY` as a repository secret. Without that secret, the workflow still succeeds and uses the local summary fallback.

### Earthdata token (CERES)

NASA serves CERES EBAF (Earth energy imbalance) only through Earthdata Cloud, which needs an Earthdata Login. The updater finds the newest granule through the public CMR search, then reads just the time and global net flux values from the netCDF file with HTTP range requests, authenticated with `EARTHDATA_TOKEN` (a user token from https://urs.earthdata.nasa.gov, under "Generate Token"). Add it as a repository secret; without it the workflow still succeeds, keeps the last published CERES series and logs a warning.

### What `data:verify` checks

- Dataset shape and required series presence.
- Date format and strict chronological order.
- Value range sanity per series.
- Freshness thresholds per series.
- Recent-density checks (points in the last 365 days).
- `summary` consistency against actual series values.

Verification fails with non-zero exit code on hard errors.

## ChatGPT Questions Over Current Data

The project publishes a compact read-only endpoint for a custom GPT Action:

- Dataset: `https://tothur.github.io/Climate-Dashboard/data/climate-latest.json`
- OpenAPI schema: `https://tothur.github.io/Climate-Dashboard/chatgpt/climate-action.openapi.yaml`
- Privacy policy: `https://tothur.github.io/Climate-Dashboard/chatgpt/privacy-policy.html`

The endpoint exposes latest values, observation dates, units, data-source links, structured ENSO outlook fields, and
validated temperature-status flags. It deliberately omits full historical time series, AI token usage, and write
capabilities. It is suitable for questions about the latest published dashboard state; it cannot answer arbitrary
historical trend calculations without a later, narrowly scoped historical endpoint.

### Custom GPT Setup

1. Create or edit a GPT in ChatGPT and add an Action.
2. Import the OpenAPI schema URL above, or paste `public/chatgpt/climate-action.openapi.yaml`.
3. Set authentication to `None`, because the endpoint is intentionally public and read-only.
4. Use the privacy-policy URL above if the GPT will be shared by link or published.
5. Add instructions such as:

```text
Use getLatestClimateDashboardObservations for questions about current Climate Dashboard data.
Always give the observation date with reported values and state that different indicators can have different dates.
Do not claim a record unless temperatureStatus explicitly supports it.
Do not calculate or assert historical trends when the returned snapshot does not contain the required history.
```

### Security Boundary

- The endpoint contains public climate observations only; no `OPENAI_API_KEY` or other secret is sent to the browser or
  ChatGPT Action.
- It supports `GET` only through static GitHub Pages hosting, so the Action cannot alter dashboard data.
- Adding API-key authentication would not make this file private while it is also served as a public dashboard asset.
  Private data or user-specific queries require a server-side endpoint with authentication.

## GitHub Actions Daily Update

Workflow file:

- `.github/workflows/daily-climate-data.yml`

Trigger:

- Twice daily, at `03:43` and `14:43 UTC` (GitHub often starts scheduled runs hours late, so two runs keep the data fresh)
- Manual via `workflow_dispatch`

Pipeline:

1. `npm ci`
2. `npm run data:update`
3. `npm run data:verify`
4. Commit and push only if published data or maps changed

## Development

Recommended Node version: `20+`

```bash
npm install
npm run dev
```

Build checks:

```bash
npm run typecheck
npm run build
```
