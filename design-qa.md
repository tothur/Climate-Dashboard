# Overview outlook-card design QA

Source visual truth: `/Users/andrastoth/.codex/generated_images/01a09c2f-f2b7-7c43-9d13-e30a036e27e8/exec-2bb9c509-b3ba-47da-afcd-9abe9218758c.png`

Implementation evidence: Codex in-app browser tab 4 at `http://127.0.0.1:4173/`, with a full-page desktop capture, a focused two-card capture, and a mobile viewport capture emitted in the implementation turn. The browser sandbox did not expose a durable filesystem path for these captures.

Viewport and normalization:

- Source concept: 1586 × 992 px; isolated equal-width two-card composition in dark mode.
- Desktop implementation: 1280 × 960 CSS px; focused crop 670 × 505 px; dark mode with loaded live data.
- Mobile implementation: 390 × 844 CSS px; dark mode with loaded live data.
- The source intentionally isolates the two redesigned cards. The implementation preserves the production Overview's three-column Regional / ENSO / Outlook grid, so comparison was normalized around hierarchy, internal rhythm, styling, and equal card height rather than literal source-card width.

## Full-view and focused comparison evidence

The selected concept and browser-rendered implementation were both opened and inspected. The implementation carries over the concept's editorial ENSO hierarchy, clear current-phase headline, three-phase continuum, two-stop forecast timeline, range-first annual projection, endpoint labels, central estimate marker, two supporting probability metrics, bottom-aligned actions, and restrained flat dashboard styling.

The focused desktop capture confirmed that the ENSO and 2026 Outlook cards align to the same 490.05 px row height. The implementation adapts the concept to narrower production grid tracks without truncation or horizontal overflow. The mobile capture confirmed that both cards become readable single-column blocks at 354 px width, with the ENSO headline, phase scale, timeline, range plot, probability metrics, and links intact.

## Required fidelity surfaces

- Fonts and typography: The existing Inter Tight / Inter product stack is retained. Headlines use the established display weight and tight tracking; eyebrow labels are compact uppercase; headline values remain dominant; supporting labels do not wrap or collide at the checked widths.
- Spacing and layout rhythm: The cards use the production 24 px desktop padding, fine dividers, compact vertical grouping, and bottom-aligned actions. The excessive empty zones from the previous cards are gone. Desktop card heights match exactly; stacked mobile cards have content-driven heights.
- Colors and visual tokens: Existing dark graphite/green surfaces, gray-green borders, muted secondary text, mint actions, ocean blue, ENSO green, and coral temperature accents are reused. The current `El Niño` headline is high-contrast white, avoiding the previous green-on-green status treatment.
- Image quality and asset fidelity: These data cards require no raster imagery. The existing toolkit info icon is reused; no placeholder or generated decorative assets were introduced.
- Copy and content: Issue date, current ENSO phase, both forecast windows and probabilities, annual estimate, baseline, interval, both probability metrics, and both destination links remain visible. The Overview footer contains the exact credit `Made by András Tóth and GPT-5.6.` alongside live-feed and update metadata.

## Interactions and technical checks

- `Explore seasonal outlook` opens the Variability view (`dashboard-view-variability`).
- `View estimate & assumptions` opens the Projections view (`dashboard-view-projections`).
- Returning through Overview restores `dashboard-view-overview`.
- Desktop and mobile `scrollWidth` equal `clientWidth`; no horizontal overflow was found.
- Browser console contained no errors or warnings.
- Production build passed.
- All 35 repository tests passed.

## Findings

No actionable P0, P1, or P2 findings remain.

## Comparison history

The first browser pass found one P2 fidelity issue: the annual projection label and `+1.53 °C` value inherited `align-self: end`, moving the hero to the right instead of following the selected concept's left-aligned editorial hierarchy. Both elements were explicitly aligned to the start, and the 2026 header received the matching information icon. The revised desktop and mobile captures show the corrected hierarchy with no overflow or collision.

## Implementation checklist

- [x] Clear, high-contrast ENSO current phase
- [x] Compact three-phase continuum
- [x] Two-stop forecast timeline with probabilities
- [x] Range-first annual projection treatment
- [x] Endpoint and point-estimate labels
- [x] Supporting probability columns
- [x] Equal desktop card heights
- [x] Responsive mobile layout
- [x] Exact Overview footer credit
- [x] Working card destinations
- [x] Build, tests, overflow, and console checks

final result: passed
