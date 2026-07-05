import type { EnsoOutlook } from "../domain/model";

export const BUNDLED_ENSO_OUTLOOK: EnsoOutlook | null = {
  "issuedDate": "2026-06-22",
  "alertStatus": null,
  "synopsis": "A monthly summary of the status of El Nino, La Nina, and the Southern Oscillation, or ENSO , based on the NINO3.4 index (120-170W, 5S-5N) El Niño conditions are strengthening across the tropical Pacific, with SST anomalies in the Niño 3.4 region showing a steady upward trend. The observed SST anomaly reached +0.48 °C during March–May 2026 and increased to +0.94 °C in May 2026. The latest weekly Niño 3.4 index, centered on June 17, 2026, climbed further to +1.7 °C. Together, these observations indicate that Pacific Ocean conditions have transitioned into El Niño conditions and are continuing to intensify toward a moderate-strength El Niño event.",
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
