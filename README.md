# Climate Dashboard

React + TypeScript + Vite + ECharts dashboard for global climate indicators and atmospheric forcing.

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
  - `series`
  - `summary`

### What `data:verify` checks

- Dataset shape and required series presence.
- Date format and strict chronological order.
- Value range sanity per series.
- Freshness thresholds per series.
- Recent-density checks (points in the last 365 days).
- `summary` consistency against actual series values.

Verification fails with non-zero exit code on hard errors.

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
4. Commit and push only if `public/data/climate-realtime.json` changed

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
