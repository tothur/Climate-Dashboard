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
  deterministicNoiseAmplitude: number
): DailyPoint[] {
  const startDate = new Date(`${startDateIso}T00:00:00Z`);
  const endDate = new Date(`${endDateIso}T00:00:00Z`);
  const distance = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(distance) || distance < 0) return [];
  const days = Math.floor(distance / DAY_MS) + 1;
  const points: DailyPoint[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(startDate.getTime() + index * DAY_MS);

    const seasonal = seasonalAmplitude * Math.sin((2 * Math.PI * index) / seasonalPeriodDays);
    const noise = deterministicNoiseAmplitude * Math.sin(index * 0.143) * Math.cos(index * 0.071);
    const value = base + trendPerDay * index + seasonal + noise;

    points.push({
      date: formatIsoDate(date),
      value: Math.round(value * 1000) / 1000,
    });
  }
  return points;
}

function buildBundledSeries(today = new Date()): ClimateSeriesBundle {
  const safeDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const endDateIso = formatIsoDate(safeDate);

  return {
    // Multi-decade fallback windows so year selection remains useful when live feeds fail.
    global_surface_temperature: generateSeries("1979-01-01", endDateIso, 14.35, 0.0013, 2.95, 365.25, 0.12),
    global_sea_surface_temperature: generateSeries("1982-01-01", endDateIso, 20.72, 0.00045, 0.41, 365.25, 0.04),
    global_sea_ice_extent: generateSeries("1979-01-01", endDateIso, 23.2, -0.0007, 4.8, 365.25, 0.18),
    atmospheric_co2: generateSeries("1958-03-29", endDateIso, 315.7, 0.0078, 6.1, 365.25, 0.32),
  };
}

export function createBundledClimateSeries(today?: Date): ClimateSeriesBundle {
  return buildBundledSeries(today);
}

export const CLIMATE_METRIC_KEYS: ClimateMetricKey[] = [
  "global_surface_temperature",
  "global_sea_surface_temperature",
  "global_sea_ice_extent",
  "atmospheric_co2",
];
