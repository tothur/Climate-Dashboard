const DAY_MS = 86_400_000;

function toFiniteNumber(value) {
  if (value == null || (typeof value === "string" && value.trim().length === 0)) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateFromParts(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return formatIsoDate(date);
}

function dateFromYearAndDay(year, dayOfYear) {
  if (!Number.isFinite(year) || !Number.isFinite(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) return null;
  const date = new Date(Date.UTC(year, 0, 1) + (dayOfYear - 1) * DAY_MS);
  return date.getUTCFullYear() === year ? formatIsoDate(date) : null;
}

function normalizePoints(points) {
  const byDate = new Map();
  for (const point of points) {
    const date = String(point?.date ?? "").trim();
    const value = Number(point?.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue;
    byDate.set(date, value);
  }
  return Array.from(byDate.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, value]) => ({ date, value }));
}

function isMissingReanalyzerValue(value) {
  if (value == null) return true;
  if (typeof value === "string" && !value.trim()) return true;
  const numeric = Number(value);
  return !Number.isFinite(numeric) || numeric <= -900;
}

function reanalyzerRowValues(row) {
  if (Array.isArray(row.data)) return row.data;
  if (typeof row.data === "string") return row.data.split(",");
  return [];
}

function isReanalyzerPreliminaryRow(row) {
  return (
    typeof row === "object" &&
    row != null &&
    !Array.isArray(row) &&
    typeof row.name === "string" &&
    row.name.trim().toLowerCase() === "preliminary"
  );
}

function orderedReanalyzerObservationRows(payload) {
  return [
    ...payload.filter((row) => isReanalyzerPreliminaryRow(row)),
    ...payload.filter((row) => !isReanalyzerPreliminaryRow(row)),
  ];
}

function reanalyzerObservationYear(row, currentYear) {
  if (isReanalyzerPreliminaryRow(row)) return currentYear;
  const yearToken = typeof row.name === "number" || typeof row.name === "string" ? String(row.name).trim() : "";
  if (!/^\d{4}$/.test(yearToken)) return null;
  const year = Number(yearToken);
  return Number.isFinite(year) && year >= 1940 && year <= currentYear + 1 ? year : null;
}

export function parseReanalyzerDailyJson(payload, { currentYear = new Date().getUTCFullYear() } = {}) {
  if (!Array.isArray(payload)) return [];
  const points = [];

  for (const row of orderedReanalyzerObservationRows(payload)) {
    if (typeof row !== "object" || row == null || Array.isArray(row)) continue;
    const year = reanalyzerObservationYear(row, currentYear);
    if (year == null) continue;

    const values = reanalyzerRowValues(row);
    let effectiveLength = values.length;
    while (effectiveLength > 0 && isMissingReanalyzerValue(values[effectiveLength - 1])) effectiveLength -= 1;

    for (let index = 0; index < effectiveLength; index += 1) {
      if (isMissingReanalyzerValue(values[index])) continue;
      const numeric = toFiniteNumber(values[index]);
      const date = dateFromYearAndDay(year, index + 1);
      if (numeric != null && date) points.push({ date, value: numeric });
    }
  }
  return normalizePoints(points);
}

export function parseReanalyzerDailyAnomalyJson(
  payload,
  climatologyLabel = "1991-2020",
  { currentYear = new Date().getUTCFullYear() } = {}
) {
  if (!Array.isArray(payload)) return [];
  const baselineRow = payload.find(
    (row) =>
      typeof row === "object" &&
      row != null &&
      !Array.isArray(row) &&
      (typeof row.name === "string" || typeof row.name === "number") &&
      String(row.name).trim() === climatologyLabel
  );
  if (!baselineRow) return [];
  const baselineValues = reanalyzerRowValues(baselineRow).map(toFiniteNumber);
  if (!baselineValues.length) return [];
  const points = [];

  for (const row of orderedReanalyzerObservationRows(payload)) {
    if (typeof row !== "object" || row == null || Array.isArray(row)) continue;
    const year = reanalyzerObservationYear(row, currentYear);
    if (year == null) continue;

    for (const [index, value] of reanalyzerRowValues(row).entries()) {
      if (isMissingReanalyzerValue(value) || isMissingReanalyzerValue(baselineValues[index])) continue;
      const numeric = toFiniteNumber(value);
      const baseline = baselineValues[index];
      const date = dateFromYearAndDay(year, index + 1);
      if (numeric == null || baseline == null || date == null) continue;
      points.push({ date, value: Math.round((numeric - baseline) * 1000) / 1000 });
    }
  }
  return normalizePoints(points);
}

export function parseNsidcDailyExtentCsv(rawCsv) {
  const points = [];
  for (const rawLine of String(rawCsv ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const columns = line.split(",").map((column) => column.replace(/"/g, "").trim());
    if (columns.length < 4) continue;
    const date = formatDateFromParts(Number(columns[0]), Number(columns[1]), Number(columns[2]));
    const extent = [columns[3], columns[4], columns[5]]
      .map(toFiniteNumber)
      .find((value) => value != null && value > 0 && value < 100);
    if (date && extent != null) points.push({ date, value: extent });
  }
  return normalizePoints(points);
}

export function parseNoaaCo2DailyCsv(rawCsv) {
  const points = [];
  for (const rawLine of String(rawCsv ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const columns = line.split(",").map((column) => column.trim());
    if (columns.length < 5) continue;
    const date = formatDateFromParts(Number(columns[0]), Number(columns[1]), Number(columns[2]));
    const value = [columns[4], columns[5], columns[6]]
      .map(toFiniteNumber)
      .find((candidate) => candidate != null && candidate > 0 && candidate < 1000);
    if (date && value != null) points.push({ date, value });
  }
  return normalizePoints(points);
}

export function parseNoaaMonthlyGreenhouseGasCsv(rawCsv, { minValue, maxValue }) {
  const points = [];
  for (const rawLine of String(rawCsv ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const columns = line.split(",").map((column) => column.trim());
    if (columns.length < 6) continue;
    const date = formatDateFromParts(Number(columns[0]), Number(columns[1]), 1);
    const value = [columns[3], columns[5]]
      .map(toFiniteNumber)
      .find((candidate) => candidate != null && candidate > minValue && candidate < maxValue);
    if (date && value != null) points.push({ date, value });
  }
  return normalizePoints(points);
}

export function parseNoaaCh4MonthlyCsv(rawCsv) {
  return parseNoaaMonthlyGreenhouseGasCsv(rawCsv, { minValue: 500, maxValue: 5000 });
}

export function parseNoaaN2oMonthlyCsv(rawCsv) {
  return parseNoaaMonthlyGreenhouseGasCsv(rawCsv, { minValue: 200, maxValue: 500 });
}

export function parseNoaaCpcMonthlyIndexTable(rawText) {
  const points = [];
  for (const rawLine of String(rawText ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^jan\b/i.test(line)) continue;
    const columns = line.split(/\s+/);
    const year = Number(columns[0]);
    if (columns.length < 2 || !Number.isFinite(year) || year < 1800 || year > 2200) continue;
    const availableMonths = Math.min(12, columns.length - 1);
    for (let month = 1; month <= availableMonths; month += 1) {
      const value = toFiniteNumber(columns[month]);
      const date = formatDateFromParts(year, month, 1);
      if (value != null && value > -90 && date) points.push({ date, value });
    }
  }
  return normalizePoints(points);
}

export function parseNoaaPslMonthlyIndexData(rawText) {
  const lines = String(rawText ?? "").split(/\r?\n/);
  return parseNoaaCpcMonthlyIndexTable(lines.slice(1).join("\n"));
}
