import type { EnsoOutlook } from "../domain/model";

export const BUNDLED_ENSO_OUTLOOK: EnsoOutlook | null = {
  "issuedDate": "2026-06-22",
  "alertStatus": null,
  "synopsis": "El Niño favored: 100% for JJA 2026; 99% for OND 2026.",
  "sourceLabel": "IRI ENSO Forecast",
  "sourceUrl": "https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/",
  "nextThreeMonths": {
    "condition": "el_nino",
    "probability": 100,
    "targetLabel": "JJA 2026"
  },
  "nextSixMonths": {
    "condition": "el_nino",
    "probability": 99,
    "targetLabel": "OND 2026"
  }
};
