import type { EnsoOutlook } from "../domain/model";

export const BUNDLED_ENSO_OUTLOOK: EnsoOutlook | null = {
  "issuedDate": "2026-05-14",
  "alertStatus": "El Nino Watch",
  "synopsis": "El Nino is likely to emerge soon (82% chance in May-July 2026) and continue through Northern Hemisphere winter 2026-27 (96% chance in December 2026-February 2027).",
  "sourceLabel": "NOAA CPC ENSO Diagnostic Discussion",
  "sourceUrl": "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
  "nextThreeMonths": {
    "condition": "el_nino",
    "probability": 82,
    "targetLabel": "May-July 2026"
  },
  "nextSixMonths": {
    "condition": "el_nino",
    "probability": 96,
    "targetLabel": "December 2026-February 2027"
  }
};
