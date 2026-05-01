import type { EnsoOutlook } from "../domain/model";

export const BUNDLED_ENSO_OUTLOOK: EnsoOutlook | null = {
  "issuedDate": "2026-04-20",
  "alertStatus": null,
  "synopsis": null,
  "sourceLabel": "IRI ENSO Forecast",
  "sourceUrl": "https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/",
  "nextThreeMonths": {
    "condition": "el_nino",
    "probability": 70,
    "targetLabel": "AMJ 2026"
  },
  "nextSixMonths": {
    "condition": "el_nino",
    "probability": 92,
    "targetLabel": "ASO 2026"
  }
};
