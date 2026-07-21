import type { EnsoOutlook } from "../domain/model";

export const BUNDLED_ENSO_OUTLOOK: EnsoOutlook | null = {
  "issuedDate": "2026-07-20",
  "alertStatus": null,
  "synopsis": "El Niño favored: 99% for February-April 2027; 99% for March-May 2027.",
  "sourceLabel": "IRI ENSO Forecast",
  "sourceUrl": "https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/",
  "nextThreeMonths": {
    "condition": "el_nino",
    "probability": 99,
    "targetLabel": "February-April 2027"
  },
  "nextSixMonths": {
    "condition": "el_nino",
    "probability": 99,
    "targetLabel": "March-May 2027"
  }
};
