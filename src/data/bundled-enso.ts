import type { EnsoOutlook } from "../domain/model";

export const BUNDLED_ENSO_OUTLOOK: EnsoOutlook | null = {
  "issuedDate": "2026-10-08",
  "alertStatus": "El Nino Advisory",
  "synopsis": "El Nino continues to strengthen, with a strong-to-very strong El Nino likely through January-March 2027 (remaining greater than an 83% chance).",
  "sourceLabel": "NOAA CPC ENSO Probabilities",
  "sourceUrl": "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/",
  "nextThreeMonths": {
    "condition": "el_nino",
    "probability": 100,
    "targetLabel": "October-December 2026"
  },
  "nextSixMonths": {
    "condition": "el_nino",
    "probability": 100,
    "targetLabel": "January-March 2027"
  }
};
