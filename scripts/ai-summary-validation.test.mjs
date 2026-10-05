import assert from "node:assert/strict";
import test from "node:test";

import { parseAiSummaryJson, sentenceCount, validateOpenAiSummaryText } from "./ai-summary-validation.mjs";

const warmChecks = [
  { key: "global_surface_temperature", tone: "record" },
  { key: "global_sea_surface_temperature", tone: "near-record" },
];
const normalChecks = [
  { key: "global_surface_temperature", tone: "normal" },
  { key: "global_sea_surface_temperature", tone: "normal" },
];
const anomalySignals = [
  { key: "antarctic_sea_ice_extent", category: "sea ice", basis: "same-date historical rank" },
  { key: "atmospheric_co2", category: "greenhouse gas", basis: "full-record rank" },
];
const contextSignals = [{ signalKey: "enso_outlook" }];

function chatGptAnswer(items) {
  return JSON.stringify({ items });
}

const warmItems = [
  {
    signalKey: "global_surface_temperature",
    tone: "heat",
    titleEn: "Global air at a daily record",
    detailEn: "Global surface air reached 1.56 °C above 1850–1900, the warmest on record for Oct. 4.",
    titleHu: "Napi rekordon a globális levegő",
    detailHu: "A globális felszíni levegő 2026. okt. 4-én 1,56 °C-kal volt az 1850–1900-as szint felett, ez napi rekord.",
  },
  {
    signalKey: "antarctic_sea_ice_extent",
    tone: "ice",
    titleEn: "Antarctic sea ice near record low",
    detailEn: "Antarctic sea ice covered 17.1 million km², the second lowest for the date.",
    titleHu: "Rekordközeli antarktiszi jéghiány",
    detailHu: "Az antarktiszi tengeri jég kiterjedése 17,1 millió km², a dátumhoz képest a második legalacsonyabb.",
  },
  {
    signalKey: "enso_outlook",
    tone: "ocean",
    titleEn: "El Niño odds rising",
    detailEn: "The IRI outlook gives El Niño a 62% chance over the next six months.",
    titleHu: "Nő az El Niño esélye",
    detailHu: "Az IRI előrejelzése szerint 62% az El Niño esélye a következő hat hónapban.",
  },
];

test("sentence counter ignores Hungarian dates, decimals and lower-case abbreviations", () => {
  assert.equal(sentenceCount("A globális levegő 2026. okt. 4-én 1,56 °C-kal volt melegebb."), 1);
  assert.equal(sentenceCount("Global air was 1.56 °C above 1850–1900 on Oct. 4."), 1);
  assert.equal(sentenceCount("- First sentence.\n- Második mondat.\n- Third one!"), 3);
  assert.equal(sentenceCount("Két mondat. Ez a második."), 2);
});

test("a realistic ChatGPT answer with flagged temperatures passes validation", () => {
  const parsed = parseAiSummaryJson(chatGptAnswer(warmItems));
  assert.ok(parsed, "answer should parse");
  const result = validateOpenAiSummaryText(parsed, warmChecks, anomalySignals, contextSignals);
  assert.deepEqual(result.ok ? "ok" : result.reason, "ok");
  assert.equal(result.summary.items.length, 3);
});

test("rejections explain which check failed", () => {
  const withoutTemperature = warmItems.map((item, index) =>
    index === 0 ? { ...item, signalKey: "atmospheric_co2", tone: "signal" } : item
  );
  const result = validateOpenAiSummaryText(
    parseAiSummaryJson(chatGptAnswer(withoutTemperature)),
    warmChecks,
    anomalySignals,
    contextSignals
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /flagged temperature/);

  const unknownKey = warmItems.map((item, index) => (index === 2 ? { ...item, signalKey: "made_up_signal" } : item));
  const unknownResult = validateOpenAiSummaryText(
    parseAiSummaryJson(chatGptAnswer(unknownKey)),
    warmChecks,
    anomalySignals,
    contextSignals
  );
  assert.equal(unknownResult.ok, false);
  assert.match(unknownResult.reason, /made_up_signal/);
});

test("normal temperatures must be stated as not unusually high", () => {
  const normalItems = [
    {
      ...warmItems[0],
      titleEn: "Global temperatures steady",
      detailEn: "Global air and sea-surface temperatures are not unusually high versus same-date records.",
      titleHu: "Nincs hőmérsékleti rekord",
      detailHu: "A globális levegő és tengerfelszín hőmérséklete nem kiugróan magas, nincs közel a rekordhoz.",
    },
    warmItems[1],
    warmItems[2],
  ];
  const parsed = parseAiSummaryJson(chatGptAnswer(normalItems));
  assert.equal(validateOpenAiSummaryText(parsed, normalChecks, anomalySignals, contextSignals).ok, true);

  const missingStatus = parseAiSummaryJson(chatGptAnswer([warmItems[1], warmItems[2], { ...warmItems[0], signalKey: "atmospheric_co2" }]));
  const result = validateOpenAiSummaryText(missingStatus, normalChecks, anomalySignals, contextSignals);
  assert.equal(result.ok, false);
  assert.match(result.reason, /not unusually high/);
});
