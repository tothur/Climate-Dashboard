# Dashboard design consistency audit — 2026-07-15

## Scope

Reviewed the deployed dashboard and the fixed local build at desktop (1125 × 1000) and mobile (390 × 844) sizes. Covered the overview, mobile navigation, indicators, English/Hungarian localization, and light/dark themes.

## Findings and fixes

1. **Overview content hierarchy — fixed.** The fallback AI summary repeated the same headline for two distinct signals. Repeated classifications now receive a distinct regional-signal heading in both English and Hungarian.
2. **Indicator heading hierarchy — fixed.** Indicator subsections skipped from the page `h1` to `h3`. Subsection headings now use `h2`, matching the page structure and existing visual treatment.
3. **Mobile interaction sizing — fixed.** Compact link actions, subsection toggles, and panel action buttons were below a comfortable touch size. At mobile widths they now have a minimum 44 px target.

## General health

- **Desktop overview:** Healthy. Stable grid, consistent cards, no horizontal overflow at the audited viewport.
- **Mobile overview:** Healthy. Cards, badges, map, and summary reflow cleanly.
- **Mobile navigation:** Healthy. Clear active state, readable grouping, and consistent theme/language controls.
- **Indicators:** Healthy after fixes. Heading order is sequential and mobile controls meet the 44 px target.
- **Localization and dark theme:** Healthy in the reviewed states. Hungarian labels reflow without clipping and the dark theme preserves the same hierarchy.

## Evidence

- `01-live-desktop-before.png` — deployed desktop overview before fixes
- `02-live-mobile-before.png` — deployed mobile overview before fixes
- `03-live-mobile-nav-before.png` — deployed mobile navigation
- `04-live-mobile-indicators-before.png` — deployed mobile indicators before fixes
- `05-live-mobile-hu-dark-before.png` — deployed Hungarian dark theme
- `06-local-mobile-after.png` — fixed mobile overview
- `07-local-mobile-indicators-after.png` — fixed mobile indicators
- `08-local-desktop-after.png` — fixed desktop overview
- `09-live-mobile-after.png` — deployed mobile overview after release
- `10-live-mobile-indicators-after.png` — deployed mobile indicators after release

The public deployment was also checked in the DOM: the Hungarian regional-summary title is present, indicator subsection headings render as `h2`, the audited mobile controls render at 44 px or taller, and the reviewed pages have no horizontal overflow at 390 px.

## Validation limits

This was a visual and DOM-structure audit in the in-app browser, supported by the repository test and production-build checks. It did not include assistive-technology testing, a formal WCAG contrast measurement, or a device-lab pass on physical phones and tablets.
