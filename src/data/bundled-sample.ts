import type { ClimateSeriesBundle, DailyPoint, ClimateMetricKey } from "../domain/model";

const DAY_MS = 86_400_000;

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generateSeries(
  startDateIso: string,
  endDateIso: string,
  base: number,
  trendPerDay: number,
  seasonalAmplitude: number,
  seasonalPeriodDays: number,
  deterministicNoiseAmplitude: number,
  phaseShiftDays = 0
): DailyPoint[] {
  const startDate = new Date(`${startDateIso}T00:00:00Z`);
  const endDate = new Date(`${endDateIso}T00:00:00Z`);
  const distance = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(distance) || distance < 0) return [];
  const days = Math.floor(distance / DAY_MS) + 1;
  const points: DailyPoint[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(startDate.getTime() + index * DAY_MS);

    const seasonal = seasonalAmplitude * Math.sin((2 * Math.PI * (index + phaseShiftDays)) / seasonalPeriodDays);
    const noise = deterministicNoiseAmplitude * Math.sin(index * 0.143) * Math.cos(index * 0.071);
    const value = base + trendPerDay * index + seasonal + noise;

    points.push({
      date: formatIsoDate(date),
      value: Math.round(value * 1000) / 1000,
    });
  }
  return points;
}

function dayOfYearFromIso(dateIso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const start = Date.UTC(year, 0, 1);
  return Math.floor((date.getTime() - start) / DAY_MS) + 1;
}

function climatologyByDayOfYear(points: DailyPoint[], baselineStartYear: number, baselineEndYear: number): Map<number, number> {
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const point of points) {
    const year = Number(point.date.slice(0, 4));
    if (!Number.isFinite(year) || year < baselineStartYear || year > baselineEndYear) continue;
    const doy = dayOfYearFromIso(point.date);
    if (doy == null) continue;
    const value = Number(point.value);
    if (!Number.isFinite(value)) continue;
    const bucket = buckets.get(doy) ?? { sum: 0, count: 0 };
    bucket.sum += value;
    bucket.count += 1;
    buckets.set(doy, bucket);
  }

  const climatology = new Map<number, number>();
  for (const [doy, bucket] of buckets.entries()) {
    if (bucket.count > 0) climatology.set(doy, bucket.sum / bucket.count);
  }
  return climatology;
}

function deriveAnomalySeries(points: DailyPoint[], climatology: Map<number, number>): DailyPoint[] {
  const anomalies: DailyPoint[] = [];

  for (const point of points) {
    const doy = dayOfYearFromIso(point.date);
    if (doy == null) continue;
    const baseline = climatology.get(doy);
    const value = Number(point.value);
    if (!Number.isFinite(value) || baseline == null || !Number.isFinite(baseline)) continue;
    anomalies.push({
      date: point.date,
      value: Math.round((value - baseline) * 1000) / 1000,
    });
  }

  return anomalies;
}

function mergeSeriesByDate(left: DailyPoint[], right: DailyPoint[]): DailyPoint[] {
  const leftMap = new Map(left.map((point) => [point.date, point.value]));
  const rightMap = new Map(right.map((point) => [point.date, point.value]));
  const dates = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()])).sort();
  const merged: DailyPoint[] = [];

  for (const date of dates) {
    const leftValue = leftMap.get(date);
    const rightValue = rightMap.get(date);
    if (leftValue == null || rightValue == null) continue;
    merged.push({
      date,
      value: Math.round((leftValue + rightValue) * 1000) / 1000,
    });
  }

  return merged;
}

function buildBundledSeries(today = new Date()): ClimateSeriesBundle {
  const safeDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const endDateIso = formatIsoDate(safeDate);
  const globalSurfaceTemperature = generateSeries("1979-01-01", endDateIso, 14.35, 0.0013, 2.95, 365.25, 0.12);
  const globalSeaSurfaceTemperature = generateSeries("1982-01-01", endDateIso, 20.72, 0.00045, 0.41, 365.25, 0.04);
  const globalSurfaceTempClimatology = climatologyByDayOfYear(globalSurfaceTemperature, 1991, 2020);
  const globalSeaSurfaceTempClimatology = climatologyByDayOfYear(globalSeaSurfaceTemperature, 1991, 2020);
  const globalSurfaceTemperatureAnomaly = deriveAnomalySeries(globalSurfaceTemperature, globalSurfaceTempClimatology);
  const globalSeaSurfaceTemperatureAnomaly = deriveAnomalySeries(globalSeaSurfaceTemperature, globalSeaSurfaceTempClimatology);
  const arcticSeaIce = generateSeries("1979-01-01", endDateIso, 12.8, -0.0004, 3.9, 365.25, 0.12, 0);
  const antarcticSeaIce = generateSeries("1979-01-01", endDateIso, 10.4, -0.0003, 4.3, 365.25, 0.14, 182.625);
  const globalSeaIce = mergeSeriesByDate(arcticSeaIce, antarcticSeaIce);

  return {
    // Multi-decade fallback windows so year selection remains useful when live feeds fail.
    global_surface_temperature: globalSurfaceTemperature,
    global_sea_surface_temperature: globalSeaSurfaceTemperature,
    global_surface_temperature_anomaly: globalSurfaceTemperatureAnomaly,
    global_sea_surface_temperature_anomaly: globalSeaSurfaceTemperatureAnomaly,
    global_sea_ice_extent: globalSeaIce,
    arctic_sea_ice_extent: arcticSeaIce,
    antarctic_sea_ice_extent: antarcticSeaIce,
    atmospheric_co2: generateSeries("1958-03-29", endDateIso, 315.7, 0.0078, 6.1, 365.25, 0.32),
  };
}

export function createBundledClimateSeries(today?: Date): ClimateSeriesBundle {
  return buildBundledSeries(today);
}

export const CLIMATE_METRIC_KEYS: ClimateMetricKey[] = [
  "global_surface_temperature",
  "global_sea_surface_temperature",
  "global_surface_temperature_anomaly",
  "global_sea_surface_temperature_anomaly",
  "global_sea_ice_extent",
  "arctic_sea_ice_extent",
  "antarctic_sea_ice_extent",
  "atmospheric_co2",
];
