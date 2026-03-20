import type { EnsoOutlook } from "../domain/model";

export const BUNDLED_ENSO_OUTLOOK: EnsoOutlook | null = {
  "issuedDate": "2026-03-19",
  "alertStatus": null,
  "synopsis": null,
  "sourceLabel": "IRI ENSO Forecast",
  "sourceUrl": "https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/",
  "nextThreeMonths": {
    "condition": "neutral",
    "probability": 91,
    "targetLabel": "MAM 2026"
  },
  "nextSixMonths": {
    "condition": "el_nino",
    "probability": 76,
    "targetLabel": "JAS 2026"
  }
};
