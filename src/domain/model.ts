export type Language = "en" | "hu";
export type ThemeMode = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export type ClimateMetricKey =
  | "global_surface_temperature"
  | "global_sea_surface_temperature"
  | "global_sea_ice_extent"
  | "atmospheric_co2";

export interface DailyPoint {
  date: string;
  value: number;
}

export interface ClimateMetricSource {
  shortName: string;
  descriptionEn: string;
  descriptionHu: string;
  url: string;
}

export interface ClimateMetricSeries {
  key: ClimateMetricKey;
  titleEn: string;
  titleHu: string;
  unit: string;
  decimals: number;
  points: DailyPoint[];
  latestDate: string | null;
  latestValue: number | null;
  source: ClimateMetricSource;
}

export type DashboardSourceMode = "live" | "mixed" | "bundled";

export type ClimateSeriesBundle = Record<ClimateMetricKey, DailyPoint[]>;

export interface DashboardDataSource {
  sourceMode: DashboardSourceMode;
  series: ClimateSeriesBundle;
  warnings: string[];
  updatedAtIso: string;
}

export interface DashboardSnapshot {
  indicators: ClimateMetricSeries[];
  forcing: ClimateMetricSeries[];
  sourceMode: DashboardSourceMode;
  warnings: string[];
  updatedAtIso: string;
}
