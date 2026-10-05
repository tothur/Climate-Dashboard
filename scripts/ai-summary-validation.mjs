// Parsing and validation of the OpenAI daily climate summary, kept separate from the update script so it can be
// unit-tested without running a data update.

export const AI_SUMMARY_DISALLOWED_TEXT_PATTERN = /\brecord\s+lows?\b|\brecord\s+cold\b|\bcoldest\b|\bcooling\b/i;
export const AI_SUMMARY_STALE_TEXT_PATTERN = /\bhistorical rank\b/i;
export const AI_SUMMARY_BACKGROUND_SIGNAL_KEYS = new Set([
  "global_mean_sea_level",
  "ocean_heat_content",
  "earth_energy_imbalance",
  "atmospheric_co2",
  "atmospheric_ch4",
  "atmospheric_n2o",
  "atmospheric_aggi",
]);

// A sentence ends at ., ! or ? followed by the end of the text or by whitespace and a capital letter (or opening
// quote/parenthesis). Periods inside numbers and dates ("1.56 °C", "2026. okt. 4-én") and lower-case abbreviations
// therefore do not count as sentence breaks.
const SENTENCE_END_PATTERN = /[.!?]+(?=\s*$|\s+["„(]?[A-ZÁÉÍÓÖŐÚÜŰ])/g;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDailyRecordLeadSignal(signal) {
  if (!signal || AI_SUMMARY_BACKGROUND_SIGNAL_KEYS.has(signal.key)) return false;
  if (signal.category === "sea ice") return true;
  return signal.basis === "same-date historical rank";
}

export function stripBulletMarkers(text) {
  return String(text ?? "")
    .replace(/^\s*[-*]\s+/gm, "")
    .trim();
}

function lineSentenceCount(line) {
  const sentenceEnds = line.match(SENTENCE_END_PATTERN)?.length ?? 0;
  // A line without closing punctuation still holds one (unterminated) sentence.
  return /[.!?]\s*$/.test(line) ? sentenceEnds : sentenceEnds + 1;
}

// Each bullet line is counted on its own, so a line that starts with a number or lacks a final period is still
// a separate sentence.
export function sentenceCount(text) {
  return stripBulletMarkers(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((count, line) => count + lineSentenceCount(line), 0);
}

// The model sometimes leaves English unit words in Hungarian text.
export function localizeHungarianUnits(text) {
  return text.replace(/\bmillion(?=\s*km)/g, "millió").replace(/\bbillion(?=\s*(?:t|tonna)\b)/g, "milliárd");
}

export function parseAiSummaryJson(rawText) {
  const trimmed = String(rawText ?? "").trim();
  const jsonText = trimmed.startsWith("{") ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    if (!isRecord(parsed) || !Array.isArray(parsed.items) || parsed.items.length !== 3) return null;
    const items = parsed.items.map((entry) => {
      if (!isRecord(entry)) return null;
      const signalKey = typeof entry.signalKey === "string" ? entry.signalKey.trim() : "";
      const tone = ["heat", "ice", "ocean", "signal"].includes(entry.tone) ? entry.tone : null;
      const titleEn = typeof entry.titleEn === "string" ? entry.titleEn.trim() : "";
      const detailEn = typeof entry.detailEn === "string" ? entry.detailEn.trim() : "";
      const titleHu = typeof entry.titleHu === "string" ? entry.titleHu.trim() : "";
      const detailHu = typeof entry.detailHu === "string" ? entry.detailHu.trim() : "";
      if (
        !signalKey ||
        !tone ||
        titleEn.length < 4 ||
        titleEn.length > 52 ||
        detailEn.length < 12 ||
        detailEn.length > 120 ||
        titleHu.length < 4 ||
        titleHu.length > 60 ||
        detailHu.length < 12 ||
        detailHu.length > 140
      ) {
        return null;
      }
      return { signalKey, tone, titleEn, detailEn, titleHu: localizeHungarianUnits(titleHu), detailHu: localizeHungarianUnits(detailHu) };
    });
    if (items.some((item) => item == null)) return null;
    const textEn = items.map((item) => `- ${item.detailEn}`).join("\n");
    const textHu = items.map((item) => `- ${item.detailHu}`).join("\n");
    return { items, textEn, textHu };
  } catch {
    return null;
  }
}

/**
 * Checks an OpenAI (or cached) summary against the day's facts.
 * Returns `{ ok: true, summary }` or `{ ok: false, reason }`, where `reason` names the failed check for the logs.
 */
export function validateOpenAiSummaryText(openAiSummary, temperatureChecks, anomalySignals = [], contextSignals = []) {
  const reject = (reason) => ({ ok: false, reason });
  const items = Array.isArray(openAiSummary?.items) ? openAiSummary.items : [];
  const textEn = typeof openAiSummary?.textEn === "string" ? openAiSummary.textEn.trim() : "";
  const textHu = typeof openAiSummary?.textHu === "string" ? openAiSummary.textHu.trim() : "";
  const normalizedTextEn = stripBulletMarkers(textEn);

  if (items.length !== 3) return reject(`expected 3 items, got ${items.length}`);
  if (new Set(items.map((item) => item.signalKey)).size !== 3) return reject("signal keys are not distinct");
  if (!textEn || !textHu) return reject("missing English or Hungarian text");
  if (textEn.length > 430) return reject(`English text too long (${textEn.length} > 430)`);
  if (textHu.length > 500) return reject(`Hungarian text too long (${textHu.length} > 500)`);
  if (sentenceCount(textEn) !== 3) return reject(`English text has ${sentenceCount(textEn)} sentences, expected 3`);
  if (sentenceCount(textHu) !== 3) return reject(`Hungarian text has ${sentenceCount(textHu)} sentences, expected 3`);
  if (AI_SUMMARY_DISALLOWED_TEXT_PATTERN.test(textEn)) return reject("English text describes record lows or cooling");
  if (AI_SUMMARY_STALE_TEXT_PATTERN.test(textEn)) return reject("English text uses stale 'historical rank' wording");

  const allowedSignalKeys = new Set([
    ...temperatureChecks.map((check) => check.key),
    ...anomalySignals.map((signal) => signal.key),
    ...contextSignals.map((signal) => signal.signalKey),
  ]);
  const unknownItem = items.find((item) => !allowedSignalKeys.has(item.signalKey));
  if (unknownItem) return reject(`unknown signal key "${unknownItem.signalKey}"`);

  for (const item of items) {
    if (sentenceCount(item.detailEn) !== 1) return reject(`English detail for ${item.signalKey} is not one sentence`);
    if (sentenceCount(item.detailHu) !== 1) return reject(`Hungarian detail for ${item.signalKey} is not one sentence`);
    if (!/(\d|record|near|highest|lowest|above|below)/i.test(item.detailEn)) {
      return reject(`English detail for ${item.signalKey} states no value or record status`);
    }
    if (!/(\d|rekord|közel|legmagasabb|legalacsonyabb|felett|alatt)/i.test(item.detailHu)) {
      return reject(`Hungarian detail for ${item.signalKey} states no value or record status`);
    }
  }

  const hasTemperatureWarning = temperatureChecks.some((check) => check.tone !== "normal");
  if (hasTemperatureWarning) {
    // The flagged temperature series must be one of the three items; its wording is the model's own.
    const warningKeys = new Set(temperatureChecks.filter((check) => check.tone !== "normal").map((check) => check.key));
    if (!items.some((item) => warningKeys.has(item.signalKey))) return reject("no item covers the flagged temperature check");
  } else if (!/not unusually high/i.test(normalizedTextEn)) {
    return reject("text does not state that temperatures are not unusually high");
  }

  const dailyRecordSignals = anomalySignals.filter(isDailyRecordLeadSignal);
  if (dailyRecordSignals.length) {
    const requiredSignalKeys = new Set(dailyRecordSignals.slice(0, 3).map((signal) => signal.key));
    if (!items.some((item) => requiredSignalKeys.has(item.signalKey))) return reject("no item covers a top daily record signal");
  }

  return { ok: true, summary: { items, textEn, textHu } };
}
