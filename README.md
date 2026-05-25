# Climate Dashboard

Climate Dashboard is a bilingual, responsive web app for tracking daily global surface temperature, sea surface temperature, total sea ice extent, and Mauna Loa CO2 with year-over-year comparison charts and automated daily updates.

## Current Functionality

- Bilingual UI (`EN` / `HU`) with saved language preference.
- Light / dark / system theme with saved theme preference.
- Header branding with Earth logo and climate subtitle.
- Latest-value cards for all tracked series.
- Collapsible sections for:
  - `Climate Indicators`
  - `Forcing`
- Footer with:
  - data source mode pill (`live` / `mixed` / `bundled`)
  - last update timestamp
  - primary source links per metric

### Climate Indicators

Three charts with daily points displayed on a Jan-Dec axis:

- Global Surface Temperature
- Global Sea Surface Temperature
- Global Sea Ice Extent (Arctic + Antarctic total)

Comparison logic:

- Always plots the current year plus previous 3 years.
- Color scheme emphasizes current year with a warm color and older years with cooler blue/blue-grey shades.

Axis constraints:

- Global Surface Temperature: `10` to `18` deg C
- Global Sea Surface Temperature: `19.5` to `21.5` deg C
- Global Sea Ice Extent: `10` to `30` million sq km

### Forcing (CO2)

- Atmospheric CO2 at Mauna Loa plotted from daily data aggregated to monthly means.
- X-axis starts at `1974`, with decadal labels.
- Y-axis fixed to `280` to `500` ppm.
- Compact left-side half-width card layout.

## Data Sources

- Global surface temperature (ERA5): Climate Reanalyzer
- Global sea surface temperature (NOAA OISST v2.1): Climate Reanalyzer
- Sea ice extent (north + south daily): NSIDC Sea Ice Index v4 (NOAA-hosted files)
- Atmospheric CO2 (daily Mauna Loa): NOAA GML

Generated dataset file:

- `public/data/climate-realtime.json`
- `public/data/climate-latest.json` - compact read-only snapshot for a ChatGPT Action

## Runtime Loading Strategy

The app resolves data in this order:

1. Load local generated file: `./data/climate-realtime.json`
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
- Writes `public/data/climate-realtime.json` with:
  - `generatedAtIso`
  - `sources`
  - `aiSummary`
  - `series`
  - `summary`

### Optional OpenAI Daily Summary

If `OPENAI_API_KEY` is present in the update environment, `data:update:raw` generates one compact 2-3 sentence AI summary through the OpenAI Responses API and stores it in `public/data/climate-realtime.json` as `aiSummary`.

Cost and safety controls:

- The browser never receives the API key; the API call runs only inside the data updater.
- The updater sends only compact latest metrics and temperature-record checks, not full time series.
- The OpenAI summary model is restricted to `gpt-5.4-mini`; `OPENAI_SUMMARY_MODEL` cannot select any other model.
- Output is capped at 600 tokens, which is enough for strict JSON while keeping daily usage low.
- The updater reuses the previous summary when the relevant metrics have not changed, and also limits generation to at most once per UTC day in watch mode.
- If the API key is absent or the request fails, the dashboard uses the local rule-based summary.
- The model response must match a strict JSON schema and pass deterministic validation against the computed temperature status before it is published.

For GitHub Actions, add `OPENAI_API_KEY` as a repository secret. Without that secret, the workflow still succeeds and uses the local summary fallback.

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

- Daily at `05:17 UTC`
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
