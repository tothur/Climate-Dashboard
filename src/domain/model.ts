export type Language = "en" | "hu";
export type ThemeMode = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export type ClimateMetricKey =
  | "global_surface_temperature"
  | "global_sea_surface_temperature"
  | "global_mean_sea_level"
  | "ocean_heat_content"
  | "earth_energy_imbalance"
  | "incoming_solar_energy"
  | "global_glacier_mass_balance"
  | "mountain_glacier_mass_balance"
  | "antarctic_ice_sheet_mass_balance"
  | "west_antarctic_ice_sheet_mass_balance"
  | "greenland_ice_sheet_mass_balance"
  | "northern_hemisphere_surface_temperature"
  | "southern_hemisphere_surface_temperature"
  | "arctic_surface_temperature"
  | "antarctic_surface_temperature"
  | "north_atlantic_sea_surface_temperature"
  | "global_surface_temperature_anomaly"
  | "global_sea_surface_temperature_anomaly"
  | "northern_hemisphere_surface_temperature_anomaly"
  | "southern_hemisphere_surface_temperature_anomaly"
  | "arctic_surface_temperature_anomaly"
  | "antarctic_surface_temperature_anomaly"
  | "north_atlantic_sea_surface_temperature_anomaly"
  | "daily_global_mean_temperature_anomaly"
  | "global_sea_ice_extent"
  | "arctic_sea_ice_extent"
  | "antarctic_sea_ice_extent"
  | "northern_hemisphere_snow_cover_extent"
  | "atmospheric_co2"
  | "atmospheric_ch4"
  | "atmospheric_n2o"
  | "atmospheric_aggi"
  | "nino34_index"
  | "nao_index"
  | "pna_index"
  | "soi_index"
  | "arctic_oscillation_index";

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

export type EnsoCondition = "la_nina" | "neutral" | "el_nino";

export interface EnsoOutlookWindow {
  condition: EnsoCondition;
  probability: number | null;
  targetLabel: string | null;
}

export interface EnsoOutlook {
  issuedDate: string | null;
  alertStatus: string | null;
  synopsis: string | null;
  sourceLabel: string;
  sourceUrl: string;
  nextThreeMonths: EnsoOutlookWindow | null;
  nextSixMonths: EnsoOutlookWindow | null;
}

export type AiSummaryTone = "critical" | "watch" | "normal";

export interface AiSummaryTemperatureCheck {
  key: "global_surface_temperature" | "global_sea_surface_temperature";
  tone: AiSummaryTone;
}

export interface AiSummaryItem {
  signalKey: string;
  tone: "heat" | "ice" | "ocean" | "signal";
  titleEn: string;
  detailEn: string;
  titleHu: string;
  detailHu: string;
}

export interface AiSummary {
  textEn: string;
  textHu?: string | null;
  items?: AiSummaryItem[];
  generatedAtIso: string;
  model: string;
  source: "openai" | "local";
  fingerprint: string;
  temperatureChecks: AiSummaryTemperatureCheck[];
}

export type ClimateMapKey =
  | "global_2m_temperature"
  | "global_2m_temperature_anomaly"
  | "global_sst"
  | "global_sst_anomaly";

export interface ClimateMapAsset {
  path: string;
  sourceUrl: string | null;
  sourcePage: string | null;
  date: string | null;
}

export type ClimateMapAssets = Partial<Record<ClimateMapKey, ClimateMapAsset>>;

export interface DashboardDataSource {
  sourceMode: DashboardSourceMode;
  series: ClimateSeriesBundle;
  warnings: string[];
  updatedAtIso: string;
  ensoOutlook?: EnsoOutlook | null;
  aiSummary?: AiSummary | null;
  maps?: ClimateMapAssets;
  mapWarnings?: string[];
}

export interface DashboardSnapshot {
  indicators: ClimateMetricSeries[];
  forcing: ClimateMetricSeries[];
  sourceMode: DashboardSourceMode;
  warnings: string[];
  updatedAtIso: string;
}
