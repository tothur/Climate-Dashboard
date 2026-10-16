import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { EChartsOption } from "echarts";
import { buildDashboardSnapshot, createBundledDataSource } from "../data/adapter";
import type {
  ClimateMapKey,
  AiSummary,
  DashboardDataSource,
  EnsoCondition,
  EnsoOutlook,
  EnsoOutlookWindow,
  Language,
  ResolvedTheme,
  ThemeMode,
  ClimateMetricSeries,
  DailyPoint,
} from "../domain/model";
import { loadRuntimeDataSource } from "../data/runtime-source";
import { buildClimateMonthlyComparisonOption, buildClimateTrendOption } from "../charts/iliTrend";
import { EChartsPanel } from "../components/EChartsPanel";
import { ClimateMapImage } from "../components/ClimateMapImage";
import { MapPanel } from "../components/MapPanel";
import { SignalIcon, signalTopic, type SignalTopic } from "../components/SignalIcon";
import { Sparkline, type SparklineReadout } from "../components/Sparkline";
import { DailyContextPanel } from "../components/DailyContextPanel";
import { TrendContextPanel, type TrendContextVariant } from "../components/TrendContextPanel";
import { PathwaysPanel } from "../components/PathwaysPanel";
import { TippingLadderPanel, type TippingLadderItem } from "../components/TippingLadderPanel";
import { buildPathwaysData } from "../charts/pathways";
import {
  IndicatorLocator,
  IndicatorRail,
  useIndicatorJump,
  useIndicatorScrollSpy,
  type IndicatorNavTopic,
} from "../components/IndicatorNavigator";
import { buildTrendContextData, meanBetweenYears, trailingMeanByDays, type TrendContextData } from "../charts/trendContext";
import { domainColor, domainColorAlpha, type ChartDomain } from "../theme/domainColors";
import { buildDailyContextData, type DailyContextData } from "../charts/dailyContext";

const STORAGE_LANG_KEY = "climate-dashboard-lang";
const STORAGE_THEME_KEY = "climate-dashboard-theme";
const DAY_MS = 86_400_000;
const PROJECTION_ANALOG_POOL_SIZE = 12;
const PROJECTION_MAX_ANALOGS = 8;
const PROJECTION_YTD_SIGMA = 0.16;
const PROJECTION_RECENCY_SCALE_YEARS = 6;
const LONG_RANGE_SCENARIO_START_YEAR = 2025;
const LONG_RANGE_SCENARIO_END_YEAR = 2100;
const PROJECTION_DELTA_SCALE = 0.18;
const REFERENCE_LEAP_YEAR = 2024;
const REFERENCE_LEAP_YEAR_START_UTC = Date.UTC(REFERENCE_LEAP_YEAR, 0, 1);
const CLIMATOLOGY_BASELINE_START_YEAR = 1991;
const CLIMATOLOGY_BASELINE_END_YEAR = 2020;
const EARTH_LOGO_URL = `${import.meta.env.BASE_URL}earthicon.png`;
const LOCAL_MAP_ASSET_BASE_URL = `${import.meta.env.BASE_URL}data/maps`;
const LOCAL_MAP_FILENAMES: Record<ClimateMapKey, string> = {
  global_2m_temperature: "global-2m-temperature.png",
  global_2m_temperature_anomaly: "global-2m-temperature-anomaly.png",
  global_sst: "global-sst.png",
  global_sst_anomaly: "global-sst-anomaly.png",
};
const CURRENT_MAP_REMOTE_URLS: Record<ClimateMapKey, string> = {
  global_2m_temperature: "https://climatereanalyzer.org/wx/todays-weather/maps/gfs_world-wt_t2_d1.png",
  global_2m_temperature_anomaly: "https://climatereanalyzer.org/wx/todays-weather/maps/gfs_world-wt_t2anom_d1.png",
  global_sst: "https://climatereanalyzer.org/wx/todays-weather/maps/gfs_world-wt_sst_d1.png",
  global_sst_anomaly: "https://climatereanalyzer.org/wx/todays-weather/maps/gfs_world-wt_sstanom_d1.png",
};

interface LongRangeScenarioDefinition {
  key: "high" | "medium" | "mediumLow" | "low";
  labelEn: string;
  labelHu: string;
  shortLabel: string;
  anchors: Array<[number, number]>;
  colorLight: string;
  colorDark: string;
}

type OverviewMapMode = "temperature" | "anomaly" | "sst" | "sst-anomaly";

interface TippingPointDefinition {
  key: string;
  labelEn: string;
  labelHu: string;
  categoryEn: string;
  categoryHu: string;
  centralThreshold: number;
  minThreshold: number;
  maxThreshold: number;
}

const CMIP7_SCENARIOMIP_TEMPERATURE_SOURCE_URL = "https://gmd.copernicus.org/articles/19/2627/2026/";
const MCKAY_TIPPING_POINTS_SOURCE_URL = "https://www.science.org/doi/10.1126/science.abn7950";
const CMIP7_SCENARIOMIP_SCENARIOS: LongRangeScenarioDefinition[] = [
  {
    key: "high",
    labelEn: "High",
    labelHu: "Magas",
    shortLabel: "H",
    anchors: [
      [2025, 1.55],
      [2030, 1.65],
      [2040, 1.95],
      [2050, 2.25],
      [2060, 2.55],
      [2070, 2.85],
      [2080, 3.1],
      [2090, 3.3],
      [2100, 3.5],
    ],
    colorLight: "#b8392d",
    colorDark: "#f28273",
  },
  {
    key: "medium",
    labelEn: "Medium",
    labelHu: "Közepes",
    shortLabel: "M",
    anchors: [
      [2025, 1.55],
      [2030, 1.62],
      [2040, 1.82],
      [2050, 2.05],
      [2060, 2.25],
      [2070, 2.43],
      [2080, 2.58],
      [2090, 2.68],
      [2100, 2.75],
    ],
    colorLight: "#d0764a",
    colorDark: "#f2a77f",
  },
  {
    key: "mediumLow",
    labelEn: "Medium-Low",
    labelHu: "Közepesen alacsony",
    shortLabel: "ML",
    anchors: [
      [2025, 1.55],
      [2030, 1.61],
      [2040, 1.78],
      [2050, 1.93],
      [2060, 2.02],
      [2070, 2.08],
      [2080, 2.12],
      [2090, 2.12],
      [2100, 2.1],
    ],
    colorLight: "#a8781f",
    colorDark: "#e9b75f",
  },
  {
    key: "low",
    labelEn: "Low",
    labelHu: "Alacsony",
    shortLabel: "L",
    anchors: [
      [2025, 1.55],
      [2030, 1.6],
      [2040, 1.72],
      [2050, 1.82],
      [2060, 1.86],
      [2070, 1.86],
      [2080, 1.83],
      [2090, 1.78],
      [2100, 1.74],
    ],
    colorLight: "#25827d",
    colorDark: "#89cfc2",
  },
];

const MCKAY_TIPPING_POINTS: TippingPointDefinition[] = [
  {
    key: "greenland-ice-sheet",
    labelEn: "Greenland Ice Sheet collapse",
    labelHu: "A grönlandi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 1.5,
    minThreshold: 0.8,
    maxThreshold: 3,
  },
  {
    key: "west-antarctic-ice-sheet",
    labelEn: "West Antarctic Ice Sheet collapse",
    labelHu: "A nyugat-antarktiszi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 3,
  },
  {
    key: "coral-reefs",
    labelEn: "Low-latitude coral reef die-off",
    labelHu: "A trópusi korallzátonyok pusztulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 2,
  },
  {
    key: "abrupt-permafrost-thaw",
    labelEn: "Boreal permafrost abrupt thaw",
    labelHu: "A boreális permafroszt hirtelen olvadása",
    categoryEn: "Permafrost",
    categoryHu: "Permafroszt",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 2.3,
  },
  {
    key: "barents-sea-ice",
    labelEn: "Barents Sea ice abrupt loss",
    labelHu: "A Barents-tenger jegének hirtelen eltűnése",
    categoryEn: "Sea ice",
    categoryHu: "Tengeri jég",
    centralThreshold: 1.6,
    minThreshold: 1.5,
    maxThreshold: 1.7,
  },
  {
    key: "labrador-irminger-convection",
    labelEn: "Labrador-Irminger Seas convection collapse",
    labelHu: "A Labrador- és Irminger-tengeri konvekció összeomlása",
    categoryEn: "Ocean circulation",
    categoryHu: "Óceáni cirkuláció",
    centralThreshold: 1.8,
    minThreshold: 1.1,
    maxThreshold: 3.8,
  },
  {
    key: "mountain-glaciers",
    labelEn: "Mountain glacier loss",
    labelHu: "A hegyi gleccserek eltűnése",
    categoryEn: "Glaciers",
    categoryHu: "Gleccserek",
    centralThreshold: 2,
    minThreshold: 1.5,
    maxThreshold: 3,
  },
  {
    key: "sahel-greening",
    labelEn: "Sahel and West African monsoon greening",
    labelHu: "A Száhel és a nyugat-afrikai monszunvidék kizöldülése",
    categoryEn: "Monsoon",
    categoryHu: "Monszun",
    centralThreshold: 2.8,
    minThreshold: 2,
    maxThreshold: 3.5,
  },
  {
    key: "east-antarctic-subglacial-basins",
    labelEn: "East Antarctic subglacial basins collapse",
    labelHu: "A kelet-antarktiszi szubglaciális medencék összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 3,
    minThreshold: 2,
    maxThreshold: 6,
  },
  {
    key: "amazon-rainforest",
    labelEn: "Amazon rainforest dieback",
    labelHu: "Az amazóniai esőerdő pusztulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 3.5,
    minThreshold: 2,
    maxThreshold: 6,
  },
  {
    key: "boreal-permafrost-collapse",
    labelEn: "Boreal permafrost collapse",
    labelHu: "A boreális permafroszt összeomlása",
    categoryEn: "Permafrost",
    categoryHu: "Permafroszt",
    centralThreshold: 4,
    minThreshold: 3,
    maxThreshold: 6,
  },
  {
    key: "amoc",
    labelEn: "Atlantic Meridional Overturning Circulation collapse",
    labelHu: "Az atlanti átfordító áramlás (AMOC) összeomlása",
    categoryEn: "Ocean circulation",
    categoryHu: "Óceáni cirkuláció",
    centralThreshold: 4,
    minThreshold: 1.4,
    maxThreshold: 8,
  },
  {
    key: "boreal-forest-south",
    labelEn: "Boreal forest southern dieback",
    labelHu: "A boreális erdők déli peremének pusztulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 4,
    minThreshold: 1.4,
    maxThreshold: 5,
  },
  {
    key: "boreal-forest-north",
    labelEn: "Boreal forest northern expansion",
    labelHu: "A boreális erdők északi terjeszkedése",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 4,
    minThreshold: 1.5,
    maxThreshold: 7.2,
  },
  {
    key: "arctic-winter-sea-ice",
    labelEn: "Arctic winter sea ice collapse",
    labelHu: "Az arktiszi téli tengeri jég eltűnése",
    categoryEn: "Sea ice",
    categoryHu: "Tengeri jég",
    centralThreshold: 6.3,
    minThreshold: 4.5,
    maxThreshold: 8.7,
  },
  {
    key: "east-antarctic-ice-sheet",
    labelEn: "East Antarctic Ice Sheet collapse",
    labelHu: "A kelet-antarktiszi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 7.5,
    minThreshold: 5,
    maxThreshold: 10,
  },
];
type DashboardView = "overview" | "climate-system" | "maps" | "projections" | "sources";
type IndicatorSubsectionKey =
  | "globalTemperatures"
  | "temperatureAnomalies"
  | "regionalTemperatures"
  | "regionalTemperatureAnomalies"
  | "oceans"
  | "earthEnergyImbalance"
  | "seaIce"
  | "snowCover"
  | "iceSheetsAndGlaciers"
  | "forcingGases"
  | "forcingCombined"
  | "enso"
  | "circulation";
type ToolkitIconName =
  | "alert"
  | "bars"
  | "calendar"
  | "cloud"
  | "close"
  | "contrast"
  | "download"
  | "globe"
  | "home"
  | "info"
  | "leaf"
  | "map"
  | "moon"
  | "more"
  | "ocean"
  | "reports"
  | "search"
  | "snow"
  | "sun"
  | "temperature"
  | "trend"
  | "up";

const DASHBOARD_VIEW_IDS = new Set<DashboardView>(["overview", "climate-system", "maps", "projections", "sources"]);
// Climate system topics; the active one is kept in the address as #climate-system/<topic>.
const CLIMATE_SYSTEM_TOPIC_KEYS = ["temperature", "regions", "oceans", "ice", "energy", "forcing", "enso", "circulation"] as const;
const DEFAULT_CLIMATE_SYSTEM_TOPIC = "temperature";
// Forcing and Variability used to be pages of their own; their links land on the matching topic.
const LEGACY_VIEW_TOPICS: Record<string, string> = { forcing: "forcing", variability: "enso" };
// The Climate system section used to be called Indicators; its old addresses keep their topic.
const LEGACY_CLIMATE_SYSTEM_VIEW = "indicators";
const SEA_ICE_KEYS = new Set(["global_sea_ice_extent", "arctic_sea_ice_extent", "antarctic_sea_ice_extent"]);
const SNOW_COVER_KEYS = new Set<ClimateMetricSeries["key"]>(["northern_hemisphere_snow_cover_extent"]);
const OCEAN_KEYS = new Set(["global_mean_sea_level", "ocean_heat_content"]);
const ICE_SHEET_AND_GLACIER_KEYS = new Set([
  "global_glacier_mass_balance",
  "mountain_glacier_mass_balance",
  "antarctic_ice_sheet_mass_balance",
  "west_antarctic_ice_sheet_mass_balance",
  "greenland_ice_sheet_mass_balance",
]);
const ICE_SHEET_LOSS_KEYS = new Set([
  "antarctic_ice_sheet_mass_balance",
  "west_antarctic_ice_sheet_mass_balance",
  "greenland_ice_sheet_mass_balance",
]);
const EARTH_ENERGY_IMBALANCE_KEY: ClimateMetricSeries["key"] = "earth_energy_imbalance";
const TEMPERATURE_ANOMALY_KEYS = new Set(["global_surface_temperature_anomaly", "global_sea_surface_temperature_anomaly"]);
const DAILY_GLOBAL_MEAN_ANOMALY_KEY: ClimateMetricSeries["key"] = "daily_global_mean_temperature_anomaly";
const NINO34_SST_ANOMALY_KEY: ClimateMetricSeries["key"] = "daily_nino34_sea_surface_temperature_anomaly";
const GLOBAL_TEMPERATURE_KEYS = new Set(["global_surface_temperature", "global_sea_surface_temperature"]);
const REGIONAL_TEMPERATURE_ANOMALY_KEYS = new Set([
  "northern_hemisphere_surface_temperature_anomaly",
  "southern_hemisphere_surface_temperature_anomaly",
  "arctic_surface_temperature_anomaly",
  "antarctic_surface_temperature_anomaly",
  "north_atlantic_sea_surface_temperature_anomaly",
]);
const VARIABILITY_INDEX_KEYS: ClimateMetricSeries["key"][] = [
  "nino34_index",
  "soi_index",
  "nao_index",
  "arctic_oscillation_index",
  "pna_index",
];
const ENSO_INDEX_KEYS = new Set<ClimateMetricSeries["key"]>(["nino34_index", "soi_index"]);
const VARIABILITY_INDEX_SHORT_NAMES: Partial<Record<ClimateMetricSeries["key"], string>> = {
  nino34_index: "ONI",
  soi_index: "SOI",
  nao_index: "NAO",
  arctic_oscillation_index: "AO",
  pna_index: "PNA",
};
const VARIABILITY_INDEX_KEY_SET = new Set<ClimateMetricSeries["key"]>(VARIABILITY_INDEX_KEYS);
const MONTHLY_COMPARISON_EXCLUDED_KEYS = new Set([...OCEAN_KEYS, EARTH_ENERGY_IMBALANCE_KEY, ...ICE_SHEET_AND_GLACIER_KEYS]);
const REGIONAL_TEMPERATURE_KEYS = new Set([
  "northern_hemisphere_surface_temperature",
  "southern_hemisphere_surface_temperature",
  "arctic_surface_temperature",
  "antarctic_surface_temperature",
  "north_atlantic_sea_surface_temperature",
  "daily_nino34_sea_surface_temperature",
]);
// Absolute daily series drawn as the current year against the normal range,
// recent years and daily records (see charts/dailyContext.ts). Sea ice and
// snow cover records are lows; temperature records are highs. Snow cover is
// monthly and handled by the same chart.
const DAILY_CONTEXT_ANOMALY_KEYS = new Set<string>([...TEMPERATURE_ANOMALY_KEYS, ...REGIONAL_TEMPERATURE_ANOMALY_KEYS, NINO34_SST_ANOMALY_KEY]);
const DAILY_CONTEXT_KEYS = new Set<string>([
  ...GLOBAL_TEMPERATURE_KEYS,
  ...REGIONAL_TEMPERATURE_KEYS,
  ...SEA_ICE_KEYS,
  ...SNOW_COVER_KEYS,
  ...DAILY_CONTEXT_ANOMALY_KEYS,
]);
// Pre-industrial (1750) greenhouse gas levels, IPCC AR6 WG1 (Table 2.1, rounded).
const PREINDUSTRIAL_LEVELS: Partial<Record<string, number>> = {
  atmospheric_co2: 278,
  atmospheric_ch4: 729,
  atmospheric_n2o: 270,
};
const SOLAR_CYCLE_DAYS = 11 * 365.25;
const VARIABILITY_START_YEAR = 1950;

// Niño 3.4 anomalies of ±0.5 °C mark El Niño and La Niña conditions.
const ENSO_ANOMALY_THRESHOLD = 0.5;
const NINO34_THRESHOLDS: Record<Language, Array<{ value: number; label: string }>> = {
  en: [
    { value: ENSO_ANOMALY_THRESHOLD, label: "El Niño +0.5" },
    { value: -ENSO_ANOMALY_THRESHOLD, label: "La Niña −0.5" },
  ],
  hu: [
    { value: ENSO_ANOMALY_THRESHOLD, label: "El Niño +0,5" },
    { value: -ENSO_ANOMALY_THRESHOLD, label: "La Niña −0,5" },
  ],
};

function ensoPhaseChip(value: number, language: Language): { text: string; alert?: boolean } {
  if (value >= ENSO_ANOMALY_THRESHOLD) {
    return { text: language === "hu" ? "Az El Niño-küszöb (+0,5 °C) felett" : "Above the El Niño threshold (+0.5 °C)", alert: true };
  }
  if (value <= -ENSO_ANOMALY_THRESHOLD) {
    return { text: language === "hu" ? "A La Niña-küszöb (−0,5 °C) alatt" : "Below the La Niña threshold (−0.5 °C)" };
  }
  return { text: language === "hu" ? "ENSO-semleges tartományban" : "Within the ENSO-neutral range" };
}
const LOW_RECORD_KEYS = new Set<string>([...SEA_ICE_KEYS, ...SNOW_COVER_KEYS]);
const DAILY_CONTEXT_PAST_YEARS = 3;
const REGIONAL_TEMPERATURE_ORDER: ClimateMetricSeries["key"][] = [
  "northern_hemisphere_surface_temperature",
  "southern_hemisphere_surface_temperature",
  "arctic_surface_temperature",
  "antarctic_surface_temperature",
  "north_atlantic_sea_surface_temperature",
  "daily_nino34_sea_surface_temperature",
];
const REGIONAL_TEMPERATURE_RANK = new Map(REGIONAL_TEMPERATURE_ORDER.map((key, index) => [key, index]));
const REGIONAL_TEMPERATURE_ANOMALY_ORDER: ClimateMetricSeries["key"][] = [
  "northern_hemisphere_surface_temperature_anomaly",
  "southern_hemisphere_surface_temperature_anomaly",
  "arctic_surface_temperature_anomaly",
  "antarctic_surface_temperature_anomaly",
  "north_atlantic_sea_surface_temperature_anomaly",
];
const REGIONAL_TEMPERATURE_ANOMALY_RANK = new Map(REGIONAL_TEMPERATURE_ANOMALY_ORDER.map((key, index) => [key, index]));
const OCEAN_ORDER: ClimateMetricSeries["key"][] = ["global_mean_sea_level", "ocean_heat_content"];
const OCEAN_RANK = new Map(OCEAN_ORDER.map((key, index) => [key, index]));
const ICE_SHEET_AND_GLACIER_ORDER: ClimateMetricSeries["key"][] = [
  "global_glacier_mass_balance",
  "mountain_glacier_mass_balance",
  "antarctic_ice_sheet_mass_balance",
  "west_antarctic_ice_sheet_mass_balance",
  "greenland_ice_sheet_mass_balance",
];
const ICE_SHEET_AND_GLACIER_RANK = new Map(ICE_SHEET_AND_GLACIER_ORDER.map((key, index) => [key, index]));
const ICE_SHEET_SEA_LEVEL_EQUIVALENTS = [
  {
    key: "eais",
    acronym: "EAIS",
    nameEn: "East Antarctic Ice Sheet",
    nameHu: "Kelet-antarktiszi jégtakaró",
    valueMeters: 52.2,
    source: "Fretwell et al. 2013 / BEDMAP2",
  },
  {
    key: "wais",
    acronym: "WAIS",
    nameEn: "West Antarctic Ice Sheet",
    nameHu: "Nyugat-antarktiszi jégtakaró",
    valueMeters: 5.3,
    source: "Fretwell et al. 2013 / BEDMAP2",
  },
  {
    key: "gris",
    acronym: "GrIS",
    nameEn: "Greenland Ice Sheet",
    nameHu: "Grönlandi jégtakaró",
    valueMeters: 7.4,
    source: "Morlighem et al. 2017 / BedMachine",
  },
];
const TOP_SUMMARY_ORDER: ClimateMetricSeries["key"][] = [
  "global_surface_temperature",
  "global_surface_temperature_anomaly",
  "global_sea_surface_temperature",
  "global_sea_surface_temperature_anomaly",
  "global_sea_ice_extent",
  "atmospheric_co2",
  "atmospheric_ch4",
];
const TOP_SUMMARY_RANK = new Map(TOP_SUMMARY_ORDER.map((key, index) => [key, index]));
const RECORD_WARNING_KEYS: ClimateMetricSeries["key"][] = [
  "global_surface_temperature_anomaly",
  "global_sea_surface_temperature_anomaly",
];

const STRINGS = {
  en: {
    appTitle: "Climate Dashboard",
    appSubtitle: "Global climate indicators and forcings",
    dashboardNavigationAria: "Dashboard navigation",
    brandSubtitle: "Global Climate Dashboard",
    dataUpdatedLabel: "Data updated",
    dataStatusLabel: "Data status",
    navOverview: "Overview",
    navIndicators: "Climate system",
    overviewTitle: "Global Climate Overview",
    overviewSubtitle: "Latest climate signals",
    overviewDailyGlobalTemperatureAnomalyTitle: "Daily Global Temperature Anomaly",
    overviewPreindustrialSubtitle: "vs. 1850-1900 average",
    overviewSurfaceAnomalyTitle: "Surface Temperature Anomaly",
    overviewSstAnomalyTitle: "Sea Surface Temperature Anomaly",
    overviewCo2Title: "CO₂ Concentration",
    overviewAtmosphericSubtitle: "Atmospheric",
    overviewArcticSeaIceTitle: "Arctic Sea Ice Extent",
    overviewClimatologySubtitle: "vs. 1991-2020 average",
    planetNowTitle: "Earth Now",
    heroSparklineLabel: "Past 365 days",
    heroRecordLabel: "All-time high",
    warmingStripesAria: "Annual global temperature anomalies since 1940, shown as warming stripes",
    navGroupMonitor: "Monitor",
    navGroupExplore: "Explore",
    navGroupSystem: "System",
    deltaSincePrevious: "since previous",
    recordReachedText: "reached",
    ensoTargetConnector: "for",
    viewAllForcing: "View all forcing",
    viewAllMaps: "View all maps",
    recentHighlightsTitle: "Recent Highlights",
    ensoOutlookTitle: "ENSO Outlook",
    ensoCardTitle: "El Niño & La Niña",
    warmingEstimateTitle: "Warming Estimate",
    ensoNextThreeMonths: "Next 3 months",
    ensoNextSixMonths: "Next 6 months",
    ensoStatusLabel: "Status",
    ensoConditionNeutral: "ENSO-neutral",
    ensoConditionLaNina: "La Niña",
    ensoConditionElNino: "El Niño",
    ensoAlertNeutral: "ENSO-neutral",
    ensoAlertLaNinaAdvisory: "La Niña Advisory",
    ensoAlertElNinoAdvisory: "El Niño Advisory",
    ensoAlertLaNinaWatch: "La Niña Watch",
    ensoAlertElNinoWatch: "El Niño Watch",
    ensoAlertFinalLaNina: "Final La Niña Advisory",
    ensoAlertFinalElNino: "Final El Niño Advisory",
    language: "Language",
    theme: "Theme",
    themeSystem: "System",
    themeDark: "Dark",
    themeLight: "Light",
    sectionExpand: "Expand",
    sectionCollapse: "Collapse",
    latestLabel: "Latest",
    latestAnnualLabel: "Latest annual value",
    latestSignalsAria: "Latest climate indicators",
    aiSummaryAria: "AI climate summary",
    aiSummaryTitle: "AI Summary",
    aiSummaryKicker: "AI-summary",
    aiGeneratedAria: "AI generated",
    aiSummaryLoading: "Loading latest AI summary",
    aiSummaryRecordHigh: "latest value is at or above the same-date historical record",
    aiSummaryNearRecordHigh: "latest value is near the same-date historical record",
    aiSummaryAboveMean: "above the 1991-2020 mean for this date",
    aiSummaryBelowMean: "below the 1991-2020 mean for this date",
    aiSummaryComparedWithMean: "vs 1991-2020 mean",
    aiSummaryComparedWithRecord: "vs same-date record",
    aiSummaryRankLabel: "same-date rank",
    aiSummaryNoWarnings: "Global surface temperature and global sea surface temperature are not unusually high versus their same-date historical records.",
    aiSummaryMostImportantSignals: "Key signals:",
    aiSummaryHeatSignalTitle: "Planet-wide warmth remains exceptionally high.",
    aiSummaryIceSignalTitle: "Polar conditions remain under pressure.",
    aiSummaryOceanSignalTitle: "Oceans keep setting the pace.",
    aiSummaryRegionalSignalTitle: "Regional extremes reinforce the global signal.",
    aiSummaryOtherSignalTitle: "A major climate signal stands out.",
    recordWarningsAria: "Record climate warnings",
    recordWarningKicker: "Record warning",
    recordWarningDateMeta: "Date",
    highestEverGlobalSurfaceTemperatureAnomalyTitle: "Highest Ever Global Surface Temperature Anomaly",
    highestEverGlobalSeaSurfaceTemperatureAnomalyTitle: "Highest Ever Global Sea Surface Temperature Anomaly",
    climateIndicatorsTitle: "Climate System",
    climateIndicatorsNote: "The state of the climate, what drives it and its natural swings.",
    globalTemperaturesSectionTitle: "Global Temperatures",
    globalTemperaturesSectionNote: "Global surface and sea surface temperatures in a Jan-Dec daily comparison view.",
    oceansSectionTitle: "Oceans",
    oceansSectionNote: "Long-term ocean state indicators: global mean sea level and ocean heat content.",
    earthEnergyImbalanceSectionTitle: "Earth Energy Imbalance",
    earthEnergyImbalanceSectionNote:
      "NASA CERES EBAF global net top-of-atmosphere flux, shown as a 12-month running mean to reduce monthly noise.",
    earthEnergyImbalanceTitle: "Earth Energy Imbalance",
    earthEnergyImbalanceSubtitle: "NASA CERES EBAF monthly global net TOA flux · 12-month running mean",
    temperatureAnomalySectionTitle: "Temperature Anomalies",
    temperatureAnomalySectionNote:
      "Global and sea-surface anomaly cards use a 1991-2020 climatology; daily and annual global-mean anomaly charts use an ERA5 preindustrial (1850-1900) estimate.",
    dailyGlobalTemperatureAnomalyTitle: "Daily Global Mean Temperature Anomaly",
    dailyGlobalTemperatureAnomaly365DayAverage: "365-day average",
    dailyGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, estimated 1850-1900 baseline)",
    annualGlobalTemperatureAnomalyTitle: "Annual Global Temperature Anomaly",
    annualGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, estimated 1850-1900 baseline)",
    annualGlobalTemperatureAnomalyMethod: "Mean of available daily anomalies (year-to-date for the current year).",
    projectedAnnualTemperatureAnomalyChartTitle: "Annual Global Temperature Anomaly + Projection",
    projectedAnnualTemperatureAnomalyChartSubtitle:
      "Historical annual means with the projected current-year value and confidence interval.",
    longRangeTemperatureTrendTitle: "Temperature Trend to 2100",
    longRangeTemperatureHorizonTitle: "Warming Pathways to 2100",
    longRangeTemperatureTrendSubtitle:
      "Measured annual warming to present, then indicative CMIP7 ScenarioMIP FaIR median pathways.",
    longRangeTemperatureTrendSource:
      "Scenario values are preliminary FaIR simple-climate-model medians from Van Vuuren et al. (2026), not final CMIP7 Earth system model output.",
    cmip7ScenarioSourceLabel: "CMIP7 ScenarioMIP",
    scenarioHighLabel: "High",
    scenarioMediumLabel: "Medium",
    scenarioMediumLowLabel: "Medium-Low",
    scenarioLowLabel: "Low",
    tippingPointsTitle: "Earth System Tipping Points",
    tippingPointsSubtitle:
      "Global-warming thresholds for major Earth-system tipping elements from Armstrong McKay et al. (2022), set against the dashboard's current annual warming estimate.",
    tippingPointsSourceLabel: "McKay et al. 2022",
    projectionExperimentalLabel: "Experimental",
    projectionIntervalLabel: "15th-85th percentile interval",
    projectionMethodLabel: "YTD + recent analog seasonal paths",
    projectionSignalLabel: "ENSO signal",
    projectionProbabilityMethodLabel: "Weighted analog years",
    outlookProjectedAnnualMeanLabel: "Projected annual mean",
    outlookChanceAboveOnePointFiveLabel: "chance above 1.5 °C",
    outlookChanceWarmestYearLabel: "chance warmest year",
    outlookChartCaption: "annual anomaly, last five years + 2026 projection",
    outlookProjectionSuffix: "p",
    outlookRecordLabel: "record",
    projectionsTitle: "Projections",
    projectionsNote: "Experimental warming outlook.",
    yearLabel: "Year",
    regionalTemperaturesSectionTitle: "Regional Temperatures",
    regionalTemperaturesSectionNote:
      "Daily Jan-Dec comparison for Northern Hemisphere, Arctic, North Atlantic SST, Niño 3.4 SST, Southern Hemisphere, and Antarctic temperatures.",
    regionalTemperatureAnomaliesSectionTitle: "Regional Temperature Anomalies",
    regionalTemperatureAnomaliesSectionNote:
      "Daily regional anomalies relative to each feed's 1991-2020 climatology for hemispheres, polar regions, and North Atlantic SST.",
    climatologyMeanLabel: "1991-2020 mean",
    seaIceSectionTitle: "Sea Ice",
    seaIceSectionNote:
      "Global, Arctic, and Antarctic extent shown with daily points in a Jan-Dec comparison view.",
    snowCoverSectionTitle: "Snow Cover",
    snowCoverSectionNote:
      "Monthly Northern Hemisphere land snow-cover extent from Rutgers Global Snow Lab. Comparable Southern Hemisphere/global snow-cover extent is not published in the same climate time-series feed.",
    iceSheetsAndGlaciersSectionTitle: "Ice Sheets and Glaciers",
    iceSheetsAndGlaciersSectionNote:
      "WGMS global glacier mass change and reference-glacier mass balance, plus cumulative Antarctic and Greenland ice-sheet mass loss since 2002 derived from NASA GRACE/GRACE-FO mass variation.",
    seaLevelEquivalentKicker: "Sea-level equivalent",
    seaLevelEquivalentSubtitle: "Potential global mean sea-level rise from complete ice-sheet loss.",
    nino34IndexTitle: "Historical Niño 3.4 Index",
    nino34IndexSubtitle: "NOAA CPC Oceanic Niño Index · centered 3-month Niño 3.4 SST anomaly",
    naoIndexSubtitle: "NOAA CPC monthly North Atlantic Oscillation index",
    pnaIndexSubtitle: "NOAA CPC monthly Pacific-North American index",
    soiIndexSubtitle: "NOAA PSL monthly Southern Oscillation Index · negative values are El Niño-like",
    arcticOscillationIndexSubtitle: "NOAA CPC monthly Arctic Oscillation index",
    naturalVariabilityTitle: "Natural Variability",
    mapsSectionTitle: "Maps",
    mapsSectionNote: "Latest global weather maps.",
    map2mTemperatureTitle: "Surface Temperature (2m)",
    map2mTemperatureAnomalyTitle: "Surface Temperature Anomaly (2m)",
    mapSstTitle: "Sea Surface Temperature",
    mapSstAnomalyTitle: "Sea Surface Temperature Anomaly",
    mapGlobalSubtitle: "Current-day map · Climate Reanalyzer Today’s Weather",
    mapSstSubtitle: "Latest available map · Climate Reanalyzer Today’s Weather",
    mapUnavailable: "Map unavailable",
    forcingTitle: "Forcing",
    sourceTitle: "Data source mode",
    sourceLive: "Live feeds",
    sourceMixed: "Mixed live + fallback",
    sourceBundled: "Bundled fallback",
    sourceLiveNote: "All series loaded from remote source feeds.",
    sourceMixedNote: "One or more live feeds failed; fallback data fills gaps.",
    sourceBundledNote: "All live feeds failed; bundled fallback drives every chart.",
    sourceWarningsTitle: "Data warnings",
    sourceStatusTitle: "Dataset status",
    sourceUpdatedTitle: "Last refresh",
    sourceListTitle: "Source links",
    sourceListNote: "Upstream data feeds.",
    sourceCardsTitle: "Sources",
    sourceLabel: "Source",
    chartFullscreenEnter: "Full screen",
    chartFullscreenExit: "Exit full screen",
    freshnessAsOf: "As of",
    freshnessDaily: "daily",
    freshnessMonthly: "monthly",
    freshnessQuarterly: "quarterly",
    freshnessAnnual: "annual",
    freshnessAssessment: "assessment",
    freshnessLagging: "Lagging",
    freshnessStale: "Stale",
    ytdLabel: "YTD",
    chartLatest: "Latest",
    noData: "No data",
    valuesLoading: "Loading latest values",
    valueUnavailable: "No value",
    footerMode: "Mode",
    footerUpdated: "Updated",
    footerCredit: "Made by András Tóth using ChatGPT and Claude.",
  },
  hu: {
    appTitle: "Klíma Dashboard",
    appSubtitle: "Globális klímaindikátorok és éghajlati kényszerek",
    dashboardNavigationAria: "Irányítópult-navigáció",
    brandSubtitle: "Globális éghajlati irányítópult",
    dataUpdatedLabel: "Adatfrissítés",
    dataStatusLabel: "Adatállapot",
    navOverview: "Áttekintés",
    navIndicators: "Éghajlati rendszer",
    overviewTitle: "Globális éghajlati áttekintés",
    overviewSubtitle: "Friss éghajlati jelzések",
    overviewDailyGlobalTemperatureAnomalyTitle: "Napi globális hőmérsékleti anomália",
    overviewPreindustrialSubtitle: "az 1850–1900-as átlaghoz képest",
    overviewSurfaceAnomalyTitle: "Felszíni hőmérsékleti anomália",
    overviewSstAnomalyTitle: "Tengerfelszíni hőmérsékleti anomália",
    overviewCo2Title: "CO₂-koncentráció",
    overviewAtmosphericSubtitle: "A légkörben",
    overviewArcticSeaIceTitle: "Arktiszi tengerijég-kiterjedés",
    overviewClimatologySubtitle: "az 1991–2020-as átlaghoz képest",
    planetNowTitle: "A Föld most",
    heroSparklineLabel: "Elmúlt 365 nap",
    heroRecordLabel: "Minden idők csúcsa",
    warmingStripesAria: "Az éves globális hőmérsékleti anomáliák 1940 óta, melegedési csíkokként ábrázolva",
    navGroupMonitor: "Megfigyelés",
    navGroupExplore: "Felfedezés",
    navGroupSystem: "Rendszer",
    deltaSincePrevious: "az előző értékhez képest",
    recordReachedText: "elérte ezt az értéket:",
    ensoTargetConnector: "időszakra:",
    viewAllForcing: "Összes éghajlati kényszer",
    viewAllMaps: "Összes térkép",
    recentHighlightsTitle: "Legfrissebb kiemelések",
    ensoOutlookTitle: "ENSO-előrejelzés",
    ensoCardTitle: "El Niño és La Niña",
    warmingEstimateTitle: "Várható melegedés",
    ensoNextThreeMonths: "Következő 3 hónap",
    ensoNextSixMonths: "Következő 6 hónap",
    ensoStatusLabel: "Státusz",
    ensoConditionNeutral: "ENSO-semleges",
    ensoConditionLaNina: "La Niña",
    ensoConditionElNino: "El Niño",
    ensoAlertNeutral: "ENSO-semleges",
    ensoAlertLaNinaAdvisory: "La Niña-figyelmeztetés",
    ensoAlertElNinoAdvisory: "El Niño-figyelmeztetés",
    ensoAlertLaNinaWatch: "La Niña várható",
    ensoAlertElNinoWatch: "El Niño várható",
    ensoAlertFinalLaNina: "A La Niña-időszak véget ért",
    ensoAlertFinalElNino: "Az El Niño-időszak véget ért",
    language: "Nyelv",
    theme: "Téma",
    themeSystem: "Rendszer",
    themeDark: "Sötét",
    themeLight: "Világos",
    sectionExpand: "Kibontás",
    sectionCollapse: "Összecsukás",
    latestLabel: "Legfrissebb",
    latestAnnualLabel: "Legfrissebb éves érték",
    latestSignalsAria: "A legfrissebb éghajlati mutatók",
    aiSummaryAria: "AI-alapú éghajlati összefoglaló",
    aiSummaryTitle: "AI-összefoglaló",
    aiSummaryKicker: "AI-összefoglaló",
    aiGeneratedAria: "AI által készített",
    aiSummaryLoading: "A legfrissebb AI-összefoglaló betöltése…",
    aiSummaryRecordHigh: "legfrissebb értéke eléri vagy meghaladja az erre a napra mért eddigi rekordot",
    aiSummaryNearRecordHigh: "legfrissebb értéke megközelíti az erre a napra mért eddigi rekordot",
    aiSummaryAboveMean: "meghaladja az erre a napra számított 1991–2020-as átlagot",
    aiSummaryBelowMean: "elmarad az erre a napra számított 1991–2020-as átlagtól",
    aiSummaryComparedWithMean: "az 1991–2020-as átlaghoz képest",
    aiSummaryComparedWithRecord: "az erre a napra mért rekordhoz képest",
    aiSummaryRankLabel: "helyezés ezen a napon",
    aiSummaryNoWarnings: "Sem a globális felszíni, sem a tengerfelszíni hőmérséklet nem szokatlanul magas az erre a napra mért eddigi rekordokhoz képest.",
    aiSummaryMostImportantSignals: "Fő jelzések:",
    aiSummaryHeatSignalTitle: "A bolygó továbbra is rendkívül meleg.",
    aiSummaryIceSignalTitle: "A sarkvidéki körülmények továbbra is aggasztóak.",
    aiSummaryOceanSignalTitle: "Továbbra is az óceánok diktálják az ütemet.",
    aiSummaryRegionalSignalTitle: "A regionális szélsőségek erősítik a globális jelzést.",
    aiSummaryOtherSignalTitle: "Egy fontos éghajlati jelzés emelkedik ki.",
    recordWarningsAria: "Éghajlati rekordfigyelmeztetések",
    recordWarningKicker: "Rekordfigyelmeztetés",
    recordWarningDateMeta: "Dátum",
    highestEverGlobalSurfaceTemperatureAnomalyTitle: "Mindenkori legmagasabb globális felszíni hőmérsékleti anomália",
    highestEverGlobalSeaSurfaceTemperatureAnomalyTitle: "Mindenkori legmagasabb globális tengerfelszíni hőmérsékleti anomália",
    climateIndicatorsTitle: "Éghajlati rendszer",
    climateIndicatorsNote: "Az éghajlat állapota, hajtóerői és természetes ingadozásai.",
    globalTemperaturesSectionTitle: "Globális hőmérsékletek",
    globalTemperaturesSectionNote: "A globális felszíni és tengerfelszíni hőmérséklet napi értékei, évenként egymásra vetítve (január–december).",
    oceansSectionTitle: "Óceánok",
    oceansSectionNote: "Hosszú távú óceáni mutatók: a globális átlagos tengerszint és az óceánok hőtartalma.",
    earthEnergyImbalanceSectionTitle: "A Föld energiatöbblete",
    earthEnergyImbalanceSectionNote:
      "A NASA CERES EBAF globális nettó sugárzási fluxusa a légkör tetején, 12 havi mozgóátlaggal simítva.",
    earthEnergyImbalanceTitle: "A Föld energiatöbblete",
    earthEnergyImbalanceSubtitle: "NASA CERES EBAF · nettó sugárzási fluxus a légkör tetején · 12 havi mozgóátlag",
    temperatureAnomalySectionTitle: "Hőmérsékleti anomáliák",
    temperatureAnomalySectionNote:
      "A globális felszíni és tengerfelszíni anomáliák az 1991–2020-as átlaghoz, a napi és éves globális átlaganomáliák pedig az ERA5 alapján becsült, iparosodás előtti 1850–1900-as szinthez viszonyítanak.",
    dailyGlobalTemperatureAnomalyTitle: "Napi globális átlaghőmérséklet-anomália",
    dailyGlobalTemperatureAnomaly365DayAverage: "365 napos átlag",
    dailyGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, becsült 1850–1900-as alapszint)",
    annualGlobalTemperatureAnomalyTitle: "Éves globális hőmérsékleti anomália",
    annualGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, becsült 1850–1900-as alapszint)",
    annualGlobalTemperatureAnomalyMethod: "Az elérhető napi anomáliák átlaga (a folyó évben az év eleje óta eltelt napok átlaga).",
    projectedAnnualTemperatureAnomalyChartTitle: "Éves globális hőmérsékleti anomália és idei becslés",
    projectedAnnualTemperatureAnomalyChartSubtitle:
      "A korábbi évek átlagai, valamint az idei év becsült értéke és bizonytalansági tartománya.",
    longRangeTemperatureTrendTitle: "Hőmérsékleti trend 2100-ig",
    longRangeTemperatureHorizonTitle: "Melegedési pályák 2100-ig",
    longRangeTemperatureTrendSubtitle:
      "A mért éves melegedés napjainkig, utána a CMIP7 ScenarioMIP FaIR-modell tájékoztató mediánpályái.",
    longRangeTemperatureTrendSource:
      "A forgatókönyvek értékei Van Vuuren és mtsai (2026) előzetes, egyszerű klímamodellel (FaIR) számolt mediánjai, nem végleges CMIP7 földrendszermodell-eredmények.",
    cmip7ScenarioSourceLabel: "CMIP7 ScenarioMIP",
    scenarioHighLabel: "Magas",
    scenarioMediumLabel: "Közepes",
    scenarioMediumLowLabel: "Közepesen alacsony",
    scenarioLowLabel: "Alacsony",
    tippingPointsTitle: "A földrendszer billenőpontjai",
    tippingPointsSubtitle:
      "A földrendszer fő billenőelemeinek melegedési küszöbei Armstrong McKay és mtsai (2022) alapján, a jelenlegi éves melegedési becsléshez viszonyítva.",
    tippingPointsSourceLabel: "McKay és mtsai, 2022",
    projectionExperimentalLabel: "Kísérleti",
    projectionIntervalLabel: "15–85. percentilis tartomány",
    projectionMethodLabel: "Az év eddigi adatai és hasonló (analóg) évek szezonális lefutása",
    projectionSignalLabel: "ENSO-jel",
    projectionProbabilityMethodLabel: "Súlyozott analóg évek",
    outlookProjectedAnnualMeanLabel: "Becsült éves átlag",
    outlookChanceAboveOnePointFiveLabel: "esély az 1,5 °C túllépésére",
    outlookChanceWarmestYearLabel: "esély rekordmeleg évre",
    outlookChartCaption: "éves anomália: az elmúlt öt év és az idei becslés",
    outlookProjectionSuffix: "b",
    outlookRecordLabel: "rekord",
    projectionsTitle: "Előrejelzések",
    projectionsNote: "Kísérleti melegedési kilátás.",
    yearLabel: "Év",
    regionalTemperaturesSectionTitle: "Regionális hőmérsékletek",
    regionalTemperaturesSectionNote:
      "Napi értékek évenként egymásra vetítve (január–december): északi és déli félteke, Arktisz, Antarktisz, valamint az észak-atlanti és a Niño 3.4 terület tengerfelszíni hőmérséklete.",
    regionalTemperatureAnomaliesSectionTitle: "Regionális hőmérsékleti anomáliák",
    regionalTemperatureAnomaliesSectionNote:
      "Napi regionális anomáliák az egyes adatforrások 1991–2020-as átlagához viszonyítva: féltekék, sarkvidékek és az észak-atlanti tengerfelszín.",
    climatologyMeanLabel: "1991–2020-as átlag",
    seaIceSectionTitle: "Tengeri jég",
    seaIceSectionNote:
      "A globális, az arktiszi és az antarktiszi tengerijég-kiterjedés napi értékei, évenként egymásra vetítve.",
    snowCoverSectionTitle: "Hótakaró",
    snowCoverSectionNote:
      "Az északi félteke szárazföldi hótakarójának havi kiterjedése a Rutgers Global Snow Lab adatai alapján. A déli féltekére vagy az egész Földre ugyanebből a forrásból nincs összehasonlítható idősor.",
    iceSheetsAndGlaciersSectionTitle: "Jégtakarók és gleccserek",
    iceSheetsAndGlaciersSectionNote:
      "A WGMS adatai a gleccserek globális tömegváltozásáról és a referenciagleccserek tömegmérlegéről, valamint az antarktiszi és a grönlandi jégtakaró 2002 óta összesített tömegvesztesége a NASA GRACE/GRACE-FO méréseiből.",
    seaLevelEquivalentKicker: "Tengerszint-egyenérték",
    seaLevelEquivalentSubtitle: "Ennyivel emelkedne a globális átlagos tengerszint, ha a jégtakaró teljesen elolvadna.",
    nino34IndexTitle: "A Niño 3.4-index alakulása",
    nino34IndexSubtitle: "NOAA CPC Óceáni Niño-index · a Niño 3.4 terület tengerfelszíni anomáliájának háromhavi mozgóátlaga",
    naoIndexSubtitle: "NOAA CPC · havi észak-atlanti oszcillációs index",
    pnaIndexSubtitle: "NOAA CPC · havi csendes-óceáni–észak-amerikai index",
    soiIndexSubtitle: "NOAA PSL · havi déli oszcillációs index · a negatív értékek El Niño-szerű állapotot jeleznek",
    arcticOscillationIndexSubtitle: "NOAA CPC · havi arktikus oszcillációs index",
    naturalVariabilityTitle: "Természetes változékonyság",
    mapsSectionTitle: "Térképek",
    mapsSectionNote: "Friss globális időjárási térképek.",
    map2mTemperatureTitle: "Felszínközeli hőmérséklet (2 m)",
    map2mTemperatureAnomalyTitle: "Felszínközeli hőmérsékleti anomália (2 m)",
    mapSstTitle: "Tengerfelszíni hőmérséklet",
    mapSstAnomalyTitle: "Tengerfelszíni hőmérsékleti anomália",
    mapGlobalSubtitle: "Mai térkép · Climate Reanalyzer Today’s Weather",
    mapSstSubtitle: "Legfrissebb elérhető térkép · Climate Reanalyzer Today’s Weather",
    mapUnavailable: "A térkép nem érhető el",
    forcingTitle: "Éghajlati kényszerek",
    sourceTitle: "Adatforrás módja",
    sourceLive: "Élő adatforrások",
    sourceMixed: "Vegyes (élő + tartalék)",
    sourceBundled: "Beépített tartalékadatok",
    sourceLiveNote: "Minden adatsor távoli élő adatforrásból töltődött be.",
    sourceMixedNote: "Egy vagy több élő adatforrás nem érhető el; a hiányzó adatokat tartalékadatok pótolják.",
    sourceBundledNote: "Egyik élő adatforrás sem érhető el; minden grafikon tartalékadatokat használ.",
    sourceWarningsTitle: "Adatfigyelmeztetések",
    sourceStatusTitle: "Az adatok állapota",
    sourceUpdatedTitle: "Utolsó frissítés",
    sourceListTitle: "Forráshivatkozások",
    sourceListNote: "Elsődleges adatforrások.",
    sourceCardsTitle: "Források",
    sourceLabel: "Forrás",
    chartFullscreenEnter: "Teljes képernyő",
    chartFullscreenExit: "Kilépés a teljes képernyőből",
    freshnessAsOf: "Utolsó adat",
    freshnessDaily: "napi",
    freshnessMonthly: "havi",
    freshnessQuarterly: "negyedéves",
    freshnessAnnual: "éves",
    freshnessAssessment: "értékelési adatsor",
    freshnessLagging: "Késik",
    freshnessStale: "Elavult",
    ytdLabel: "év eleje óta",
    chartLatest: "Legfrissebb",
    noData: "Nincs adat",
    valuesLoading: "A legfrissebb értékek betöltése",
    valueUnavailable: "Nincs érték",
    footerMode: "Mód",
    footerUpdated: "Frissítve",
    footerCredit: "Made by András Tóth using ChatGPT and Claude.",
  },
} as const;

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

// Storage access throws when the browser blocks site data (e.g. Safari with
// "Block all cookies"); preferences then simply don't persist.
function readStoredPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore: the preference stays in effect for this session only.
  }
}

function safeLanguage(raw: string | null): Language {
  return raw === "hu" ? "hu" : "en";
}

function safeTheme(raw: string | null): ThemeMode {
  if (raw === "dark" || raw === "light" || raw === "system") return raw;
  return "light";
}

function dashboardRouteFromHash(hash: string): { view: DashboardView; topic: string | null } {
  const [rawView = "", topic = ""] = hash.replace(/^#/, "").split("/");
  if (rawView in LEGACY_VIEW_TOPICS) return { view: "climate-system", topic: LEGACY_VIEW_TOPICS[rawView] };
  const view = rawView === LEGACY_CLIMATE_SYSTEM_VIEW ? "climate-system" : rawView;
  if (!DASHBOARD_VIEW_IDS.has(view as DashboardView)) return { view: "overview", topic: null };
  const knownTopic = (CLIMATE_SYSTEM_TOPIC_KEYS as readonly string[]).includes(topic) ? topic : null;
  return { view: view as DashboardView, topic: view === "climate-system" ? knownTopic : null };
}

function metricCategoryTone(metricKey: ClimateMetricSeries["key"]): "temperature" | "success" | "info" | "purple" | "neutral" {
  if (metricKey.includes("temperature") || metricKey.includes("anomaly")) return "temperature";
  if (metricKey.includes("co2") || metricKey.includes("ch4") || metricKey.includes("n2o") || metricKey.includes("aggi")) return "success";
  if (metricKey.includes("sea_level") || metricKey.includes("ocean")) return "info";
  if (metricKey.includes("ice") || metricKey.includes("glacier")) return "purple";
  return "neutral";
}

function metricIconName(metricKey: ClimateMetricSeries["key"]): ToolkitIconName {
  if (metricKey.includes("temperature") || metricKey.includes("anomaly")) return "temperature";
  if (metricKey.includes("co2") || metricKey.includes("ch4") || metricKey.includes("n2o") || metricKey.includes("aggi")) return "leaf";
  if (metricKey.includes("sea_level") || metricKey.includes("ocean")) return "ocean";
  if (metricKey.includes("ice") || metricKey.includes("glacier")) return "snow";
  return "trend";
}

function ToolkitIcon({ name, className }: { name: ToolkitIconName; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  switch (name) {
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.2 3.9 2.8 17.1A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.9L13.8 3.9a2 2 0 0 0-3.6 0Z" />
        </svg>
      );
    case "bars":
      return (
        <svg {...common}>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <path d="M7 3v4" />
          <path d="M17 3v4" />
          <path d="M4 9h16" />
          <rect width="16" height="15" x="4" y="5" rx="2" />
        </svg>
      );
    case "cloud":
      return (
        <svg {...common}>
          <path d="M17.5 18H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 12.2 3.2 3.2 0 0 1 17.5 18Z" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="m6 6 12 12" />
          <path d="m18 6-12 12" />
        </svg>
      );
    case "contrast":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v11" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a13.8 13.8 0 0 1 0 18" />
          <path d="M12 3a13.8 13.8 0 0 0 0 18" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6" />
          <path d="M12 7h.01" />
        </svg>
      );
    case "leaf":
      return (
        <svg {...common}>
          <path d="M5 20c7-1 12-6 14-15-8 1-13 4-15 9-1 3 0 5 1 6Z" />
          <path d="M5 20c3-5 7-8 12-10" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
          <path d="M9 3v15" />
          <path d="M15 6v15" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M20 12.6A8 8 0 1 1 11.4 4a6.3 6.3 0 0 0 8.6 8.6Z" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <path d="M5 12h.01" />
          <path d="M12 12h.01" />
          <path d="M19 12h.01" />
        </svg>
      );
    case "ocean":
      return (
        <svg {...common}>
          <path d="M3 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
          <path d="M3 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
          <path d="M3 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7V3Z" />
          <path d="M14 3v5h5" />
          <path d="M10 13h5" />
          <path d="M10 17h6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "snow":
      return (
        <svg {...common}>
          <path d="M12 2v20" />
          <path d="m4.9 4.9 14.2 14.2" />
          <path d="M2 12h20" />
          <path d="m4.9 19.1 14.2-14.2" />
        </svg>
      );
    case "sun":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.4" />
          <path d="M12 19.1v2.4" />
          <path d="M2.5 12h2.4" />
          <path d="M19.1 12h2.4" />
          <path d="m5 5 1.7 1.7" />
          <path d="m17.3 17.3 1.7 1.7" />
          <path d="m19 5-1.7 1.7" />
          <path d="m6.7 17.3-1.7 1.7" />
        </svg>
      );
    case "temperature":
      return (
        <svg {...common}>
          <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" />
          <path d="M12 9v7" />
        </svg>
      );
    case "trend":
      return (
        <svg {...common}>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M15 7h6v6" />
        </svg>
      );
    case "up":
      return (
        <svg {...common}>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      );
  }
}

function formatDateLabel(dateIso: string | null, language: Language): string {
  if (!dateIso) return "-";
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return dateIso;
  return new Intl.DateTimeFormat(language === "hu" ? "hu-HU" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTimeLabel(dateIso: string, language: Language): string {
  const date = new Date(dateIso);
  if (!Number.isFinite(date.getTime())) return dateIso;
  return new Intl.DateTimeFormat(language === "hu" ? "hu-HU" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function extractIsoDate(isoDateTime: string | null | undefined): string | null {
  if (typeof isoDateTime !== "string") return null;
  const parsed = Date.parse(isoDateTime);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

function buildMapAssetUrl(path: string | null | undefined, fallbackFileName: string, versionToken: string): string {
  const normalizedPath = typeof path === "string" ? path.replace(/^\/+/, "").trim() : "";
  const baseUrl = normalizedPath ? `${import.meta.env.BASE_URL}${normalizedPath}` : `${LOCAL_MAP_ASSET_BASE_URL}/${fallbackFileName}`;
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}v=${versionToken}`;
}

// Climate Reanalyzer serves its maps with Cross-Origin-Resource-Policy:
// same-origin, so remote URLs never load in the browser. The published local
// copy always goes first (even when stale); remote URLs remain a last resort.
function buildMapImageCandidates({
  path,
  fallbackFileName,
  versionToken,
  remoteUrls,
}: {
  path: string | null | undefined;
  fallbackFileName: string;
  versionToken: string;
  remoteUrls: Array<string | null | undefined>;
}): { imageUrl: string; fallbackImageUrls: string[] } {
  return {
    imageUrl: buildMapAssetUrl(path, fallbackFileName, versionToken),
    fallbackImageUrls: uniqueNonEmptyStrings(remoteUrls),
  };
}

function formatMapImageAlt(title: string, mapDateIso: string | null, language: Language): string {
  return mapDateIso ? `${title} (${formatDateLabel(mapDateIso, language)})` : title;
}

function formatAnnualAnomalyTopMeta(year: number, language: Language, isYtd: boolean, ytdLabel: string): string {
  const ytdSuffix = isYtd ? ` (${ytdLabel})` : "";
  if (language === "hu") return `${year}${ytdSuffix} · az 1850–1900-as átlaghoz képest`;
  return `Year: ${year}${ytdSuffix} vs 1850-1900`;
}

function formatProjectionTopMeta(year: number, language: Language): string {
  if (language === "hu") return `${year} · becslés az 1850–1900-as átlaghoz képest`;
  return `Year: ${year} projection vs 1850-1900`;
}

function formatNumericValue(value: number | null | undefined, decimals: number, language: Language, unavailableText: string): string {
  if (value == null || !Number.isFinite(value)) return unavailableText;
  return new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatMetricValue(metric: ClimateMetricSeries, language: Language, unavailableText: string): string {
  return formatNumericValue(metric.latestValue, metric.decimals, language, unavailableText);
}

function metricTitle(metric: ClimateMetricSeries, language: Language): string {
  return language === "hu" ? metric.titleHu : metric.titleEn;
}

function latestRecordHighPoint(metric: ClimateMetricSeries): DailyPoint | null {
  let latestPoint: DailyPoint | null = null;
  let recordValue = Number.NEGATIVE_INFINITY;

  for (const point of metric.points) {
    if (!Number.isFinite(point.value)) continue;
    if (point.value > recordValue) recordValue = point.value;
  }

  for (let index = metric.points.length - 1; index >= 0; index -= 1) {
    const point = metric.points[index];
    if (!Number.isFinite(point.value)) continue;
    latestPoint = point;
    break;
  }

  if (!latestPoint || !Number.isFinite(recordValue)) return null;
  return latestPoint.value >= recordValue ? latestPoint : null;
}

type AiSummaryTone = "critical" | "watch" | "normal";

interface SameDateTemperatureCheck {
  metric: ClimateMetricSeries;
  latestPoint: DailyPoint;
  tone: AiSummaryTone;
  baselineMean: number | null;
  differenceFromMean: number | null;
  previousRecord: number | null;
  differenceFromRecord: number | null;
  rank: number | null;
  sampleSize: number;
}

interface AiDashboardSummary {
  tone: AiSummaryTone;
  headline: string;
  bulletItems: string[];
  overviewItems: AiOverviewItem[];
  checks: SameDateTemperatureCheck[];
}

interface AiOverviewItem {
  key: string;
  title: string;
  detail: string;
  icon: SignalTopic;
  tone: "heat" | "ice" | "ocean" | "signal";
}

function toneRank(tone: AiSummaryTone): number {
  switch (tone) {
    case "critical":
      return 2;
    case "watch":
      return 1;
    default:
      return 0;
  }
}

function latestFinitePoint(points: DailyPoint[]): DailyPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (Number.isFinite(point.value)) return point;
  }
  return null;
}

function sameCalendarDayStats(
  metric: ClimateMetricSeries,
  baselineStartYear: number,
  baselineEndYear: number
): SameDateTemperatureCheck | null {
  const latestPoint = latestFinitePoint(metric.points);
  if (!latestPoint) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(latestPoint.date);
  if (!match) return null;
  const latestYear = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const axisDay = axisDayFromMonthDay(month, day);
  if (!Number.isFinite(latestYear) || axisDay == null) return null;

  const historicalValues: number[] = [];
  const baselineValues: number[] = [];

  for (const point of metric.points) {
    const pointMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(point.date);
    if (!pointMatch) continue;
    const pointYear = Number(pointMatch[1]);
    const pointAxisDay = axisDayFromMonthDay(Number(pointMatch[2]), Number(pointMatch[3]));
    const value = Number(point.value);
    if (!Number.isFinite(pointYear) || pointAxisDay !== axisDay || !Number.isFinite(value)) continue;

    if (point.date < latestPoint.date) historicalValues.push(value);
    if (pointYear >= baselineStartYear && pointYear <= baselineEndYear) baselineValues.push(value);
  }

  if (!historicalValues.length) return null;

  const baselineMean = baselineValues.length ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length : null;
  const previousRecord = Math.max(...historicalValues);
  const differenceFromMean = baselineMean == null ? null : latestPoint.value - baselineMean;
  const differenceFromRecord = latestPoint.value - previousRecord;
  const rank = [...historicalValues, latestPoint.value].filter((value) => value > latestPoint.value).length + 1;
  const watchThreshold = metric.key === "global_sea_surface_temperature" ? 0.35 : 0.5;
  const nearRecordMargin = metric.key === "global_sea_surface_temperature" ? 0.05 : 0.12;
  const tone: AiSummaryTone =
    differenceFromRecord >= -0.005
      ? "critical"
      : rank <= 3 || (differenceFromMean != null && differenceFromMean >= watchThreshold) || differenceFromRecord >= -nearRecordMargin
        ? "watch"
        : "normal";

  return {
    metric,
    latestPoint,
    tone,
    baselineMean,
    differenceFromMean,
    previousRecord,
    differenceFromRecord,
    rank,
    sampleSize: historicalValues.length + 1,
  };
}

function sameDateCheckReason(check: SameDateTemperatureCheck, t: (typeof STRINGS)[Language]): string {
  if (check.differenceFromRecord != null && check.differenceFromRecord >= -0.005) return t.aiSummaryRecordHigh;
  if (check.tone === "watch") return t.aiSummaryNearRecordHigh;
  if (check.differenceFromMean != null && check.differenceFromMean >= 0) return t.aiSummaryAboveMean;
  return t.aiSummaryBelowMean;
}

function localizeMetricMentions(text: string, metrics: ClimateMetricSeries[], language: Language): string {
  if (language !== "hu") return text;
  const replacements = metrics.flatMap((metric) => {
    const titleWithoutQualifier = metric.titleEn.replace(/\s*\([^)]*\)\s*$/, "");
    const localizedWithoutQualifier = metric.titleHu.replace(/\s*\([^)]*\)\s*$/, "");
    return [
      [metric.titleEn, metric.titleHu],
      [titleWithoutQualifier, localizedWithoutQualifier],
    ] as Array<[string, string]>;
  });

  return replacements
    .sort(([left], [right]) => right.length - left.length)
    .reduce((localized, [english, hungarian]) => localized.split(english).join(hungarian), text);
}

function splitAiSummaryBulletItems(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const lineItems = normalized
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
  if (lineItems.length > 1) return lineItems.slice(0, 3);

  return (
    normalized
      .replace(/^\s*[-*]\s+/, "")
      .match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean)
      .slice(0, 3) ?? [normalized.replace(/^\s*[-*]\s+/, "")]
  );
}

function buildAiDashboardSummary({
  snapshot,
  language,
  t,
  aiSummary,
}: {
  snapshot: ReturnType<typeof buildDashboardSnapshot>;
  language: Language;
  t: (typeof STRINGS)[Language];
  aiSummary: AiSummary | null;
}): AiDashboardSummary {
  const metricByKey = new Map([...snapshot.indicators, ...snapshot.forcing].map((metric) => [metric.key, metric]));
  const checks = ["global_surface_temperature", "global_sea_surface_temperature"]
    .map((key) => {
      const metric = metricByKey.get(key as ClimateMetricSeries["key"]);
      return metric ? sameCalendarDayStats(metric, CLIMATOLOGY_BASELINE_START_YEAR, CLIMATOLOGY_BASELINE_END_YEAR) : null;
    })
    .filter((entry): entry is SameDateTemperatureCheck => entry != null);
  const tone = checks.reduce<AiSummaryTone>(
    (currentTone, check) => (toneRank(check.tone) > toneRank(currentTone) ? check.tone : currentTone),
    "normal"
  );

  const warningChecks = checks.filter((check) => check.tone !== "normal");
  const overviewItems =
    aiSummary?.items?.map((item, index) => {
      const title = language === "hu" ? item.titleHu : item.titleEn;
      const detail = language === "hu" ? item.detailHu : item.detailEn;
      const icon = signalTopic(item.signalKey, item.tone);
      return {
        key: `${item.signalKey}-${index}`,
        title: localizeMetricMentions(title, [...snapshot.indicators, ...snapshot.forcing], language),
        detail: localizeMetricMentions(detail, [...snapshot.indicators, ...snapshot.forcing], language),
        icon,
        tone: item.tone,
      };
    }) ?? [];
  const sourceGeneratedText = language === "hu" ? aiSummary?.textHu : aiSummary?.textEn;
  const generatedText = sourceGeneratedText
    ? localizeMetricMentions(sourceGeneratedText, [...snapshot.indicators, ...snapshot.forcing], language)
    : null;
  const headline = generatedText
    ? generatedText
    : warningChecks.length > 0
      ? `${warningChecks
          .map((check, index) => {
            const title = metricTitle(check.metric, language);
            // Hungarian needs the definite article and a possessive predicate ("A globális … legfrissebb értéke …").
            const subject = language === "hu" ? `${index === 0 ? "A" : "a"} ${title.charAt(0).toLocaleLowerCase("hu")}${title.slice(1)}` : title;
            return `${subject} ${sameDateCheckReason(check, t)}`;
          })
          .join("; ")}.`
      : t.aiSummaryNoWarnings;

  return {
    tone,
    headline,
    bulletItems: splitAiSummaryBulletItems(headline),
    overviewItems,
    checks,
  };
}

function buildAiOverviewItems(
  summary: AiDashboardSummary,
  t: (typeof STRINGS)[Language]
): AiOverviewItem[] {
  if (summary.overviewItems.length === 3) return summary.overviewItems;
  const sourceItems = summary.bulletItems.length ? summary.bulletItems : [summary.headline];
  const toneCounts = new Map<AiOverviewItem["tone"], number>();

  return sourceItems.slice(0, 3).map((detail, index) => {
    const normalized = detail.toLocaleLowerCase();
    let item: AiOverviewItem;
    if (/arctic|antarctic|polar|sea ice|arkt|antarkt|sarkvid/.test(normalized)) {
      item = { key: `ice-${index}`, title: t.aiSummaryIceSignalTitle, detail, icon: "sea-ice", tone: "ice" };
    } else if (/ocean|sea level|ocean heat|óceán|tengerszint|tengerfelszín/.test(normalized)) {
      item = { key: `ocean-${index}`, title: t.aiSummaryOceanSignalTitle, detail, icon: "sea-surface", tone: "ocean" };
    } else if (/temperature|warm|heat|hőmérsék|meleg/.test(normalized)) {
      item = { key: `heat-${index}`, title: t.aiSummaryHeatSignalTitle, detail, icon: "air-temperature", tone: "heat" };
    } else {
      item = { key: `signal-${index}`, title: t.aiSummaryOtherSignalTitle, detail, icon: "signal", tone: "signal" };
    }

    const toneCount = toneCounts.get(item.tone) ?? 0;
    toneCounts.set(item.tone, toneCount + 1);
    return toneCount === 0 ? item : { ...item, title: t.aiSummaryRegionalSignalTitle };
  });
}

function buildMonthLabels(language: Language): string[] {
  if (language === "hu") return ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
}

const ENSO_TARGET_MONTH_LABELS: Record<string, { en: string; hu: string }> = {
  January: { en: "January", hu: "január" },
  February: { en: "February", hu: "február" },
  March: { en: "March", hu: "március" },
  April: { en: "April", hu: "április" },
  May: { en: "May", hu: "május" },
  June: { en: "June", hu: "június" },
  July: { en: "July", hu: "július" },
  August: { en: "August", hu: "augusztus" },
  September: { en: "September", hu: "szeptember" },
  October: { en: "October", hu: "október" },
  November: { en: "November", hu: "november" },
  December: { en: "December", hu: "december" },
};
const ENSO_TARGET_SEASON_LABELS: Record<string, { en: string; hu: string }> = {
  DJF: { en: "December-February", hu: "december–február" },
  JFM: { en: "January-March", hu: "január–március" },
  FMA: { en: "February-April", hu: "február–április" },
  MAM: { en: "March-May", hu: "március–május" },
  AMJ: { en: "April-June", hu: "április–június" },
  MJJ: { en: "May-July", hu: "május–július" },
  JJA: { en: "June-August", hu: "június–augusztus" },
  JAS: { en: "July-September", hu: "július–szeptember" },
  ASO: { en: "August-October", hu: "augusztus–október" },
  SON: { en: "September-November", hu: "szeptember–november" },
  OND: { en: "October-December", hu: "október–december" },
  NDJ: { en: "November-January", hu: "november–január" },
};

function formatEnsoConditionLabel(condition: EnsoCondition, t: (typeof STRINGS)[Language]): string {
  switch (condition) {
    case "la_nina":
      return t.ensoConditionLaNina;
    case "el_nino":
      return t.ensoConditionElNino;
    default:
      return t.ensoConditionNeutral;
  }
}

function formatEnsoAlertStatusLabel(alertStatus: string | null, language: Language, t: (typeof STRINGS)[Language]): string {
  const normalized = String(alertStatus ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ");

  if (!normalized) return language === "hu" ? "Nincs adat" : "No data";
  if (normalized.includes("final la nina")) return t.ensoAlertFinalLaNina;
  if (normalized.includes("final el nino")) return t.ensoAlertFinalElNino;
  if (normalized.includes("la nina advisory")) return t.ensoAlertLaNinaAdvisory;
  if (normalized.includes("el nino advisory")) return t.ensoAlertElNinoAdvisory;
  if (normalized.includes("la nina watch")) return t.ensoAlertLaNinaWatch;
  if (normalized.includes("el nino watch")) return t.ensoAlertElNinoWatch;
  if (normalized.includes("neutral")) return t.ensoAlertNeutral;
  return alertStatus ?? (language === "hu" ? "Nincs adat" : "No data");
}

function formatEnsoStatusLabel(ensoOutlook: EnsoOutlook | null, language: Language, t: (typeof STRINGS)[Language]): string {
  if (ensoOutlook?.alertStatus) return formatEnsoAlertStatusLabel(ensoOutlook.alertStatus, language, t);
  const forecastWindow = ensoOutlook?.nextThreeMonths ?? ensoOutlook?.nextSixMonths ?? null;
  return forecastWindow ? formatEnsoConditionLabel(forecastWindow.condition, t) : language === "hu" ? "Nincs adat" : "No data";
}

/** Hungarian inessive ending for a year as read aloud: 2026 → "ban" (hat), 2027 → "ben" (hét), 2030 → "ban" (harminc). */
function hungarianInessiveSuffix(year: number): string {
  const back = "ban";
  const front = "ben";
  const ones: Record<number, string> = { 1: front, 2: front, 3: back, 4: front, 5: front, 6: back, 7: front, 8: back, 9: front };
  const tens: Record<number, string> = { 1: front, 2: back, 3: back, 4: front, 5: front, 6: back, 7: front, 8: back, 9: front };
  if (year % 10 !== 0) return ones[year % 10];
  if (year % 100 !== 0) return tens[(year % 100) / 10];
  return year % 1000 === 0 ? front : back;
}

function formatEnsoTargetLabel(targetLabel: string | null, language: Language): string {
  if (!targetLabel) return "-";
  const seasonMatch = /^([A-Z]{3})\s+(\d{4})$/.exec(targetLabel.trim());
  if (seasonMatch) {
    const seasonLabel = ENSO_TARGET_SEASON_LABELS[seasonMatch[1]]?.[language] ?? seasonMatch[1];
    return language === "hu" ? `${seasonMatch[2]}. ${seasonLabel}` : `${seasonLabel} ${seasonMatch[2]}`;
  }
  const localized = targetLabel.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g,
    (match) => ENSO_TARGET_MONTH_LABELS[match]?.[language] ?? match
  );
  // Hungarian puts the year first and joins month ranges with an en dash: "2027. február–április".
  const yearAtEnd = language === "hu" ? /^(.+?)\s+(\d{4})$/.exec(localized.trim()) : null;
  return yearAtEnd ? `${yearAtEnd[2]}. ${yearAtEnd[1].replace(/\s*-\s*/g, "–")}` : localized;
}

const SOURCE_SHORT_NAMES_HU: Record<string, string> = {
  "Climate Reanalyzer (ERA5, 1991-2020 baseline)": "Climate Reanalyzer (ERA5, 1991–2020-as alapidőszak)",
  "Climate Reanalyzer (OISST v2.1, 1991-2020 baseline)": "Climate Reanalyzer (OISST v2.1, 1991–2020-as alapidőszak)",
  "ECMWF ERA5 Climate Pulse (preindustrial estimate)": "ECMWF ERA5 Climate Pulse (iparosodás előtti becslés)",
  "NASA GRACE/GRACE-FO (derived)": "NASA GRACE/GRACE-FO (származtatott)",
  "NSIDC Sea Ice Index v4 (North)": "NSIDC Sea Ice Index v4 (északi)",
  "NSIDC Sea Ice Index v4 (South)": "NSIDC Sea Ice Index v4 (déli)",
  "WGMS annual estimates": "WGMS éves becslések",
  "WGMS reference glaciers": "WGMS referenciagleccserek",
};

function formatSourceShortName(shortName: string, language: Language): string {
  return language === "hu" ? SOURCE_SHORT_NAMES_HU[shortName] ?? shortName : shortName;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseYearFromDateIso(dateIso: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(dateIso);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function dayOfYearFromDateIso(dateIso: string): number | null {
  const parsed = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((parsed - start) / DAY_MS) + 1;
}

function daysInYear(year: number): number {
  return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS);
}

function meanPointValues(points: DailyPoint[]): number | null {
  if (!points.length) return null;
  let sum = 0;
  let count = 0;
  for (const point of points) {
    const value = Number(point.value);
    if (!Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

function projectionEnsoWindow(ensoOutlook: EnsoOutlook | null): EnsoOutlookWindow | null {
  return ensoOutlook?.nextSixMonths ?? ensoOutlook?.nextThreeMonths ?? null;
}

function ensoPreferenceWeight(annualDelta: number, window: EnsoOutlookWindow | null): number {
  if (!window) return 1;

  const probability = clamp(window.probability ?? 50, 0, 100) / 100;
  const normalizedDelta = clamp(annualDelta / PROJECTION_DELTA_SCALE, -1, 1);

  switch (window.condition) {
    case "el_nino":
      return clamp(1 + normalizedDelta * probability, 0.35, 2);
    case "la_nina":
      return clamp(1 - normalizedDelta * probability, 0.35, 2);
    default:
      return clamp(1 + (1 - Math.abs(normalizedDelta)) * 0.35 * probability, 0.5, 1.35);
  }
}

function weightedQuantile(
  entries: Array<{ value: number; weight: number }>,
  quantile: number
): number | null {
  if (!entries.length) return null;
  const ordered = [...entries]
    .filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((left, right) => left.value - right.value);
  if (!ordered.length) return null;

  const totalWeight = ordered.reduce((sum, entry) => sum + entry.weight, 0);
  if (!(totalWeight > 0)) return null;
  const target = clamp(quantile, 0, 1) * totalWeight;

  let cumulative = 0;
  for (const entry of ordered) {
    cumulative += entry.weight;
    if (cumulative >= target) return entry.value;
  }

  return ordered[ordered.length - 1]?.value ?? null;
}

interface AnnualProjectionEstimate {
  year: number;
  value: number;
  low: number;
  high: number;
  probabilityAboveOnePointFive: number;
  probabilityWarmestOnRecord: number;
  analogCount: number;
  recordThreshold: number;
  ensoWindow: EnsoOutlookWindow | null;
}

function buildAnnualProjectionEstimate(
  points: DailyPoint[],
  ensoOutlook: EnsoOutlook | null
): AnnualProjectionEstimate | null {
  if (!points.length) return null;

  const latestPoint = points[points.length - 1];
  const currentYear = parseYearFromDateIso(latestPoint.date);
  const currentDayOfYear = dayOfYearFromDateIso(latestPoint.date);
  if (currentYear == null || currentDayOfYear == null) return null;

  const totalDays = daysInYear(currentYear);
  const remainingDays = totalDays - currentDayOfYear;
  if (remainingDays <= 0) return null;

  const pointsByYear = new Map<number, DailyPoint[]>();
  for (const point of points) {
    const year = parseYearFromDateIso(point.date);
    if (year == null) continue;
    const bucket = pointsByYear.get(year) ?? [];
    bucket.push(point);
    pointsByYear.set(year, bucket);
  }

  const currentYearPoints = pointsByYear.get(currentYear) ?? [];
  const currentObservedPoints = currentYearPoints.filter((point) => {
    const dayOfYear = dayOfYearFromDateIso(point.date);
    return dayOfYear != null && dayOfYear <= currentDayOfYear;
  });
  const currentYtdMean = meanPointValues(currentObservedPoints);
  if (currentYtdMean == null || currentObservedPoints.length < Math.max(30, currentDayOfYear - 3)) return null;

  const priorAnnualMeans = Array.from(pointsByYear.entries())
    .filter(([year, yearPoints]) => year < currentYear && yearPoints.length >= Math.max(300, daysInYear(year) - 3))
    .map(([, yearPoints]) => meanPointValues(yearPoints))
    .filter((value): value is number => value != null && Number.isFinite(value));
  const recordThreshold = priorAnnualMeans.length ? Math.max(...priorAnnualMeans) : null;
  if (recordThreshold == null) return null;

  const ensoWindow = projectionEnsoWindow(ensoOutlook);
  const recentAnalogCandidates = Array.from(pointsByYear.entries())
    .filter(([year]) => year < currentYear)
    .map(([year, yearPoints]) => {
      const ytdPoints = yearPoints.filter((point) => {
        const dayOfYear = dayOfYearFromDateIso(point.date);
        return dayOfYear != null && dayOfYear <= currentDayOfYear;
      });
      const remainderPoints = yearPoints.filter((point) => {
        const dayOfYear = dayOfYearFromDateIso(point.date);
        return dayOfYear != null && dayOfYear > currentDayOfYear;
      });

      if (ytdPoints.length < currentObservedPoints.length * 0.94) return null;
      if (remainderPoints.length < Math.max(45, remainingDays * 0.82)) return null;

      const ytdMean = meanPointValues(ytdPoints);
      const annualMean = meanPointValues(yearPoints);
      if (ytdMean == null || annualMean == null) return null;

      return {
        year,
        ytdMean,
        annualDelta: annualMean - ytdMean,
      };
    })
    .filter((entry): entry is { year: number; ytdMean: number; annualDelta: number } => entry != null)
    .sort((left, right) => left.year - right.year)
    .slice(-PROJECTION_ANALOG_POOL_SIZE);

  const analogs = recentAnalogCandidates
    .map((entry) => {
      const similarityWeight = Math.exp(-Math.pow((entry.ytdMean - currentYtdMean) / PROJECTION_YTD_SIGMA, 2));
      const recencyWeight = Math.exp(-Math.pow((currentYear - entry.year) / PROJECTION_RECENCY_SCALE_YEARS, 2));
      const outlookWeight = ensoPreferenceWeight(entry.annualDelta, ensoWindow);
      const projectedAnnualMean = currentYtdMean + entry.annualDelta;

      return {
        year: entry.year,
        projectedAnnualMean,
        weight: similarityWeight * recencyWeight * outlookWeight,
      };
    })
    .sort((left, right) => right.weight - left.weight)
    .slice(0, PROJECTION_MAX_ANALOGS);

  const validAnalogs = analogs.filter((entry) => Number.isFinite(entry.projectedAnnualMean) && entry.weight > 0);
  if (validAnalogs.length < 5) return null;

  const totalWeight = validAnalogs.reduce((sum, entry) => sum + entry.weight, 0);
  if (!(totalWeight > 0)) return null;

  const value =
    validAnalogs.reduce((sum, entry) => sum + entry.projectedAnnualMean * entry.weight, 0) / totalWeight;
  const probabilityAboveOnePointFive =
    validAnalogs
      .filter((entry) => entry.projectedAnnualMean > 1.5)
      .reduce((sum, entry) => sum + entry.weight, 0) / totalWeight;
  const probabilityWarmestOnRecord =
    validAnalogs
      .filter((entry) => entry.projectedAnnualMean > recordThreshold)
      .reduce((sum, entry) => sum + entry.weight, 0) / totalWeight;
  const weightedEntries = validAnalogs.map((entry) => ({ value: entry.projectedAnnualMean, weight: entry.weight }));
  const low = weightedQuantile(weightedEntries, 0.15);
  const high = weightedQuantile(weightedEntries, 0.85);
  if (low == null || high == null) return null;

  return {
    year: currentYear,
    value: Math.round(value * 1000) / 1000,
    low: Math.round(low * 1000) / 1000,
    high: Math.round(high * 1000) / 1000,
    probabilityAboveOnePointFive: Math.round(probabilityAboveOnePointFive * 1000) / 1000,
    probabilityWarmestOnRecord: Math.round(probabilityWarmestOnRecord * 1000) / 1000,
    analogCount: validAnalogs.length,
    recordThreshold: Math.round(recordThreshold * 1000) / 1000,
    ensoWindow,
  };
}

function scenarioDisplayLabel(scenario: LongRangeScenarioDefinition, language: Language): string {
  return language === "hu" ? scenario.labelHu : scenario.labelEn;
}

const WARMING_STRIPE_COLORS = [
  "#08306b",
  "#08519c",
  "#2171b5",
  "#4292c6",
  "#6baed6",
  "#9ecae1",
  "#c6dbef",
  "#fddbc7",
  "#fcae91",
  "#fb6a4a",
  "#ef3b2c",
  "#cb181d",
  "#a50f15",
  "#67000d",
];

function warmingStripeColor(ratio: number): string {
  const bounded = Math.min(Math.max(ratio, 0), 1);
  return WARMING_STRIPE_COLORS[Math.round(bounded * (WARMING_STRIPE_COLORS.length - 1))];
}

function tippingPointLabel(tippingPoint: TippingPointDefinition, language: Language): string {
  return language === "hu" ? tippingPoint.labelHu : tippingPoint.labelEn;
}

function tippingPointCategory(tippingPoint: TippingPointDefinition, language: Language): string {
  return language === "hu" ? tippingPoint.categoryHu : tippingPoint.categoryEn;
}

function tippingPointStateKey(tippingPoint: TippingPointDefinition, currentWarming: number | null): "likely" | "possible" | "below" {
  if (currentWarming == null || !Number.isFinite(currentWarming)) return "below";
  if (currentWarming >= tippingPoint.centralThreshold) return "likely";
  if (currentWarming >= tippingPoint.minThreshold) return "possible";
  return "below";
}

function pickComparisonYears(points: DailyPoint[]): number[] {
  const years = new Set<number>();
  for (const point of points) {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec(point.date);
    if (!match) continue;
    const year = Number(match[1]);
    if (Number.isFinite(year)) years.add(year);
  }
  const currentYear = years.size ? Math.max(...Array.from(years)) : new Date().getUTCFullYear();
  return [currentYear - 3, currentYear - 2, currentYear - 1, currentYear];
}

function pickCurrentAndPreviousYear(points: DailyPoint[]): number[] {
  const years = new Set<number>();
  for (const point of points) {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec(point.date);
    if (!match) continue;
    const year = Number(match[1]);
    if (Number.isFinite(year)) years.add(year);
  }
  const currentYear = years.size ? Math.max(...Array.from(years)) : new Date().getUTCFullYear();
  return [currentYear - 1, currentYear];
}

function pickYearsForMetric(metricKey: ClimateMetricSeries["key"], points: DailyPoint[]): number[] {
  if (TEMPERATURE_ANOMALY_KEYS.has(metricKey)) return pickCurrentAndPreviousYear(points);
  return pickComparisonYears(points);
}

/**
 * Domain of a metric for single-series chart colours, matching the topic
 * accents on the Climate system page: temperature, oceans, ice and snow, and
 * greenhouse gases / energy (forcing).
 */
function metricChartDomain(metricKey: ClimateMetricSeries["key"]): ChartDomain {
  if (metricKey === EARTH_ENERGY_IMBALANCE_KEY) return "forcing";
  switch (topSummaryCategoryClass(metricKey)) {
    case "topcat-temperature":
    case "topcat-anomaly":
      return "temperature";
    case "topcat-sea-ice":
      return "ice";
    case "topcat-forcing":
    case "topcat-enso":
      return "forcing";
    default:
      return "ocean";
  }
}

function topicChartColor(metricKey: ClimateMetricSeries["key"], dark: boolean): string {
  return domainColor(metricChartDomain(metricKey), dark);
}

function forcingGasLabel(metricKey: ClimateMetricSeries["key"]): string | null {
  switch (metricKey) {
    case "atmospheric_co2":
      return "CO₂";
    case "atmospheric_ch4":
      return "CH₄";
    case "atmospheric_n2o":
      return "N₂O";
    default:
      return null;
  }
}

function topicChartSoftColor(metricKey: ClimateMetricSeries["key"], dark: boolean): string {
  return domainColorAlpha(metricChartDomain(metricKey), dark, dark ? 0.42 : 0.34);
}

function buildIndicatorYearColors(currentYear: number, metricKey: ClimateMetricSeries["key"], dark: boolean): Record<number, string> {
  const previousYearGradient = dark ? ["#7e9cbc", "#94a3b8", "#64748b"] : ["#64748b", "#94a3b8", "#cbd5e1"];
  return {
    [currentYear]: topicChartColor(metricKey, dark),
    [currentYear - 1]: previousYearGradient[0],
    [currentYear - 2]: previousYearGradient[1],
    [currentYear - 3]: previousYearGradient[2],
  };
}

function axisDayFromMonthDay(month: number, day: number): number | null {
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const refDate = new Date(Date.UTC(REFERENCE_LEAP_YEAR, month - 1, day));
  if (refDate.getUTCMonth() !== month - 1 || refDate.getUTCDate() !== day) return null;
  return Math.floor((refDate.getTime() - REFERENCE_LEAP_YEAR_START_UTC) / (24 * 60 * 60 * 1000)) + 1;
}

function buildMonthlyYearLines(points: DailyPoint[], years: readonly number[]): Array<{ year: number; points: Array<[number, number]> }> {
  const buckets = new Map<number, Map<number, { sum: number; count: number }>>();
  for (const year of years) buckets.set(year, new Map());

  for (const point of points) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(point.date);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year)) continue;
    if (!buckets.has(year)) continue;
    const value = Number(point.value);
    if (!Number.isFinite(value)) continue;
    const axisDay = axisDayFromMonthDay(month, day);
    if (axisDay == null) continue;

    const byDay = buckets.get(year);
    if (!byDay) continue;
    const bucket = byDay.get(axisDay) ?? { sum: 0, count: 0 };
    bucket.sum += value;
    bucket.count += 1;
    byDay.set(axisDay, bucket);
  }

  return years.map((year) => {
    const byDay = buckets.get(year) ?? new Map<number, { sum: number; count: number }>();
    const entries = Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([axisDay, bucket]) => [axisDay, bucket.count > 0 ? bucket.sum / bucket.count : null] as const)
      .filter((entry): entry is [number, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]));

    return {
      year,
      points: entries,
    };
  });
}

interface DailyClimatologyEnvelope {
  mean: Array<[number, number]>;
}

function buildClimatologyEnvelope(
  points: DailyPoint[],
  baselineStartYear: number,
  baselineEndYear: number
): DailyClimatologyEnvelope | null {
  const buckets = new Map<number, { sum: number; count: number }>();

  for (const point of points) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(point.date);
    if (!match) continue;
    const year = Number(match[1]);
    if (!Number.isFinite(year) || year < baselineStartYear || year > baselineEndYear) continue;

    const month = Number(match[2]);
    const day = Number(match[3]);
    const axisDay = axisDayFromMonthDay(month, day);
    if (axisDay == null) continue;

    const value = Number(point.value);
    if (!Number.isFinite(value)) continue;

    const bucket = buckets.get(axisDay) ?? { sum: 0, count: 0 };
    bucket.sum += value;
    bucket.count += 1;
    buckets.set(axisDay, bucket);
  }

  if (!buckets.size) return null;

  const mean: Array<[number, number]> = [];

  for (const axisDay of Array.from(buckets.keys()).sort((a, b) => a - b)) {
    const bucket = buckets.get(axisDay);
    if (!bucket || bucket.count < 5) continue;
    const meanValue = bucket.sum / bucket.count;
    mean.push([axisDay, meanValue]);
  }

  if (!mean.length) return null;
  return { mean };
}

function buildAnnualMeanSeries(points: DailyPoint[]): DailyPoint[] {
  const buckets = new Map<number, { sum: number; count: number }>();

  for (const point of points) {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec(point.date);
    if (!match) continue;
    const year = Number(match[1]);
    const value = Number(point.value);
    if (!Number.isFinite(year) || !Number.isFinite(value)) continue;

    const bucket = buckets.get(year) ?? { sum: 0, count: 0 };
    bucket.sum += value;
    bucket.count += 1;
    buckets.set(year, bucket);
  }

  return Array.from(buckets.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([year, bucket]) => ({
      date: `${year}-01-01`,
      value: bucket.count > 0 ? Math.round((bucket.sum / bucket.count) * 1000) / 1000 : Number.NaN,
    }))
    .filter((point) => Number.isFinite(point.value));
}

function buildTrailingMeanSeries(points: DailyPoint[], windowSize: number): DailyPoint[] {
  if (windowSize <= 1) return points;

  const trailing: DailyPoint[] = [];
  let runningSum = 0;

  for (let index = 0; index < points.length; index += 1) {
    const value = Number(points[index]?.value);
    if (!Number.isFinite(value)) continue;
    runningSum += value;

    if (index >= windowSize) {
      runningSum -= Number(points[index - windowSize]?.value ?? 0);
    }

    if (index < windowSize - 1) continue;

    trailing.push({
      date: points[index].date,
      value: Math.round((runningSum / windowSize) * 1000) / 1000,
    });
  }

  return trailing;
}

function indicatorYAxisBounds(metricKey: ClimateMetricSeries["key"]): { min?: number; max?: number } {
  switch (metricKey) {
    case "global_surface_temperature":
      return { min: 10, max: 18 };
    case "global_sea_surface_temperature":
      return { min: 19.5, max: 21.5 };
    case "global_surface_temperature_anomaly":
      return { min: -1, max: 2.5 };
    case "global_sea_surface_temperature_anomaly":
      return { min: -2, max: 2 };
    case "northern_hemisphere_surface_temperature_anomaly":
    case "southern_hemisphere_surface_temperature_anomaly":
      return { min: -3, max: 3 };
    case "arctic_surface_temperature_anomaly":
    case "antarctic_surface_temperature_anomaly":
      return { min: -8, max: 8 };
    case "north_atlantic_sea_surface_temperature_anomaly":
      return { min: -3, max: 3 };
    case "daily_nino34_sea_surface_temperature_anomaly":
      return { min: -4, max: 4 };
    case "daily_global_mean_temperature_anomaly":
      return { min: -1, max: 2.5 };
    case "global_mean_sea_level":
      return { min: -40, max: 140 };
    case "ocean_heat_content":
      return { min: -20, max: 70 };
    case "earth_energy_imbalance":
      return { min: -0.5, max: 2.5 };
    case "global_glacier_mass_balance":
      return { min: -700, max: 100 };
    case "antarctic_ice_sheet_mass_balance":
      return { min: 0, max: 3200 };
    case "west_antarctic_ice_sheet_mass_balance":
      return { min: 0, max: 3000 };
    case "greenland_ice_sheet_mass_balance":
      return { min: 0, max: 7000 };
    case "northern_hemisphere_surface_temperature":
      return { min: 5, max: 25 };
    case "southern_hemisphere_surface_temperature":
      return { min: 9, max: 18 };
    case "arctic_surface_temperature":
      return { min: -35, max: 10 };
    case "antarctic_surface_temperature":
      return { min: -40, max: -8 };
    case "north_atlantic_sea_surface_temperature":
      return { min: 18, max: 26 };
    case "daily_nino34_sea_surface_temperature":
      return { min: 24, max: 31 };
    case "global_sea_ice_extent":
      return { min: 10, max: 30 };
    case "arctic_sea_ice_extent":
      return { min: 2, max: 18 };
    case "antarctic_sea_ice_extent":
      return { min: 0, max: 24 };
    case "northern_hemisphere_snow_cover_extent":
      return { min: 0, max: 60 };
    default:
      return {};
  }
}

function indicatorYAxisUnitLabel(metricKey: ClimateMetricSeries["key"], language: Language): string | undefined {
  switch (metricKey) {
    case "global_surface_temperature":
    case "global_sea_surface_temperature":
    case "northern_hemisphere_surface_temperature":
    case "southern_hemisphere_surface_temperature":
    case "arctic_surface_temperature":
    case "antarctic_surface_temperature":
    case "north_atlantic_sea_surface_temperature":
    case "daily_nino34_sea_surface_temperature":
    case "global_surface_temperature_anomaly":
    case "global_sea_surface_temperature_anomaly":
    case "northern_hemisphere_surface_temperature_anomaly":
    case "southern_hemisphere_surface_temperature_anomaly":
    case "arctic_surface_temperature_anomaly":
    case "antarctic_surface_temperature_anomaly":
    case "north_atlantic_sea_surface_temperature_anomaly":
    case "daily_nino34_sea_surface_temperature_anomaly":
    case "daily_global_mean_temperature_anomaly":
      return "°C";
    case "global_mean_sea_level":
      return language === "hu" ? "milliméter (mm)" : "millimeters (mm)";
    case "ocean_heat_content":
      return language === "hu" ? "10²² joule" : "10²² joules";
    case "earth_energy_imbalance":
    case "incoming_solar_energy":
      return language === "hu" ? "watt per négyzetméter (W/m²)" : "watts per square meter (W/m²)";
    case "mountain_glacier_mass_balance":
      return language === "hu" ? "méter vízegyenérték (m v.e.)" : "meters water equivalent (m w.e.)";
    case "global_glacier_mass_balance":
    case "greenland_ice_sheet_mass_balance":
      return language === "hu" ? "gigatonna (Gt)" : "gigatons (Gt)";
    case "west_antarctic_ice_sheet_mass_balance":
    case "antarctic_ice_sheet_mass_balance":
      return language === "hu" ? "gigatonna (Gt)" : "gigatons (Gt)";
    case "global_sea_ice_extent":
    case "arctic_sea_ice_extent":
    case "antarctic_sea_ice_extent":
    case "northern_hemisphere_snow_cover_extent":
      return language === "hu" ? "millió km²" : "million km²";
    default:
      return undefined;
  }
}

function cardUnitLabel(metricKey: ClimateMetricSeries["key"], unit: string, language: Language): string {
  if (
    GLOBAL_TEMPERATURE_KEYS.has(metricKey) ||
    REGIONAL_TEMPERATURE_KEYS.has(metricKey) ||
    TEMPERATURE_ANOMALY_KEYS.has(metricKey) ||
    REGIONAL_TEMPERATURE_ANOMALY_KEYS.has(metricKey) ||
    metricKey === DAILY_GLOBAL_MEAN_ANOMALY_KEY ||
    metricKey === NINO34_SST_ANOMALY_KEY ||
    metricKey === "nino34_index"
  ) {
    return "°C";
  }
  if (VARIABILITY_INDEX_KEY_SET.has(metricKey)) return "index";
  if (metricKey === "ocean_heat_content") return "× 10²² J";
  if (language !== "hu") return unit;
  if (SEA_ICE_KEYS.has(metricKey) || SNOW_COVER_KEYS.has(metricKey)) return "millió km²";
  if (metricKey === "global_mean_sea_level") return "mm";
  if (metricKey === EARTH_ENERGY_IMBALANCE_KEY || metricKey === "incoming_solar_energy") return "W/m²";
  if (metricKey === "global_glacier_mass_balance") return "Gt";
  if (metricKey === "mountain_glacier_mass_balance") return "m w.e.";
  if (metricKey === "antarctic_ice_sheet_mass_balance") return "Gt";
  if (metricKey === "west_antarctic_ice_sheet_mass_balance") return "Gt";
  if (metricKey === "greenland_ice_sheet_mass_balance") return "Gt";
  if (metricKey === "atmospheric_aggi") return "index";
  return unit;
}

function topSummaryCategoryClass(metricKey: ClimateMetricSeries["key"]): string {
  if (
    metricKey === "global_surface_temperature" ||
    metricKey === "global_sea_surface_temperature" ||
    REGIONAL_TEMPERATURE_KEYS.has(metricKey)
  ) {
    return "topcat-temperature";
  }
  if (
    metricKey === "global_surface_temperature_anomaly" ||
    metricKey === "global_sea_surface_temperature_anomaly" ||
    REGIONAL_TEMPERATURE_ANOMALY_KEYS.has(metricKey) ||
    metricKey === NINO34_SST_ANOMALY_KEY ||
    metricKey === "daily_global_mean_temperature_anomaly"
  ) {
    return "topcat-anomaly";
  }
  if (
    metricKey === "global_sea_ice_extent" ||
    metricKey === "arctic_sea_ice_extent" ||
    metricKey === "antarctic_sea_ice_extent" ||
    SNOW_COVER_KEYS.has(metricKey)
  ) {
    return "topcat-sea-ice";
  }
  if (
    metricKey === "atmospheric_co2" ||
    metricKey === "atmospheric_ch4" ||
    metricKey === "atmospheric_n2o" ||
    metricKey === "atmospheric_aggi" ||
    metricKey === "incoming_solar_energy"
  ) {
    return "topcat-forcing";
  }
  if (VARIABILITY_INDEX_KEY_SET.has(metricKey)) return "topcat-enso";
  if (OCEAN_KEYS.has(metricKey) || metricKey === EARTH_ENERGY_IMBALANCE_KEY) {
    return "topcat-ocean";
  }
  if (ICE_SHEET_AND_GLACIER_KEYS.has(metricKey)) {
    return "topcat-sea-ice";
  }
  return "topcat-neutral";
}

type FreshnessTone = "fresh" | "warning" | "stale";
type FreshnessCadence = "daily" | "monthly" | "quarterly" | "annual" | "assessment";
type DataSourceSection = "temperature" | "ocean" | "ice" | "forcing" | "maps" | "outlook";

interface FreshnessPolicy {
  cadence: FreshnessCadence;
  warningDays: number;
  staleDays: number;
}

function sourceSectionForMetric(metricKey: ClimateMetricSeries["key"]): DataSourceSection {
  if (
    GLOBAL_TEMPERATURE_KEYS.has(metricKey) ||
    TEMPERATURE_ANOMALY_KEYS.has(metricKey) ||
    REGIONAL_TEMPERATURE_KEYS.has(metricKey) ||
    REGIONAL_TEMPERATURE_ANOMALY_KEYS.has(metricKey) ||
    metricKey === NINO34_SST_ANOMALY_KEY ||
    metricKey === DAILY_GLOBAL_MEAN_ANOMALY_KEY
  ) {
    return "temperature";
  }
  if (VARIABILITY_INDEX_KEY_SET.has(metricKey)) return "outlook";
  if (OCEAN_KEYS.has(metricKey) || metricKey === EARTH_ENERGY_IMBALANCE_KEY) return "ocean";
  if (SEA_ICE_KEYS.has(metricKey) || SNOW_COVER_KEYS.has(metricKey) || ICE_SHEET_AND_GLACIER_KEYS.has(metricKey)) return "ice";
  return "forcing";
}

function dataSourceSectionTitle(section: DataSourceSection, t: (typeof STRINGS)[Language]): string {
  switch (section) {
    case "temperature":
      return t.globalTemperaturesSectionTitle;
    case "ocean":
      return t.oceansSectionTitle;
    case "ice":
      return t.iceSheetsAndGlaciersSectionTitle;
    case "forcing":
      return t.forcingTitle;
    case "maps":
      return t.mapsSectionTitle;
    case "outlook":
      return t.naturalVariabilityTitle;
  }
}

function freshnessPolicyForMetric(metricKey: ClimateMetricSeries["key"]): FreshnessPolicy {
  switch (metricKey) {
    case "global_sea_surface_temperature":
    case "global_sea_surface_temperature_anomaly":
    case "north_atlantic_sea_surface_temperature":
    case "daily_nino34_sea_surface_temperature":
    case "north_atlantic_sea_surface_temperature_anomaly":
    case "daily_nino34_sea_surface_temperature_anomaly":
      return { cadence: "daily", warningDays: 21, staleDays: 45 };
    case "atmospheric_co2":
      return { cadence: "daily", warningDays: 14, staleDays: 35 };
    case "atmospheric_ch4":
      return { cadence: "monthly", warningDays: 90, staleDays: 180 };
    case "atmospheric_n2o":
      return { cadence: "monthly", warningDays: 90, staleDays: 180 };
    case "global_mean_sea_level":
      return { cadence: "monthly", warningDays: 120, staleDays: 240 };
    case "ocean_heat_content":
      return { cadence: "quarterly", warningDays: 180, staleDays: 360 };
    case "earth_energy_imbalance":
    case "incoming_solar_energy":
      return { cadence: "monthly", warningDays: 120, staleDays: 220 };
    case "global_glacier_mass_balance":
    case "mountain_glacier_mass_balance":
      return { cadence: "annual", warningDays: 650, staleDays: 1400 };
    case "antarctic_ice_sheet_mass_balance":
      return { cadence: "monthly", warningDays: 220, staleDays: 430 };
    case "west_antarctic_ice_sheet_mass_balance":
      return { cadence: "assessment", warningDays: 2400, staleDays: 3200 };
    case "greenland_ice_sheet_mass_balance":
      return { cadence: "monthly", warningDays: 220, staleDays: 430 };
    case "northern_hemisphere_snow_cover_extent":
      return { cadence: "monthly", warningDays: 90, staleDays: 120 };
    case "atmospheric_aggi":
      return { cadence: "annual", warningDays: 550, staleDays: 900 };
    case "nino34_index":
    case "nao_index":
    case "pna_index":
    case "soi_index":
    case "arctic_oscillation_index":
      return { cadence: "monthly", warningDays: 120, staleDays: 220 };
    default:
      return { cadence: "daily", warningDays: 10, staleDays: 20 };
  }
}

function utcDayAge(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const parsed = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  const now = new Date();
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((nowUtc - parsed) / 86_400_000));
}

function cadenceLabel(cadence: FreshnessCadence, t: (typeof STRINGS)[Language]): string {
  switch (cadence) {
    case "monthly":
      return t.freshnessMonthly;
    case "quarterly":
      return t.freshnessQuarterly;
    case "annual":
      return t.freshnessAnnual;
    case "assessment":
      return t.freshnessAssessment;
    default:
      return t.freshnessDaily;
  }
}

function metricFreshnessBadge(
  metric: ClimateMetricSeries,
  language: Language,
  t: (typeof STRINGS)[Language]
): { tone: FreshnessTone; label: string } {
  const policy = freshnessPolicyForMetric(metric.key);
  const ageDays = utcDayAge(metric.latestDate);
  const tone: FreshnessTone =
    ageDays == null ? "stale" : ageDays > policy.staleDays ? "stale" : ageDays > policy.warningDays ? "warning" : "fresh";
  const statusSuffix = tone === "stale" ? ` · ${t.freshnessStale}` : tone === "warning" ? ` · ${t.freshnessLagging}` : "";
  const label = `${t.freshnessAsOf}: ${formatDateLabel(metric.latestDate, language)} · ${cadenceLabel(policy.cadence, t)}${statusSuffix}`;
  return { tone, label };
}

function mapFreshnessBadge(
  mapDateIso: string | null,
  language: Language,
  t: (typeof STRINGS)[Language]
): { tone: FreshnessTone; label: string } | null {
  if (!mapDateIso) return null;
  const ageDays = utcDayAge(mapDateIso);
  const tone: FreshnessTone =
    ageDays == null ? "stale" : ageDays > 20 ? "stale" : ageDays > 10 ? "warning" : "fresh";
  const statusSuffix = tone === "stale" ? ` · ${t.freshnessStale}` : tone === "warning" ? ` · ${t.freshnessLagging}` : "";
  const label = `${t.freshnessAsOf}: ${formatDateLabel(mapDateIso, language)} · ${t.freshnessDaily}${statusSuffix}`;
  return { tone, label };
}

function ensoFreshnessBadge(
  ensoOutlook: EnsoOutlook | null,
  language: Language,
  t: (typeof STRINGS)[Language]
): { tone: FreshnessTone; label: string } | null {
  if (!ensoOutlook?.issuedDate) return null;
  const ageDays = utcDayAge(ensoOutlook.issuedDate);
  const tone: FreshnessTone =
    ageDays == null ? "stale" : ageDays > 55 ? "stale" : ageDays > 35 ? "warning" : "fresh";
  const statusSuffix = tone === "stale" ? ` · ${t.freshnessStale}` : tone === "warning" ? ` · ${t.freshnessLagging}` : "";
  const label = `${t.freshnessAsOf}: ${formatDateLabel(ensoOutlook.issuedDate, language)} · ${t.freshnessMonthly}${statusSuffix}`;
  return { tone, label };
}

export function App() {
  const [language, setLanguage] = useState<Language>(() => safeLanguage(readStoredPreference(STORAGE_LANG_KEY)));
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => safeTheme(readStoredPreference(STORAGE_THEME_KEY)));
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(safeTheme(readStoredPreference(STORAGE_THEME_KEY))));
  const [compact, setCompact] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 980px)").matches;
  });
  const [dataSource, setDataSource] = useState<DashboardDataSource>(() =>
    createBundledDataSource("Loading live climate feeds; using bundled fallback in the meantime.")
  );
  const [runtimeDataReady, setRuntimeDataReady] = useState(false);
  const [overviewMapMode, setOverviewMapMode] = useState<OverviewMapMode>("anomaly");
  const [indicatorTopic, setIndicatorTopic] = useState<string>(() =>
    typeof window === "undefined" ? DEFAULT_CLIMATE_SYSTEM_TOPIC : dashboardRouteFromHash(window.location.hash).topic ?? DEFAULT_CLIMATE_SYSTEM_TOPIC
  );
  const indicatorTopicRef = useRef(indicatorTopic);
  indicatorTopicRef.current = indicatorTopic;
  const [mapTopic, setMapTopic] = useState("surface");
  const [sourceQuery, setSourceQuery] = useState("");
  const indicatorTopics = [
    {group: "state", key: "temperature", en: "Temperature", hu: "Hőmérséklet", descriptionEn: "Track global heat from daily variability to the long-term warming signal.", descriptionHu: "A globális hőmérséklet a napi ingadozástól a hosszú távú melegedésig.", sections: ["globalTemperatures", "temperatureAnomalies"]},
    {group: "state", key: "regions", en: "Regions", hu: "Régiók", descriptionEn: "Compare how warming is distributed across hemispheres and polar regions.", descriptionHu: "Hogyan oszlik meg a melegedés a féltekék és a sarkvidékek között.", sections: ["regionalTemperatures", "regionalTemperatureAnomalies"]},
    {group: "state", key: "oceans", en: "Oceans", hu: "Óceánok", descriptionEn: "Follow ocean surface warmth, sea level and the heat stored below the surface.", descriptionHu: "Az óceánfelszín melegedése, a tengerszint és a mélyben tárolt hő.", sections: ["oceans"]},
    {group: "state", key: "ice", en: "Ice & snow", hu: "Jég és hó", descriptionEn: "See the changing footprint of sea ice, snow cover, glaciers and ice sheets.", descriptionHu: "A tengeri jég, a hótakaró, a gleccserek és a jégtakarók változása.", sections: ["seaIce", "snowCover", "iceSheetsAndGlaciers"]},
    {group: "state", key: "energy", en: "Energy", hu: "Energia", descriptionEn: "Measure the planetary energy imbalance driving continued climate change.", descriptionHu: "A Föld energiatöbblete, amely tovább hajtja az éghajlatváltozást.", sections: ["earthEnergyImbalance"]},
    {group: "drivers", key: "forcing", en: "Greenhouse gases & Sun", hu: "Üvegházhatású gázok és a Nap", descriptionEn: "Greenhouse gases building up in the atmosphere trap more heat, while the Sun's output barely changes.", descriptionHu: "A légkörben felhalmozódó üvegházhatású gázok egyre több hőt tartanak vissza, miközben a Nap sugárzása alig változik.", sections: ["forcingGases", "forcingCombined"]},
    {group: "variability", key: "enso", en: "El Niño & La Niña", hu: "El Niño és La Niña", descriptionEn: "The Pacific swing behind most year-to-year changes in global temperature, with the seasonal outlook.", descriptionHu: "A csendes-óceáni ingadozás, amely a globális hőmérséklet évről évre tapasztalt változásainak nagy részéért felel, évszakos előrejelzéssel.", sections: ["enso"]},
    {group: "variability", key: "circulation", en: "Circulation modes", hu: "Cirkulációs mintázatok", descriptionEn: "Pressure patterns that steer Northern Hemisphere weather, shifting the jet stream and storm tracks.", descriptionHu: "Az északi félteke időjárását alakító légnyomási mintázatok, amelyek a futóáramlást és a ciklonok útvonalát terelik.", sections: ["circulation"]},
  ];
  // The groups the Climate system topics sit under, in order.
  const climateSystemGroups: Array<{ key: string; en: string; hu: string }> = [
    { key: "state", en: "State of the climate", hu: "Az éghajlat állapota" },
    { key: "drivers", en: "Drivers", hu: "Hajtóerők" },
    { key: "variability", en: "Natural variability", hu: "Természetes változékonyság" },
  ];
  const activeIndicatorTopic = indicatorTopics.find((topic) => topic.key === indicatorTopic) ?? indicatorTopics[0];
  const activeIndicatorGroup = climateSystemGroups.find((group) => group.key === activeIndicatorTopic.group);
  const activeIndicatorGroupLabel = activeIndicatorGroup ? (language === "hu" ? activeIndicatorGroup.hu : activeIndicatorGroup.en) : "";
  const [activeView, setActiveView] = useState<DashboardView>(() => {
    if (typeof window === "undefined") return "overview";
    return dashboardRouteFromHash(window.location.hash).view;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const topicNavRef = useRef<HTMLDivElement>(null);

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
  };

  const t = STRINGS[language];
  const ensoOutlook = dataSource.ensoOutlook ?? null;

  useEffect(() => {
    writeStoredPreference(STORAGE_LANG_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    writeStoredPreference(STORAGE_THEME_KEY, themeMode);

    const apply = () => {
      const nextResolved = resolveTheme(themeMode);
      setResolvedTheme(nextResolved);
      document.documentElement.setAttribute("data-theme", nextResolved);
    };

    apply();

    if (themeMode !== "system" || typeof window.matchMedia !== "function") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 980px)");
    const onChange = () => setCompact(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenu();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen || !window.matchMedia("(max-width: 1020px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleHashChange = () => {
      const route = dashboardRouteFromHash(window.location.hash);
      setActiveView(route.view);
      if (route.view !== "climate-system") return;
      // Keep the current topic when the address names none (or an unknown one),
      // and rewrite old or partial addresses to the canonical #climate-system/<topic>.
      const topic = route.topic ?? indicatorTopicRef.current;
      setIndicatorTopic(topic);
      const target = `#climate-system/${topic}`;
      if (window.location.hash !== target) window.history.replaceState(null, "", target);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Keep the Climate system topic in the address so reloads and shared links
  // reopen it (and old #indicators, #forcing and #variability links are rewritten).
  useEffect(() => {
    if (activeView !== "climate-system") return;
    const target = `#climate-system/${indicatorTopic}`;
    if (window.location.hash !== target) window.history.replaceState(null, "", target);
  }, [activeView, indicatorTopic]);

  // Sticky Indicators navigation (side rail, location bar) sits under the
  // site header: track the header's height (desktop bar or mobile app bar).
  useEffect(() => {
    if (activeView !== "climate-system") return;
    const measure = () => {
      const mobileBar = document.querySelector<HTMLElement>(".mobile-app-bar");
      const header = mobileBar && mobileBar.offsetHeight > 0 ? mobileBar : document.querySelector<HTMLElement>(".dashboard-sidebar");
      document.documentElement.style.setProperty("--app-header-height", `${header?.offsetHeight ?? 0}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeView]);

  // Keep the active topic in view when the bar scrolls sideways on phones.
  useEffect(() => {
    const nav = topicNavRef.current;
    const active = nav?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    const target = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    // Instant: a second smooth scroll would cancel a page jump that is under way.
    nav.scrollLeft = Math.max(0, target);
  }, [indicatorTopic]);

  useEffect(() => {
    let active = true;

    loadRuntimeDataSource()
      .then((nextSource) => {
        if (!active) return;
        setDataSource(nextSource);
        setRuntimeDataReady(true);
      })
      .catch(() => {
        if (!active) return;
        setRuntimeDataReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const snapshot = useMemo(() => buildDashboardSnapshot(dataSource), [dataSource]);
  const metricByKey = useMemo(
    () => new Map([...snapshot.indicators, ...snapshot.forcing].map((metric) => [metric.key, metric])),
    [snapshot.indicators, snapshot.forcing]
  );
  const headlineMetrics = useMemo(
    () =>
      [...snapshot.indicators, ...snapshot.forcing]
        .filter((metric) => TOP_SUMMARY_RANK.has(metric.key))
        .sort((left, right) => {
          const leftRank = TOP_SUMMARY_RANK.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = TOP_SUMMARY_RANK.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [snapshot.indicators, snapshot.forcing]
  );
  const recordWarningCards = useMemo(
    () =>
      RECORD_WARNING_KEYS.map((metricKey) => {
        const metric = snapshot.indicators.find((candidate) => candidate.key === metricKey);
        if (!metric) return null;
        const recordPoint = latestRecordHighPoint(metric);
        return recordPoint ? { metric, recordPoint } : null;
      }).filter((entry): entry is { metric: ClimateMetricSeries; recordPoint: DailyPoint } => entry != null),
    [snapshot.indicators]
  );
  const footerSources = useMemo(() => {
    const ensoSource = dataSource.ensoOutlook;
    const sources = [...snapshot.indicators, ...snapshot.forcing].map((metric) => ({
      key: `${metric.key}-footer-source`,
      url: metric.source.url,
      title: metricTitle(metric, language),
      provider: formatSourceShortName(metric.source.shortName, language),
      section: sourceSectionForMetric(metric.key),
      label: `${metricTitle(metric, language)} · ${formatSourceShortName(metric.source.shortName, language)}`,
      freshness: metric.latestDate ? metricFreshnessBadge(metric, language, t) : null,
    }));
    if (ensoSource?.sourceUrl) {
      sources.push({
        key: "enso-outlook-footer-source",
        url: ensoSource.sourceUrl,
        title: t.ensoOutlookTitle,
        provider: ensoSource.sourceLabel || "NOAA CPC",
        section: "outlook",
        label: `${t.ensoOutlookTitle} · ${ensoSource.sourceLabel || "NOAA CPC"}`,
        freshness: ensoFreshnessBadge(ensoSource, language, t),
      });
    }
    const mapSourceTitles: Record<ClimateMapKey, string> = {
      global_2m_temperature: t.map2mTemperatureTitle,
      global_2m_temperature_anomaly: t.map2mTemperatureAnomalyTitle,
      global_sst: t.mapSstTitle,
      global_sst_anomaly: t.mapSstAnomalyTitle,
    };
    for (const [mapKey, map] of Object.entries(dataSource.maps ?? {}) as Array<[ClimateMapKey, NonNullable<DashboardDataSource["maps"]>[ClimateMapKey]]>) {
      if (!map?.sourceUrl) continue;
      const title = mapSourceTitles[mapKey];
      sources.push({
        key: `${mapKey}-footer-source`,
        url: map.sourceUrl,
        title,
        provider: "Climate Reanalyzer",
        section: "maps",
        label: `${title} · Climate Reanalyzer`,
        freshness: mapFreshnessBadge(map.date ?? null, language, t),
      });
    }
    return sources;
  }, [snapshot.indicators, snapshot.forcing, language, dataSource.ensoOutlook, dataSource.maps, t]);
  const monthlyLabels = useMemo(() => buildMonthLabels(language), [language]);
  const indicatorLines = useMemo(
    () =>
      snapshot.indicators
        .filter((metric) => !MONTHLY_COMPARISON_EXCLUDED_KEYS.has(metric.key))
        .map((metric) => {
        const years = pickYearsForMetric(metric.key, metric.points);
        const currentYear = years[years.length - 1];
        const climatology =
          TEMPERATURE_ANOMALY_KEYS.has(metric.key)
            ? null
            : buildClimatologyEnvelope(metric.points, CLIMATOLOGY_BASELINE_START_YEAR, CLIMATOLOGY_BASELINE_END_YEAR);
        return {
          metric,
          currentYear,
          lines: buildMonthlyYearLines(metric.points, years),
          climatology,
        };
        }),
    [snapshot.indicators]
  );
  const dailyContextByKey = useMemo(() => {
    const contexts = new Map<string, DailyContextData>();
    for (const metric of snapshot.indicators) {
      if (!DAILY_CONTEXT_KEYS.has(metric.key)) continue;
      const context = buildDailyContextData(metric.points, {
        baselineStartYear: CLIMATOLOGY_BASELINE_START_YEAR,
        baselineEndYear: CLIMATOLOGY_BASELINE_END_YEAR,
        pastYearCount: DAILY_CONTEXT_PAST_YEARS,
        recordDirection: LOW_RECORD_KEYS.has(metric.key) ? "low" : "high",
      });
      if (context) contexts.set(metric.key, context);
    }
    return contexts;
  }, [snapshot.indicators]);
  const oceanMetrics = useMemo(
    () =>
      snapshot.indicators
        .filter((metric) => OCEAN_RANK.has(metric.key))
        .sort((left, right) => {
          const leftRank = OCEAN_RANK.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = OCEAN_RANK.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [snapshot.indicators]
  );
  const earthEnergyImbalanceMetric = useMemo(
    () => snapshot.indicators.find((metric) => metric.key === EARTH_ENERGY_IMBALANCE_KEY) ?? null,
    [snapshot.indicators]
  );
  const variabilityMetrics = useMemo(
    () => VARIABILITY_INDEX_KEYS.map((key) => metricByKey.get(key)).filter((metric): metric is ClimateMetricSeries => Boolean(metric)),
    [metricByKey]
  );
  const globalTemperatureLines = useMemo(
    () => indicatorLines.filter(({ metric }) => GLOBAL_TEMPERATURE_KEYS.has(metric.key)),
    [indicatorLines]
  );
  const anomalyTemperatureLines = useMemo(
    () => indicatorLines.filter(({ metric }) => TEMPERATURE_ANOMALY_KEYS.has(metric.key)),
    [indicatorLines]
  );
  const dailyGlobalMeanAnomalyMetric = useMemo(
    () => snapshot.indicators.find((metric) => metric.key === DAILY_GLOBAL_MEAN_ANOMALY_KEY) ?? null,
    [snapshot.indicators]
  );
  const annualGlobalMeanAnomalyPoints = useMemo(
    () => (dailyGlobalMeanAnomalyMetric ? buildAnnualMeanSeries(dailyGlobalMeanAnomalyMetric.points) : []),
    [dailyGlobalMeanAnomalyMetric]
  );
  const warmingStripes = useMemo(() => {
    const entries: Array<{ year: number; value: number }> = [];
    for (const point of annualGlobalMeanAnomalyPoints) {
      const year = parseYearFromDateIso(point.date);
      if (year == null || !Number.isFinite(point.value)) continue;
      entries.push({ year, value: point.value });
    }
    if (!entries.length) return [];
    const values = entries.map((entry) => entry.value);
    const min = Math.min(...values);
    const span = Math.max(...values) - min || 1;
    return entries.map((entry) => ({ ...entry, ratio: (entry.value - min) / span }));
  }, [annualGlobalMeanAnomalyPoints]);
  const dailyGlobalMeanAnomaly365DayPoints = useMemo(
    () => (dailyGlobalMeanAnomalyMetric ? buildTrailingMeanSeries(dailyGlobalMeanAnomalyMetric.points, 365) : []),
    [dailyGlobalMeanAnomalyMetric]
  );
  const latestAnnualGlobalMeanAnomaly = useMemo(() => {
    if (!annualGlobalMeanAnomalyPoints.length) return null;
    const latest = annualGlobalMeanAnomalyPoints[annualGlobalMeanAnomalyPoints.length - 1];
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec(latest.date);
    const year = match ? Number(match[1]) : Number.NaN;
    if (!Number.isFinite(year) || !Number.isFinite(latest.value)) return null;
    return {
      year,
      value: latest.value,
    };
  }, [annualGlobalMeanAnomalyPoints]);
  const annualGlobalMeanAnomalyIsYtd = useMemo(() => {
    if (!dailyGlobalMeanAnomalyMetric || !latestAnnualGlobalMeanAnomaly) return false;
    const nowYear = new Date().getUTCFullYear();
    if (latestAnnualGlobalMeanAnomaly.year !== nowYear) return false;

    for (let index = dailyGlobalMeanAnomalyMetric.points.length - 1; index >= 0; index -= 1) {
      const point = dailyGlobalMeanAnomalyMetric.points[index];
      if (!point.date.startsWith(`${nowYear}-`)) continue;
      return !point.date.endsWith("-12-31");
    }
    return false;
  }, [dailyGlobalMeanAnomalyMetric, latestAnnualGlobalMeanAnomaly]);
  // Global warming above pre-industrial (ECMWF Climate Pulse): the 365-day
  // mean over faint daily values, and annual means with the year in progress.
  const dailyWarmingContext = useMemo(
    () =>
      dailyGlobalMeanAnomalyMetric && dailyGlobalMeanAnomaly365DayPoints.length
        ? buildTrendContextData(dailyGlobalMeanAnomaly365DayPoints, { kind: "line", rawPoints: dailyGlobalMeanAnomalyMetric.points })
        : null,
    [dailyGlobalMeanAnomalyMetric, dailyGlobalMeanAnomaly365DayPoints]
  );
  const annualWarmingContext = useMemo(
    () => (annualGlobalMeanAnomalyPoints.length ? buildTrendContextData(annualGlobalMeanAnomalyPoints, { kind: "annual-bars" }) : null),
    [annualGlobalMeanAnomalyPoints]
  );
  const projectedAnnualGlobalMeanAnomaly = useMemo(() => {
    if (!dailyGlobalMeanAnomalyMetric || !annualGlobalMeanAnomalyIsYtd) return null;
    return buildAnnualProjectionEstimate(dailyGlobalMeanAnomalyMetric.points, ensoOutlook);
  }, [dailyGlobalMeanAnomalyMetric, annualGlobalMeanAnomalyIsYtd, ensoOutlook]);
  // The projections page has no content without an estimate (e.g. early
  // January, before any year-to-date data). Once data has loaded, send deep
  // links there to the overview instead of leaving an empty page.
  useEffect(() => {
    if (!runtimeDataReady || activeView !== "projections" || projectedAnnualGlobalMeanAnomaly) return;
    setActiveView("overview");
    window.history.replaceState(null, "", "#overview");
  }, [runtimeDataReady, activeView, projectedAnnualGlobalMeanAnomaly]);
  const aiDashboardSummary = useMemo(
    () =>
      buildAiDashboardSummary({
        snapshot,
        language,
        t,
        aiSummary: dataSource.aiSummary ?? null,
      }),
    [snapshot, language, t, dataSource.aiSummary]
  );
  const aiOverviewItems = useMemo(() => buildAiOverviewItems(aiDashboardSummary, t), [aiDashboardSummary, t]);
  const earthEnergyImbalanceTrendPoints = useMemo(
    () => (earthEnergyImbalanceMetric ? buildTrailingMeanSeries(earthEnergyImbalanceMetric.points, 12) : []),
    [earthEnergyImbalanceMetric]
  );
  const earthEnergyImbalanceLatestMean = earthEnergyImbalanceTrendPoints[earthEnergyImbalanceTrendPoints.length - 1]?.value ?? null;
  const earthEnergyImbalanceBaselineMean = meanPointValues(
    earthEnergyImbalanceTrendPoints.filter((point) => {
      const year = parseYearFromDateIso(point.date);
      return year != null && year >= 2001 && year <= 2010;
    })
  );
  // Long-record charts: running totals, cumulative ice loss, annual glacier
  // balances and the energy imbalance's 12-month mean (charts/trendContext.ts).
  const trendContextByKey = useMemo(() => {
    const contexts = new Map<string, { data: TrendContextData; variant: TrendContextVariant }>();
    for (const metric of snapshot.indicators) {
      let variant: TrendContextVariant | null = null;
      if (OCEAN_KEYS.has(metric.key)) variant = "rise";
      else if (ICE_SHEET_LOSS_KEYS.has(metric.key)) variant = "loss";
      else if (ICE_SHEET_AND_GLACIER_KEYS.has(metric.key)) variant = "annual";
      if (!variant) continue;
      const data = buildTrendContextData(metric.points, { kind: variant === "annual" ? "annual-bars" : "line" });
      if (data) contexts.set(metric.key, { data, variant });
    }
    if (earthEnergyImbalanceMetric && earthEnergyImbalanceTrendPoints.length) {
      const data = buildTrendContextData(earthEnergyImbalanceTrendPoints, { kind: "line", rawPoints: earthEnergyImbalanceMetric.points });
      if (data) contexts.set(earthEnergyImbalanceMetric.key, { data, variant: "imbalance" });
    }
    return contexts;
  }, [snapshot.indicators, earthEnergyImbalanceMetric, earthEnergyImbalanceTrendPoints]);
  // Forcing: greenhouse gases as a 12-month mean over the measurements, the
  // AGGI as annual values, and solar input as an 11-year mean over months.
  const forcingContextByKey = useMemo(() => {
    const contexts = new Map<string, { data: TrendContextData; variant: TrendContextVariant }>();
    for (const metric of snapshot.forcing) {
      let context: { data: TrendContextData | null; variant: TrendContextVariant } | null = null;
      if (metric.key in PREINDUSTRIAL_LEVELS) {
        context = {
          data: buildTrendContextData(trailingMeanByDays(metric.points, 365), { kind: "line", rawPoints: metric.points }),
          variant: "concentration",
        };
      } else if (metric.key === "atmospheric_aggi") {
        context = { data: buildTrendContextData(metric.points, { kind: "line" }), variant: "aggi" };
      } else if (metric.key === "incoming_solar_energy") {
        context = {
          data: buildTrendContextData(trailingMeanByDays(metric.points, SOLAR_CYCLE_DAYS), { kind: "line", rawPoints: metric.points }),
          variant: "solar",
        };
      }
      if (context?.data) contexts.set(metric.key, { data: context.data, variant: context.variant });
    }
    return contexts;
  }, [snapshot.forcing]);
  // Variability indices since 1950: monthly values shaded by sign under a
  // 12-month mean (charts/trendContext.ts, "index" form).
  const variabilityChartPanels = useMemo(
    () =>
      variabilityMetrics.flatMap((metric) => {
        const points = metric.points.filter((point) => point.date >= `${VARIABILITY_START_YEAR}-01-01`);
        const data = points.length ? buildTrendContextData(trailingMeanByDays(points, 365), { kind: "line", rawPoints: points }) : null;
        if (!data) return [];
        const subtitle: string =
          metric.key === "nino34_index"
            ? t.nino34IndexSubtitle
            : metric.key === "nao_index"
              ? t.naoIndexSubtitle
              : metric.key === "pna_index"
                ? t.pnaIndexSubtitle
                : metric.key === "soi_index"
                  ? t.soiIndexSubtitle
                  : t.arcticOscillationIndexSubtitle;
        return [{ metric, subtitle, data }];
      }),
    [
      t.arcticOscillationIndexSubtitle,
      t.naoIndexSubtitle,
      t.nino34IndexSubtitle,
      t.pnaIndexSubtitle,
      t.soiIndexSubtitle,
      variabilityMetrics,
    ]
  );
  const projectedAnnualChartPoints = useMemo(
    () => annualGlobalMeanAnomalyPoints.filter((point) => (parseYearFromDateIso(point.date) ?? 0) >= 2020),
    [annualGlobalMeanAnomalyPoints]
  );
  const outlookMiniChartBars = useMemo(() => {
    if (!projectedAnnualGlobalMeanAnomaly) return [];
    const historicalBars = projectedAnnualChartPoints
      .map((point) => {
        const year = parseYearFromDateIso(point.date);
        return year == null ? null : { year, value: point.value, projected: false };
      })
      .filter(
        (point): point is { year: number; value: number; projected: false } =>
          point != null && point.year < projectedAnnualGlobalMeanAnomaly.year && Number.isFinite(point.value)
      )
      .slice(-5);

    return [
      ...historicalBars,
      {
        year: projectedAnnualGlobalMeanAnomaly.year,
        value: projectedAnnualGlobalMeanAnomaly.value,
        projected: true,
      },
    ];
  }, [projectedAnnualChartPoints, projectedAnnualGlobalMeanAnomaly]);
  // The annual record with this year replaced by its projected mean, drawn
  // with its likely range (Projections page).
  const estimateWarmingContext = useMemo(() => {
    if (!projectedAnnualGlobalMeanAnomaly) return null;
    const projectionDate = `${projectedAnnualGlobalMeanAnomaly.year}-01-01`;
    const points = annualGlobalMeanAnomalyPoints.filter((point) => (parseYearFromDateIso(point.date) ?? 0) < projectedAnnualGlobalMeanAnomaly.year);
    return buildTrendContextData([...points, { date: projectionDate, value: projectedAnnualGlobalMeanAnomaly.value }], { kind: "annual-bars" });
  }, [annualGlobalMeanAnomalyPoints, projectedAnnualGlobalMeanAnomaly]);
  const warmingEstimate = useMemo(() => {
    const projection = projectedAnnualGlobalMeanAnomaly;
    if (!projection) return undefined;
    const window = projection.ensoWindow;
    return {
      low: projection.low,
      high: projection.high,
      yearToDate: annualGlobalMeanAnomalyIsYtd ? latestAnnualGlobalMeanAnomaly?.value ?? null : null,
      probabilityAbove: projection.probabilityAboveOnePointFive,
      probabilityRecord: projection.probabilityWarmestOnRecord,
      analogCount: projection.analogCount,
      signal: window
        ? `${t.projectionSignalLabel}: ${formatEnsoTargetLabel(window.targetLabel, language)} · ${formatEnsoConditionLabel(window.condition, t)} · ${window.probability ?? "-"}%`
        : null,
    };
  }, [projectedAnnualGlobalMeanAnomaly, annualGlobalMeanAnomalyIsYtd, latestAnnualGlobalMeanAnomaly, language, t]);
  // Observed annual warming, then each pathway's central estimate to 2100.
  const pathwaysData = useMemo(
    () =>
      buildPathwaysData(
        annualGlobalMeanAnomalyPoints,
        CMIP7_SCENARIOMIP_SCENARIOS.map((scenario) => ({
          key: scenario.key,
          label: scenarioDisplayLabel(scenario, language),
          colorLight: scenario.colorLight,
          colorDark: scenario.colorDark,
          anchors: scenario.anchors,
        }))
      ),
    [annualGlobalMeanAnomalyPoints, language]
  );
  const currentTippingWarming = latestAnnualGlobalMeanAnomaly?.value ?? null;
  const tippingLadderItems = useMemo<TippingLadderItem[]>(
    () =>
      MCKAY_TIPPING_POINTS.map((tippingPoint) => ({
        key: tippingPoint.key,
        label: tippingPointLabel(tippingPoint, language),
        categoryKey: tippingPoint.categoryEn,
        category: tippingPointCategory(tippingPoint, language),
        central: tippingPoint.centralThreshold,
        min: tippingPoint.minThreshold,
        max: tippingPoint.maxThreshold,
        state: tippingPointStateKey(tippingPoint, currentTippingWarming),
      })),
    [currentTippingWarming, language]
  );
  const regionalTemperatureLines = useMemo(
    () =>
      indicatorLines
        .filter(({ metric }) => REGIONAL_TEMPERATURE_KEYS.has(metric.key))
        .sort((left, right) => {
          const leftRank = REGIONAL_TEMPERATURE_RANK.get(left.metric.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = REGIONAL_TEMPERATURE_RANK.get(right.metric.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [indicatorLines]
  );
  const regionalTemperatureAnomalyLines = useMemo(
    () =>
      indicatorLines
        .filter(({ metric }) => REGIONAL_TEMPERATURE_ANOMALY_KEYS.has(metric.key))
        .sort((left, right) => {
          const leftRank = REGIONAL_TEMPERATURE_ANOMALY_RANK.get(left.metric.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = REGIONAL_TEMPERATURE_ANOMALY_RANK.get(right.metric.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [indicatorLines]
  );
  const seaIceIndicatorLines = useMemo(
    () => indicatorLines.filter(({ metric }) => SEA_ICE_KEYS.has(metric.key)),
    [indicatorLines]
  );
  const snowCoverIndicatorLines = useMemo(
    () => indicatorLines.filter(({ metric }) => SNOW_COVER_KEYS.has(metric.key)),
    [indicatorLines]
  );
  const iceSheetAndGlacierMetrics = useMemo(
    () =>
      snapshot.indicators
        .filter((metric) => ICE_SHEET_AND_GLACIER_RANK.has(metric.key))
        .sort((left, right) => {
          const leftRank = ICE_SHEET_AND_GLACIER_RANK.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = ICE_SHEET_AND_GLACIER_RANK.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [snapshot.indicators]
  );
  const mapCards = useMemo(() => {
    const mapAssets = dataSource.maps ?? {};
    const mapVersion = encodeURIComponent(snapshot.updatedAtIso);

    const surfaceMapDateIso = mapAssets.global_2m_temperature?.date ?? null;
    const surfaceAnomalyMapDateIso = mapAssets.global_2m_temperature_anomaly?.date ?? null;
    const sstMapDateIso = mapAssets.global_sst?.date ?? null;
    const sstAnomalyMapDateIso = mapAssets.global_sst_anomaly?.date ?? null;

    const surfaceMapDisplayDateIso = surfaceMapDateIso ?? null;
    const surfaceAnomalyMapDisplayDateIso = surfaceAnomalyMapDateIso ?? null;
    const sstMapDisplayDateIso = sstMapDateIso ?? null;
    const sstAnomalyMapDisplayDateIso = sstAnomalyMapDateIso ?? null;

    const surfaceSubtitle = t.mapGlobalSubtitle;
    const sstSubtitle = t.mapSstSubtitle;
    const surfaceFreshness = mapFreshnessBadge(surfaceMapDateIso, language, t);
    const surfaceAnomalyFreshness = mapFreshnessBadge(surfaceAnomalyMapDateIso, language, t);
    const sstFreshness = mapFreshnessBadge(sstMapDateIso, language, t);
    const sstAnomalyFreshness = mapFreshnessBadge(sstAnomalyMapDateIso, language, t);
    const surfaceImageCandidates = buildMapImageCandidates({
      path: mapAssets.global_2m_temperature?.path,
      fallbackFileName: LOCAL_MAP_FILENAMES.global_2m_temperature,
      versionToken: mapVersion,
      remoteUrls: [mapAssets.global_2m_temperature?.sourceUrl, CURRENT_MAP_REMOTE_URLS.global_2m_temperature],
    });
    const surfaceAnomalyImageCandidates = buildMapImageCandidates({
      path: mapAssets.global_2m_temperature_anomaly?.path,
      fallbackFileName: LOCAL_MAP_FILENAMES.global_2m_temperature_anomaly,
      versionToken: mapVersion,
      remoteUrls: [mapAssets.global_2m_temperature_anomaly?.sourceUrl, CURRENT_MAP_REMOTE_URLS.global_2m_temperature_anomaly],
    });
    const sstImageCandidates = buildMapImageCandidates({
      path: mapAssets.global_sst?.path,
      fallbackFileName: LOCAL_MAP_FILENAMES.global_sst,
      versionToken: mapVersion,
      remoteUrls: [mapAssets.global_sst?.sourceUrl, CURRENT_MAP_REMOTE_URLS.global_sst],
    });
    const sstAnomalyImageCandidates = buildMapImageCandidates({
      path: mapAssets.global_sst_anomaly?.path,
      fallbackFileName: LOCAL_MAP_FILENAMES.global_sst_anomaly,
      versionToken: mapVersion,
      remoteUrls: [mapAssets.global_sst_anomaly?.sourceUrl, CURRENT_MAP_REMOTE_URLS.global_sst_anomaly],
    });

    return [
      {
        key: "map-2m-temperature",
        scaleTicks: ["-60", "-50", "-40", "-30", "-20", "-10", "0", "10", "20", "30", "40", "50"],
        caption: language === "hu" ? "2 méteres léghőmérséklet" : "2 m air temperature",
        product: "GFS",
        baselineLabel: null,
        title: t.map2mTemperatureTitle,
        subtitle: surfaceSubtitle,
        imageUrl: surfaceImageCandidates.imageUrl,
        fallbackImageUrls: surfaceImageCandidates.fallbackImageUrls,
        imageAlt: formatMapImageAlt(t.map2mTemperatureTitle, surfaceMapDisplayDateIso, language),
        dateIso: surfaceMapDisplayDateIso,
        freshness: surfaceFreshness,
      },
      {
        key: "map-2m-temperature-anomaly",
        scaleTicks: ["-32", "-24", "-18", "-14", "-10", "-6", "-3", "-1", "0", "1", "3", "6", "10", "14", "18", "24", "32"],
        caption: language === "hu" ? "2 méteres léghőmérséklet-anomália" : "2 m air temperature anomaly",
        product: "GFS",
        baselineLabel: language === "hu" ? "az 1979–2000-es átlaghoz képest" : "vs 1979–2000",
        title: t.map2mTemperatureAnomalyTitle,
        subtitle: surfaceSubtitle,
        imageUrl: surfaceAnomalyImageCandidates.imageUrl,
        fallbackImageUrls: surfaceAnomalyImageCandidates.fallbackImageUrls,
        imageAlt: formatMapImageAlt(t.map2mTemperatureAnomalyTitle, surfaceAnomalyMapDisplayDateIso, language),
        dateIso: surfaceAnomalyMapDisplayDateIso,
        freshness: surfaceAnomalyFreshness,
      },
      {
        key: "map-sst",
        scaleTicks: ["0", "5", "10", "15", "20", "25", "30", "35"],
        caption: language === "hu" ? "Tengerfelszíni hőmérséklet" : "Sea surface temperature",
        product: "OISST",
        baselineLabel: null,
        title: t.mapSstTitle,
        subtitle: sstSubtitle,
        imageUrl: sstImageCandidates.imageUrl,
        fallbackImageUrls: sstImageCandidates.fallbackImageUrls,
        imageAlt: formatMapImageAlt(t.mapSstTitle, sstMapDisplayDateIso, language),
        dateIso: sstMapDisplayDateIso,
        freshness: sstFreshness,
      },
      {
        key: "map-sst-anomaly",
        scaleTicks: ["-9", "-7", "-5", "-4", "-3", "-2", "-1", "-0.5", "0", "0.5", "1", "2", "3", "4", "5", "7", "9"],
        caption: language === "hu" ? "Tengerfelszíni hőmérsékleti anomália" : "Sea surface temperature anomaly",
        product: "OISST",
        baselineLabel: language === "hu" ? "az 1971–2000-es átlaghoz képest" : "vs 1971–2000",
        title: t.mapSstAnomalyTitle,
        subtitle: sstSubtitle,
        imageUrl: sstAnomalyImageCandidates.imageUrl,
        fallbackImageUrls: sstAnomalyImageCandidates.fallbackImageUrls,
        imageAlt: formatMapImageAlt(t.mapSstAnomalyTitle, sstAnomalyMapDisplayDateIso, language),
        dateIso: sstAnomalyMapDisplayDateIso,
        freshness: sstAnomalyFreshness,
      },
    ];
  }, [snapshot.updatedAtIso, dataSource.maps, language, t]);

  const renderIndicatorPanel = (
    metric: ClimateMetricSeries,
    lines: Array<{ year: number; points: Array<[number, number]> }>,
    currentYear: number,
    climatology: DailyClimatologyEnvelope | null,
    variant: "detail" | "overview" = "detail"
  ) => {
    const bounds = indicatorYAxisBounds(metric.key);
    const yAxisLabel = indicatorYAxisUnitLabel(metric.key, language);
    const freshness = metricFreshnessBadge(metric, language, t);
    const isOverview = variant === "overview";
    const latestDateIso = metric.points[metric.points.length - 1]?.date ?? null;
    const dailyContext = dailyContextByKey.get(metric.key);
    if (dailyContext) {
      return (
        <DailyContextPanel
          key={metric.key}
          anchorId={`chart-${metric.key}`}
          title={metricTitle(metric, language)}
          subtitle={formatSourceShortName(metric.source.shortName, language)}
          data={dailyContext}
          unit={cardUnitLabel(metric.key, metric.unit, language)}
          axisUnit={LOW_RECORD_KEYS.has(metric.key) ? "M km²" : undefined}
          decimals={metric.decimals}
          language={language}
          monthLabels={monthlyLabels}
          compact={compact}
          dark={resolvedTheme === "dark"}
          ready={runtimeDataReady}
          latestDateLabel={formatDateLabel(latestDateIso, language)}
          anomaly={DAILY_CONTEXT_ANOMALY_KEYS.has(metric.key)}
          thresholds={metric.key === NINO34_SST_ANOMALY_KEY ? NINO34_THRESHOLDS[language] : undefined}
          extraChip={
            metric.key === NINO34_SST_ANOMALY_KEY && dailyContext.latest ? ensoPhaseChip(dailyContext.latest.value, language) : null
          }
          summary={isOverview}
          freshnessLabel={freshness.label}
          freshnessTone={freshness.tone}
          expandLabel={t.chartFullscreenEnter}
          collapseLabel={t.chartFullscreenExit}
        />
      );
    }
    const overviewMeta =
      isOverview && latestDateIso ? (
        <p className="panel-status-line">
          <span className={`status-date tone-${freshness.tone}`} title={freshness.label}>
            <span className="status-dot" aria-hidden="true" />
            <time dateTime={latestDateIso}>{formatDateLabel(latestDateIso, language)}</time>
          </span>
          <span>{language === "hu" ? "napi" : "daily"}</span>
          <span>{t.overviewClimatologySubtitle}</span>
        </p>
      ) : undefined;

    return (
      <EChartsPanel
        key={metric.key}
        anchorId={`chart-${metric.key}`}
        title={metricTitle(metric, language)}
        subtitle={isOverview ? undefined : formatSourceShortName(metric.source.shortName, language)}
        meta={overviewMeta}
        showExpand={!isOverview}
        expandLabel={t.chartFullscreenEnter}
        collapseLabel={t.chartFullscreenExit}
        freshnessLabel={isOverview ? undefined : freshness.label}
        freshnessTone={freshness.tone}
        option={buildClimateMonthlyComparisonOption({
          monthLabels: monthlyLabels,
          lines,
          unit: cardUnitLabel(metric.key, metric.unit, language),
          decimals: metric.decimals,
          yAxisMin: bounds.min,
          yAxisMax: bounds.max,
          yAxisUnitLabel: yAxisLabel,
          climatology:
            climatology && !isOverview
              ? {
                  ...climatology,
                  meanLabel: t.climatologyMeanLabel,
                }
              : undefined,
          compact,
          showLegend: !isOverview,
          dark: resolvedTheme === "dark",
          yearColors: buildIndicatorYearColors(currentYear, metric.key, resolvedTheme === "dark"),
          labels: {
            noData: t.noData,
          },
        })}
      />
    );
  };

  const renderTrendContextPanel = (metric: ClimateMetricSeries, overrides?: { title?: string; subtitle?: string }) => {
    const context = trendContextByKey.get(metric.key);
    if (!context) return null;
    const freshness = metricFreshnessBadge(metric, language, t);
    const unit = cardUnitLabel(metric.key, metric.unit, language);
    return (
      <TrendContextPanel
        key={metric.key}
        anchorId={`chart-${metric.key}`}
        title={overrides?.title ?? metricTitle(metric, language)}
        subtitle={overrides?.subtitle ?? formatSourceShortName(metric.source.shortName, language)}
        data={context.data}
        variant={context.variant}
        domain={metricChartDomain(metric.key)}
        unit={unit}
        axisUnit={unit.replace(/^× /, "")}
        decimals={metric.decimals}
        language={language}
        compact={compact}
        dark={resolvedTheme === "dark"}
        ready={runtimeDataReady}
        baseline={
          context.variant === "imbalance"
            ? { label: "2001–2010", mean: meanBetweenYears(context.data, 2001, 2010) }
            : undefined
        }
        freshnessLabel={freshness.label}
        freshnessTone={freshness.tone}
        expandLabel={t.chartFullscreenEnter}
        collapseLabel={t.chartFullscreenExit}
      />
    );
  };

  const renderIndicatorSubsection = (
    key: IndicatorSubsectionKey,
    title: string,
    note: string,
    content: ReactNode
  ) => {
    if (!indicatorTopics.find((topic) => topic.key === indicatorTopic)?.sections.includes(key)) return null;
    return (
      <div className="climate-subsection" key={key} id={`section-${key}`} data-toc-anchor="">
        <div className="climate-subsection-header">
          <div className="climate-subsection-heading">
            <h2>{title}</h2>
            <p>{note}</p>
          </div>
        </div>
        <div className="climate-subsection-content">{content}</div>
      </div>
    );
  };

  // Temperature anomalies below the baseline read as cool: shown in the ocean blue instead of the warm accent.
  const isNegativeAnomaly = (metric: ClimateMetricSeries | null | undefined) =>
    metric != null && metric.key.includes("anomaly") && metric.latestValue != null && metric.latestValue < 0;

  const forcingGasMetrics = useMemo(() => snapshot.forcing.filter((metric) => forcingGasLabel(metric.key) != null), [snapshot.forcing]);
  const forcingOtherMetrics = useMemo(() => snapshot.forcing.filter((metric) => forcingGasLabel(metric.key) == null), [snapshot.forcing]);
  const renderChemicalFormula = (formula: string) =>
    formula.split(/([₀-₉]+)/).map((part, index) =>
      /[₀-₉]/.test(part) ? (
        <sub key={index}>{String.fromCharCode(...[...part].map((char) => char.charCodeAt(0) - 0x2080 + 48))}</sub>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      )
    );
  const renderForcingPanel = (metric: ClimateMetricSeries) => {
    const context = forcingContextByKey.get(metric.key);
    if (!context) return null;
    const freshness = metricFreshnessBadge(metric, language, t);
    // The AGGI is a ratio to 1990, so it has no unit to show.
    const unit = metric.key === "atmospheric_aggi" ? "" : metric.unit;
    return (
      <TrendContextPanel
        key={metric.key}
        anchorId={`chart-${metric.key}`}
        title={metricTitle(metric, language)}
        subtitle={formatSourceShortName(metric.source.shortName, language)}
        data={context.data}
        variant={context.variant}
        domain="forcing"
        unit={unit}
        decimals={metric.decimals}
        language={language}
        compact={compact}
        dark={resolvedTheme === "dark"}
        ready={runtimeDataReady}
        preindustrial={PREINDUSTRIAL_LEVELS[metric.key]}
        freshnessLabel={freshness.label}
        freshnessTone={freshness.tone}
        expandLabel={t.chartFullscreenEnter}
        collapseLabel={t.chartFullscreenExit}
      />
    );
  };

  const renderPageIntro = (eyebrow: string, title: string, description: string) => (
    <div className="indicator-page-intro">
      <div className="indicator-topic-copy">
        <span className="indicator-topic-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
  const renderPageSubsection = (title: string, note: string, content: ReactNode, action?: ReactNode, id?: string) => (
    <div className="climate-subsection" id={id} data-toc-anchor={id ? "" : undefined}>
      <div className="climate-subsection-header">
        <div className="climate-subsection-heading">
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
        {action}
      </div>
      <div className="climate-subsection-content">{content}</div>
    </div>
  );

  const sourceModeLabel =
    snapshot.sourceMode === "live"
      ? t.sourceLive
      : snapshot.sourceMode === "mixed"
        ? t.sourceMixed
        : t.sourceBundled;
  const sourceModeNote =
    snapshot.sourceMode === "live"
      ? t.sourceLiveNote
      : snapshot.sourceMode === "mixed"
        ? t.sourceMixedNote
        : t.sourceBundledNote;
  const footerWarnings = useMemo(
    () => uniqueNonEmptyStrings([...snapshot.warnings, ...(dataSource.mapWarnings ?? [])]),
    [snapshot.warnings, dataSource.mapWarnings]
  );
  const groupedFooterSources = useMemo(() => {
    const grouped = new Map<DataSourceSection, typeof footerSources>();
    const seenUrls = new Set<string>();
    for (const source of footerSources) {
      if (!source.url || seenUrls.has(source.url)) continue;
      seenUrls.add(source.url);
      const entries = grouped.get(source.section) ?? [];
      entries.push(source);
      grouped.set(source.section, entries);
    }
    const order: DataSourceSection[] = ["temperature", "ocean", "ice", "forcing", "maps", "outlook"];
    return order
      .map((section) => ({ section, sources: grouped.get(section) ?? [] }))
      .filter((group) => group.sources.length > 0);
  }, [footerSources]);
  const normalizedSourceQuery = sourceQuery.trim().toLocaleLowerCase();
  const filteredSourceGroups = groupedFooterSources
    .map((group) => ({
      ...group,
      sources: group.sources.filter((source) =>
        `${source.title} ${source.provider} ${dataSourceSectionTitle(group.section, t)}`.toLocaleLowerCase().includes(normalizedSourceQuery)
      ),
    }))
    .filter((group) => group.sources.length);
  const filteredSourceCount = filteredSourceGroups.reduce((total, group) => total + group.sources.length, 0);
  const uniqueFooterSources = groupedFooterSources.flatMap((group) => group.sources);
  const sourceProviderCount = new Set(uniqueFooterSources.map((source) => source.provider.split(/[\s(]/)[0])).size;
  const sourceFreshnessCounts = uniqueFooterSources.reduce(
    (counts, source) => {
      if (source.freshness) counts[source.freshness.tone] += 1;
      return counts;
    },
    { fresh: 0, warning: 0, stale: 0 } as Record<FreshnessTone, number>
  );
  const ensoOutlookFreshness = ensoFreshnessBadge(ensoOutlook, language, t);
  const dailyGlobalMeanAnomalyFreshness = dailyGlobalMeanAnomalyMetric
    ? metricFreshnessBadge(dailyGlobalMeanAnomalyMetric, language, t)
    : null;
  const earthEnergyImbalanceFreshness = earthEnergyImbalanceMetric
    ? metricFreshnessBadge(earthEnergyImbalanceMetric, language, t)
    : null;
  const projectionFreshness = ensoOutlookFreshness ?? dailyGlobalMeanAnomalyFreshness;
  const currentYear = new Date().getFullYear();
  const warmingEstimateHeading =
    language === "hu" ? `${t.warmingEstimateTitle} ${currentYear}-${hungarianInessiveSuffix(currentYear)}` : `${currentYear} ${t.warmingEstimateTitle}`;
  const projectionNumberFormat = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    minimumFractionDigits: dailyGlobalMeanAnomalyMetric?.decimals ?? 2,
    maximumFractionDigits: dailyGlobalMeanAnomalyMetric?.decimals ?? 2,
  });
  const projectionPercentFormat = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const projectionSupportSource = ensoOutlook?.sourceLabel ?? dailyGlobalMeanAnomalyMetric?.source.shortName ?? null;
  const projectionSupportLabel = projectionSupportSource ? formatSourceShortName(projectionSupportSource, language) : null;
  const projectionUnitLabel = cardUnitLabel(
    DAILY_GLOBAL_MEAN_ANOMALY_KEY,
    dailyGlobalMeanAnomalyMetric?.unit ?? "°C",
    language
  );
  const outlookIntervalMarker = projectedAnnualGlobalMeanAnomaly
    ? (() => {
        const span = projectedAnnualGlobalMeanAnomaly.high - projectedAnnualGlobalMeanAnomaly.low || 1;
        return clamp(((projectedAnnualGlobalMeanAnomaly.value - projectedAnnualGlobalMeanAnomaly.low) / span) * 100, 0, 100);
      })()
    : null;
  const outlookMiniChartScale = projectedAnnualGlobalMeanAnomaly
    ? (() => {
        const values = [
          ...outlookMiniChartBars.map((bar) => bar.value),
          projectedAnnualGlobalMeanAnomaly.recordThreshold,
          projectedAnnualGlobalMeanAnomaly.low,
          projectedAnnualGlobalMeanAnomaly.high,
          1.5,
        ].filter(Number.isFinite);
        const min = Math.min(...values) - 0.08;
        const max = Math.max(...values) + 0.08;
        const span = max - min || 1;
        return {
          min,
          max,
          barPercent: (value: number) => clamp(((value - min) / span) * 100, 4, 100),
          linePercent: (value: number) => clamp(100 - ((value - min) / span) * 100, 0, 100),
        };
      })()
    : null;
  const nextThemeMode: ThemeMode = themeMode === "light" ? "dark" : themeMode === "dark" ? "system" : "light";
  const themeModeLabel = (mode: ThemeMode) => (mode === "light" ? t.themeLight : mode === "dark" ? t.themeDark : t.themeSystem);
  const setDashboardView = (view: DashboardView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${view}`);
    }
  };
  /** Open a Climate system topic (from the Overview's links, for example). */
  const openClimateSystemTopic = (topic: string) => {
    setIndicatorTopic(topic);
    setDashboardView("climate-system");
  };
  const navItems: Array<{ view: DashboardView; label: string; icon: ToolkitIconName; available: boolean }> = [
    { view: "overview", label: t.navOverview, icon: "home", available: true },
    { view: "climate-system", label: t.navIndicators, icon: "bars", available: true },
    { view: "maps", label: t.mapsSectionTitle, icon: "map", available: true },
    { view: "projections", label: t.projectionsTitle, icon: "trend", available: projectedAnnualGlobalMeanAnomaly != null },
    { view: "sources", label: t.sourceCardsTitle, icon: "reports", available: true },
  ];
  const navGroups: Array<{ key: string; label: string; views: DashboardView[] }> = [
    { key: "monitor", label: t.navGroupMonitor, views: ["overview", "climate-system"] },
    { key: "explore", label: t.navGroupExplore, views: ["maps", "projections"] },
    { key: "system", label: t.navGroupSystem, views: ["sources"] },
  ];
  const pageTitle =
    activeView === "overview"
      ? t.overviewTitle
      : activeView === "climate-system"
        ? t.climateIndicatorsTitle
        : activeView === "maps"
          ? t.mapsSectionTitle
          : activeView === "projections"
            ? t.projectionsTitle
            : t.sourceCardsTitle;
  const pageSubtitle =
    activeView === "overview"
      ? t.overviewSubtitle
      : activeView === "climate-system"
        ? t.climateIndicatorsNote
        : activeView === "maps"
          ? t.mapsSectionNote
          : activeView === "projections"
            ? t.projectionsNote
                : sourceModeLabel;
  const formatMetricDelta = (metric: ClimateMetricSeries) => {
    const latestIndex = metric.points.length - 1;
    if (latestIndex <= 0) return null;
    const latest = metric.points[latestIndex];
    const previous = metric.points[latestIndex - 1];
    const delta = latest.value - previous.value;
    if (!Number.isFinite(delta) || Math.abs(delta) < Number.EPSILON) return null;
    const sign = delta > 0 ? "+" : "";
    return {
      direction: delta > 0 ? "up" : "down",
      label: `${sign}${formatNumericValue(delta, metric.decimals, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)} ${t.deltaSincePrevious}`,
    };
  };
  const renderLoadingValue = (className = "value-loading-skeleton") => (
    <span className={className} role="status" aria-live="polite">
      <span className="visually-hidden">{t.valuesLoading}</span>
    </span>
  );
  const renderPrimaryValue = (value: string, className?: string) =>
    runtimeDataReady ? value : renderLoadingValue(className);
  const renderMetricValue = (metric: ClimateMetricSeries, className?: string) =>
    renderPrimaryValue(
      `${formatMetricValue(metric, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)}`,
      className
    );
  const heroDelta = dailyGlobalMeanAnomalyMetric ? formatMetricDelta(dailyGlobalMeanAnomalyMetric) : null;
  const heroRecordPoint = dailyGlobalMeanAnomalyMetric ? latestRecordHighPoint(dailyGlobalMeanAnomalyMetric) : null;
  const sparklineReadout = (metric: ClimateMetricSeries, label = metricTitle(metric, language)): SparklineReadout => ({
    label: `${label}. ${language === "hu" ? "A nyílbillentyűkkel léptethető" : "Use arrow keys to explore"}`,
    formatValue: (value) =>
      `${value > 0 && metric.key.includes("anomaly") ? "+" : ""}${formatNumericValue(value, metric.decimals, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)}`,
    formatDate: (dateIso) => formatDateLabel(dateIso, language),
    previousYearLabel: language === "hu" ? "Egy évvel korábban" : "A year earlier",
  });
  const overviewMetricCards = [
    (() => {
      const metric = metricByKey.get("global_surface_temperature_anomaly");
      if (!metric) return null;
      const delta = formatMetricDelta(metric);
      return {
        key: "overview-surface-anomaly",
        title: t.overviewSurfaceAnomalyTitle,
        subtitle: t.overviewClimatologySubtitle,
        value: `${formatMetricValue(metric, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)}`,
        meta: `${t.chartLatest}: ${formatDateLabel(metric.latestDate, language)}`,
        delta: delta?.label ?? metricFreshnessBadge(metric, language, t).label,
        icon: "temperature" as ToolkitIconName,
        tone: "temperature",
        points: metric.points,
        metric,
      };
    })(),
    (() => {
      const metric = metricByKey.get("global_sea_surface_temperature_anomaly");
      if (!metric) return null;
      const delta = formatMetricDelta(metric);
      return {
        key: "overview-sst-anomaly",
        title: t.overviewSstAnomalyTitle,
        subtitle: t.overviewClimatologySubtitle,
        value: `${formatMetricValue(metric, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)}`,
        meta: `${t.chartLatest}: ${formatDateLabel(metric.latestDate, language)}`,
        delta: delta?.label ?? metricFreshnessBadge(metric, language, t).label,
        icon: "ocean" as ToolkitIconName,
        tone: "info",
        points: metric.points,
        metric,
      };
    })(),
    (() => {
      const metric = metricByKey.get("arctic_sea_ice_extent") ?? metricByKey.get("global_sea_ice_extent");
      if (!metric) return null;
      const delta = formatMetricDelta(metric);
      return {
        key: "overview-sea-ice",
        title: metric.key === "arctic_sea_ice_extent" ? t.overviewArcticSeaIceTitle : metricTitle(metric, language),
        subtitle: language === "hu" ? "Abszolút kiterjedés" : "Absolute extent",
        value: `${formatMetricValue(metric, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)}`,
        meta: `${t.chartLatest}: ${formatDateLabel(metric.latestDate, language)}`,
        delta: delta?.label ?? metricFreshnessBadge(metric, language, t).label,
        icon: "snow" as ToolkitIconName,
        tone: "purple",
        points: metric.points,
        metric,
      };
    })(),
    (() => {
      const metric = metricByKey.get("atmospheric_co2");
      if (!metric) return null;
      const delta = formatMetricDelta(metric);
      return {
        key: "overview-co2",
        title: t.overviewCo2Title,
        subtitle: t.overviewAtmosphericSubtitle,
        value: `${formatMetricValue(metric, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)}`,
        meta: `${t.chartLatest}: ${formatDateLabel(metric.latestDate, language)}`,
        delta: delta?.label ?? metricFreshnessBadge(metric, language, t).label,
        icon: "leaf" as ToolkitIconName,
        tone: "success",
        points: metric.points,
        metric,
      };
    })(),
  ].filter((card): card is NonNullable<typeof card> => card != null);
  const overviewMapCardKey: Record<OverviewMapMode, string> = {
    temperature: "map-2m-temperature",
    anomaly: "map-2m-temperature-anomaly",
    sst: "map-sst",
    "sst-anomaly": "map-sst-anomaly",
  };
  const overviewMapDomain: "air" | "ocean" = overviewMapMode === "sst" || overviewMapMode === "sst-anomaly" ? "ocean" : "air";
  const overviewMapView: "anomaly" | "absolute" = overviewMapMode === "anomaly" || overviewMapMode === "sst-anomaly" ? "anomaly" : "absolute";
  const overviewMapModeFor = (domain: "air" | "ocean", view: "anomaly" | "absolute"): OverviewMapMode =>
    domain === "air" ? (view === "anomaly" ? "anomaly" : "temperature") : view === "anomaly" ? "sst-anomaly" : "sst";
  const overviewMapCard = mapCards.find((card) => card.key === overviewMapCardKey[overviewMapMode]) ?? null;
  const overviewRegionalSignals = regionalTemperatureAnomalyLines.slice(0, 4).map(({ metric }) => ({
    key: metric.key,
    title: metricTitle(metric, language),
    value: `${formatMetricValue(metric, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)}`,
    tone: (metric.latestValue ?? 0) < 0 ? "cool" : "warm",
    points: metric.points,
    metric,
  }));
  const ensoOverviewRows = [
    ensoOutlook?.nextThreeMonths
      ? {
          key: "next-three-months",
          horizon: t.ensoNextThreeMonths,
          window: ensoOutlook.nextThreeMonths,
        }
      : null,
    ensoOutlook?.nextSixMonths
      ? {
          key: "next-six-months",
          horizon: t.ensoNextSixMonths,
          window: ensoOutlook.nextSixMonths,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row != null);
  const ensoOverviewCondition =
    ensoOutlook?.nextThreeMonths?.condition ?? ensoOutlook?.nextSixMonths?.condition ?? "neutral";
  // Memoized: they feed the Climate system contents list, which must stay stable between renders.
  const dailyNino34Line = useMemo(
    () => regionalTemperatureLines.find(({ metric }) => metric.key === "daily_nino34_sea_surface_temperature") ?? null,
    [regionalTemperatureLines]
  );
  const dailyNino34AnomalyLine = useMemo(
    () => indicatorLines.find(({ metric }) => metric.key === NINO34_SST_ANOMALY_KEY) ?? null,
    [indicatorLines]
  );
  const ensoIndexMetrics = useMemo(() => variabilityMetrics.filter((metric) => ENSO_INDEX_KEYS.has(metric.key)), [variabilityMetrics]);
  const circulationIndexMetrics = useMemo(
    () => variabilityMetrics.filter((metric) => !ENSO_INDEX_KEYS.has(metric.key)),
    [variabilityMetrics]
  );
  const ensoOutlookWindow = ensoOutlook?.nextThreeMonths ?? ensoOutlook?.nextSixMonths ?? null;
  // Titles and notes of the Climate system sections that came from the former
  // Forcing and Variability pages, shared by the page and its navigation.
  const climateSystemSectionCopy = useMemo(
    () =>
      language === "hu"
        ? {
            forcingGases: {
              title: "Üvegházhatású gázok",
              note: "A három legfontosabb, hosszú légköri élettartamú üvegházhatású gáz koncentrációja a NOAA globális mérőhálózatának adatai alapján.",
            },
            forcingCombined: {
              title: "Összesített hatás és a Nap",
              note: "Az éves üvegházhatásúgáz-index az összes gáz együttes melegítő hatását az 1990-es szinthez viszonyítja; a beérkező napsugárzás természetes ingadozása ehhez képest csekély.",
            },
            enso: {
              title: "El Niño–déli oszcilláció",
              note: "Az ENSO az évről évre jelentkező globális hőmérséklet-ingadozás legfőbb forrása. A napi Niño 3.4 tengerfelszíni hőmérséklet a legfrissebb óceáni állapotot, alatta az 1991–2020-as átlaghoz mért napi anomáliája mutatja, az ONI ennek háromhavi anomáliáját, az SOI pedig a légkör válaszát; az IRI előrejelzése a következő évszakok valószínűségeit adja meg.",
            },
            circulation: {
              title: "Légköri cirkulációs mintázatok",
              note: "Az északi félteke időjárását alakító légnyomási mintázatok. Pozitív és negatív fázisuk a futóáramlás helyzetét, a téli hidegbetöréseket és a ciklonok útvonalát befolyásolja.",
            },
          }
        : {
            forcingGases: {
              title: "Greenhouse gases",
              note: "Atmospheric concentrations of the three most important long-lived greenhouse gases from NOAA's global monitoring network.",
            },
            forcingCombined: {
              title: "Combined effect and the Sun",
              note: "The annual greenhouse gas index measures the combined heating effect of all gases against 1990; natural swings in incoming solar energy are small by comparison.",
            },
            enso: {
              title: "El Niño–Southern Oscillation",
              note: "ENSO is the largest source of year-to-year swings in global temperature. Daily Niño 3.4 sea surface temperature shows the latest ocean state, with its daily anomaly against the 1991-2020 baseline below it, ONI its three-month anomaly and SOI the atmospheric response; the IRI outlook gives probabilities for the coming seasons.",
            },
            circulation: {
              title: "Atmospheric circulation modes",
              note: "Pressure patterns that steer Northern Hemisphere weather. Their positive and negative phases shift the jet stream, winter cold outbreaks and storm tracks.",
            },
          },
    [language]
  );
  // Indicators navigation: one contents list (topics → sections → charts with
  // their latest values) for the desktop side rail and the mobile jump sheet.
  // It mirrors exactly what the page renders below.
  const indicatorNavTopics = useMemo<IndicatorNavTopic[]>(() => {
    const navValue = (value: number | null | undefined, decimals: number, unit: string, signed = false) => {
      if (value == null || !Number.isFinite(value)) return undefined;
      const formatted = formatNumericValue(value, decimals, language, "").replace(/^-/, "−");
      return `${signed && value > 0 ? "+" : ""}${formatted}${unit ? ` ${unit}` : ""}`;
    };
    const signedKeys = new Set<string>([...DAILY_CONTEXT_ANOMALY_KEYS, ...ICE_SHEET_AND_GLACIER_KEYS, EARTH_ENERGY_IMBALANCE_KEY]);
    const metricChart = (metric: ClimateMetricSeries) => ({
      id: `chart-${metric.key}`,
      title: metricTitle(metric, language),
      value: navValue(
        metric.latestValue,
        metric.decimals,
        cardUnitLabel(metric.key, metric.unit, language),
        signedKeys.has(metric.key) && !ICE_SHEET_LOSS_KEYS.has(metric.key)
      ),
    });
    // Forcing records carry their own unit (the AGGI none); variability indices are signed, ONI in °C.
    const plainChart = (metric: ClimateMetricSeries) => ({
      id: `chart-${metric.key}`,
      title: metricTitle(metric, language),
      value: navValue(metric.latestValue, metric.decimals, metric.key === "atmospheric_aggi" ? "" : metric.unit),
    });
    const indexChart = (metric: ClimateMetricSeries) => ({
      id: `chart-${metric.key}`,
      title: metricTitle(metric, language),
      value: navValue(metric.latestValue, metric.decimals, metric.key === "nino34_index" ? "°C" : "", true),
    });
    const anomalyCharts = [
      ...anomalyTemperatureLines.map(({ metric }) => metricChart(metric)),
      ...(dailyGlobalMeanAnomalyMetric && dailyWarmingContext
        ? [
            {
              id: "chart-daily-global-mean-anomaly",
              title: t.dailyGlobalTemperatureAnomalyTitle,
              value: navValue(dailyWarmingContext.rawSeries?.[dailyWarmingContext.rawSeries.length - 1]?.[1], dailyGlobalMeanAnomalyMetric.decimals, "°C", true),
            },
          ]
        : []),
      ...(dailyGlobalMeanAnomalyMetric && annualWarmingContext
        ? [
            {
              id: "chart-annual-global-mean-anomaly",
              title: t.annualGlobalTemperatureAnomalyTitle,
              value: navValue(annualWarmingContext.latest.value, dailyGlobalMeanAnomalyMetric.decimals, "°C", true),
            },
          ]
        : []),
    ];
    const sectionCharts: Record<IndicatorSubsectionKey, { title: string; charts: IndicatorNavTopic["sections"][number]["charts"] }> = {
      globalTemperatures: { title: t.globalTemperaturesSectionTitle, charts: globalTemperatureLines.map(({ metric }) => metricChart(metric)) },
      temperatureAnomalies: { title: t.temperatureAnomalySectionTitle, charts: anomalyCharts },
      regionalTemperatures: { title: t.regionalTemperaturesSectionTitle, charts: regionalTemperatureLines.map(({ metric }) => metricChart(metric)) },
      regionalTemperatureAnomalies: {
        title: t.regionalTemperatureAnomaliesSectionTitle,
        charts: regionalTemperatureAnomalyLines.map(({ metric }) => metricChart(metric)),
      },
      oceans: { title: t.oceansSectionTitle, charts: oceanMetrics.map(metricChart) },
      earthEnergyImbalance: {
        title: t.earthEnergyImbalanceSectionTitle,
        charts:
          earthEnergyImbalanceMetric && earthEnergyImbalanceTrendPoints.length
            ? [
                {
                  id: `chart-${earthEnergyImbalanceMetric.key}`,
                  title: t.earthEnergyImbalanceTitle,
                  value: navValue(earthEnergyImbalanceLatestMean, 2, "W/m²", true),
                },
              ]
            : [],
      },
      seaIce: { title: t.seaIceSectionTitle, charts: seaIceIndicatorLines.map(({ metric }) => metricChart(metric)) },
      snowCover: { title: t.snowCoverSectionTitle, charts: snowCoverIndicatorLines.map(({ metric }) => metricChart(metric)) },
      iceSheetsAndGlaciers: { title: t.iceSheetsAndGlaciersSectionTitle, charts: iceSheetAndGlacierMetrics.map(metricChart) },
      forcingGases: { title: climateSystemSectionCopy.forcingGases.title, charts: forcingGasMetrics.map(plainChart) },
      forcingCombined: { title: climateSystemSectionCopy.forcingCombined.title, charts: forcingOtherMetrics.map(plainChart) },
      enso: {
        title: climateSystemSectionCopy.enso.title,
        charts: [
          ...(ensoOutlookWindow
            ? [
                {
                  id: "chart-enso-outlook",
                  title: t.ensoOutlookTitle,
                  value:
                    ensoOutlookWindow.probability != null
                      ? `${ensoOutlookWindow.probability}% ${formatEnsoConditionLabel(ensoOutlookWindow.condition, t)}`
                      : undefined,
                },
              ]
            : []),
          ...(dailyNino34Line ? [metricChart(dailyNino34Line.metric)] : []),
          ...(dailyNino34AnomalyLine ? [metricChart(dailyNino34AnomalyLine.metric)] : []),
          ...ensoIndexMetrics.map(indexChart),
        ],
      },
      circulation: { title: climateSystemSectionCopy.circulation.title, charts: circulationIndexMetrics.map(indexChart) },
    };
    return indicatorTopics.map((topic) => ({
      key: topic.key,
      label: language === "hu" ? topic.hu : topic.en,
      group: (() => {
        const group = climateSystemGroups.find((entry) => entry.key === topic.group);
        return group ? (language === "hu" ? group.hu : group.en) : undefined;
      })(),
      sections: topic.sections
        .map((key) => ({ id: `section-${key}`, ...sectionCharts[key as IndicatorSubsectionKey] }))
        .filter((section) => section.charts.length > 0),
    }));
    // indicatorTopics is a constant list rebuilt each render; its content only changes with language.
  }, [
    language,
    t,
    globalTemperatureLines,
    anomalyTemperatureLines,
    regionalTemperatureLines,
    regionalTemperatureAnomalyLines,
    oceanMetrics,
    seaIceIndicatorLines,
    snowCoverIndicatorLines,
    iceSheetAndGlacierMetrics,
    dailyGlobalMeanAnomalyMetric,
    dailyWarmingContext,
    annualWarmingContext,
    earthEnergyImbalanceMetric,
    earthEnergyImbalanceTrendPoints,
    earthEnergyImbalanceLatestMean,
    forcingGasMetrics,
    forcingOtherMetrics,
    ensoOutlookWindow,
    dailyNino34Line,
    dailyNino34AnomalyLine,
    ensoIndexMetrics,
    circulationIndexMetrics,
    climateSystemSectionCopy,
  ]);
  const indicatorScrollSpy = useIndicatorScrollSpy(indicatorNavTopics.find((topic) => topic.key === indicatorTopic));
  const jumpToIndicator = useIndicatorJump(indicatorTopic, setIndicatorTopic);
  // Choosing a topic while scrolled into the page starts the new topic at its
  // top, once it has rendered (its height differs from the old topic's).
  const selectIndicatorTopic = (key: string) => {
    const section = document.getElementById("climate-system");
    if (section && section.getBoundingClientRect().top < 0) jumpToIndicator(key, "climate-system");
    else setIndicatorTopic(key);
  };
  const indicatorNavProps = {
    topics: indicatorNavTopics,
    activeTopic: indicatorTopic,
    active: indicatorScrollSpy,
    ready: runtimeDataReady,
    language,
    onSelectTopic: selectIndicatorTopic,
    onJump: jumpToIndicator,
  };
  // Projections: the same navigation over one page-level topic, its chapters as sections.
  const projectionNavTopics = useMemo<IndicatorNavTopic[]>(() => {
    const format = (value: number) =>
      `${value > 0 ? "+" : ""}${new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
    const pathwayEnds = pathwaysData?.scenarios.map((scenario) => scenario.end) ?? [];
    const tippingWithin = tippingLadderItems.filter((item) => item.state !== "below").length;
    return [
      {
        key: "projections",
        label: t.projectionsTitle,
        sections: [
          {
            id: "section-warming-estimate",
            title: warmingEstimateHeading,
            charts: [
              {
                id: "chart-warming-estimate",
                title: t.projectedAnnualTemperatureAnomalyChartTitle,
                value: projectedAnnualGlobalMeanAnomaly ? `${format(projectedAnnualGlobalMeanAnomaly.value)} °C` : undefined,
              },
            ],
          },
          ...(pathwaysData
            ? [
                {
                  id: "section-warming-pathways",
                  title: t.longRangeTemperatureHorizonTitle,
                  charts: [
                    {
                      id: "chart-warming-pathways",
                      title: t.longRangeTemperatureTrendTitle,
                      value: `${format(Math.min(...pathwayEnds))}–${format(Math.max(...pathwayEnds)).replace("+", "")} °C`,
                    },
                  ],
                },
              ]
            : []),
          {
            id: "section-tipping-points",
            title: t.tippingPointsTitle,
            charts: [
              {
                id: "chart-tipping-points",
                title: language === "hu" ? "Billenési küszöbök közös skálán" : "Tipping thresholds on a shared scale",
                value: `${tippingWithin}/${tippingLadderItems.length}`,
              },
            ],
          },
        ],
      },
    ];
  }, [language, t, warmingEstimateHeading, projectedAnnualGlobalMeanAnomaly, pathwaysData, tippingLadderItems]);
  const projectionScrollSpy = useIndicatorScrollSpy(activeView === "projections" ? projectionNavTopics[0] : undefined);
  const jumpToProjection = useIndicatorJump("projections", () => undefined);
  const projectionNavProps = {
    topics: projectionNavTopics,
    activeTopic: "projections",
    active: projectionScrollSpy,
    ready: runtimeDataReady,
    language,
    // The page's only topic: its button returns to the top of the page.
    onSelectTopic: () => jumpToProjection("projections", "projections"),
    onJump: jumpToProjection,
  };

  const ensoConditionTone = (condition: EnsoCondition) =>
    condition === "el_nino" ? "warm" : condition === "la_nina" ? "cool" : "neutral";
  const variabilityIndexPhase = (metric: ClimateMetricSeries): { tone: "warm" | "cool" | "neutral"; label: string } => {
    const value = metric.latestValue;
    if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.5) {
      return {
        tone: "neutral",
        label: metric.key === "nino34_index" ? t.ensoConditionNeutral : language === "hu" ? "Közel semleges" : "Near neutral",
      };
    }
    if (metric.key === "nino34_index") {
      return value > 0 ? { tone: "warm", label: t.ensoConditionElNino } : { tone: "cool", label: t.ensoConditionLaNina };
    }
    if (metric.key === "soi_index") {
      return value < 0
        ? { tone: "warm", label: language === "hu" ? "El Niño felé hajló" : "El Niño-leaning" }
        : { tone: "cool", label: language === "hu" ? "La Niña felé hajló" : "La Niña-leaning" };
    }
    return value > 0
      ? { tone: "warm", label: language === "hu" ? "Pozitív fázis" : "Positive phase" }
      : { tone: "cool", label: language === "hu" ? "Negatív fázis" : "Negative phase" };
  };
  const variabilitySignLabels = (key: ClimateMetricSeries["key"]): { warm: string; cool: string } => {
    if (key === "nino34_index") return { warm: t.ensoConditionElNino, cool: t.ensoConditionLaNina };
    if (key === "soi_index") {
      return language === "hu"
        ? { warm: "Negatív (El Niño felé)", cool: "Pozitív (La Niña felé)" }
        : { warm: "Negative (El Niño-like)", cool: "Positive (La Niña-like)" };
    }
    return language === "hu" ? { warm: "Pozitív fázis", cool: "Negatív fázis" } : { warm: "Positive phase", cool: "Negative phase" };
  };
  const renderVariabilityPanel = ({ metric, subtitle, data }: (typeof variabilityChartPanels)[number]) => {
    const freshness = metricFreshnessBadge(metric, language, t);
    const isOni = metric.key === "nino34_index";
    const signLabels = variabilitySignLabels(metric.key);
    return (
      <TrendContextPanel
        key={metric.key}
        anchorId={`chart-${metric.key}`}
        title={metricTitle(metric, language)}
        subtitle={subtitle}
        data={data}
        variant="index"
        domain="temperature"
        unit={isOni ? "°C" : ""}
        decimals={metric.decimals}
        language={language}
        compact={compact}
        dark={resolvedTheme === "dark"}
        ready={runtimeDataReady}
        index={{
          invert: metric.key === "soi_index",
          warmLabel: signLabels.warm,
          coolLabel: signLabels.cool,
          phase: { text: variabilityIndexPhase(metric).label, tone: variabilityIndexPhase(metric).tone },
          thresholds: isOni ? NINO34_THRESHOLDS[language] : undefined,
        }}
        freshnessLabel={freshness.label}
        freshnessTone={freshness.tone}
        expandLabel={t.chartFullscreenEnter}
        collapseLabel={t.chartFullscreenExit}
      />
    );
  };
  const renderEnsoOutlookCard = () => (
    <article className="overview-card enso-outlook-card enso-outlook-card-editorial">
      <div className="overview-card-header">
        <div>
          <h2>{t.ensoCardTitle}</h2>
          {runtimeDataReady && ensoOutlook?.issuedDate ? <p>{formatDateLabel(ensoOutlook.issuedDate, language)}</p> : null}
        </div>
        <ToolkitIcon name="info" className="info-icon" />
      </div>
      <div className="enso-editorial-hero">
        <span>{language === "hu" ? "Jelenlegi fázis" : "Current phase"}</span>
        <strong>
          {renderPrimaryValue(
            formatEnsoConditionLabel(ensoOverviewCondition, t),
            "value-loading-skeleton enso-status-loading"
          )}
        </strong>
      </div>
      <div
        className={`enso-phase-continuum phase-${ensoOverviewCondition}`}
        role="img"
        aria-label={`${language === "hu" ? "Jelenlegi fázis" : "Current phase"}: ${formatEnsoConditionLabel(ensoOverviewCondition, t)}`}
      >
        <div className="enso-phase-labels" aria-hidden="true">
          <span>{t.ensoConditionLaNina}</span>
          <span>{language === "hu" ? "Semleges" : "Neutral"}</span>
          <span>{t.ensoConditionElNino}</span>
        </div>
        <div className="enso-phase-track" aria-hidden="true">
          <span className="enso-phase-segment enso-phase-la-nina" />
          <span className="enso-phase-segment enso-phase-neutral" />
          <span className="enso-phase-segment enso-phase-el-nino" />
          <span className="enso-phase-marker" />
        </div>
      </div>
      <div className="enso-editorial-timeline">
        {ensoOverviewRows.map((row) => (
          <div className="enso-editorial-row" key={row.key}>
            <span className="enso-timeline-dot" aria-hidden="true" />
            <div className="enso-editorial-window">
              <span>{row.horizon}</span>
              {runtimeDataReady ? (
                <small>{formatEnsoTargetLabel(row.window.targetLabel, language)}</small>
              ) : (
                <small>{renderLoadingValue("value-loading-skeleton enso-window-meta-loading")}</small>
              )}
            </div>
            <div className="enso-editorial-forecast">
              <strong>{runtimeDataReady ? `${row.window.probability ?? "-"}%` : renderLoadingValue("value-loading-skeleton enso-window-loading")}</strong>
              <span>{formatEnsoConditionLabel(row.window.condition, t)}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
  const renderOverviewHero = () =>
    dailyGlobalMeanAnomalyMetric ? (
      <section className="overview-hero" aria-label={t.overviewDailyGlobalTemperatureAnomalyTitle}>
        <div className="overview-hero-main">
          <div className="overview-hero-copy">
            <div className="overview-hero-kicker">
              <h2 className="overview-hero-title">{t.overviewDailyGlobalTemperatureAnomalyTitle}</h2>
              <span className="overview-hero-baseline">{t.overviewPreindustrialSubtitle}</span>
            </div>
            <strong className="overview-hero-value">
              {renderMetricValue(dailyGlobalMeanAnomalyMetric, "value-loading-skeleton overview-value-loading")}
            </strong>
            <div className="overview-hero-chips">
              {runtimeDataReady ? (
                <>
                  <span
                    className={`overview-hero-chip status-date tone-${dailyGlobalMeanAnomalyFreshness?.tone ?? "fresh"}`}
                    title={dailyGlobalMeanAnomalyFreshness?.label}
                  >
                    <span className="status-dot" aria-hidden="true" />
                    {dailyGlobalMeanAnomalyMetric.latestDate ? (
                      <time dateTime={dailyGlobalMeanAnomalyMetric.latestDate}>
                        {formatDateLabel(dailyGlobalMeanAnomalyMetric.latestDate, language)}
                      </time>
                    ) : null}
                  </span>
                  {heroDelta ? <span className="overview-hero-chip">{heroDelta.label}</span> : null}
                  {heroRecordPoint ? (
                    <span className="overview-hero-chip record">
                      <ToolkitIcon name="up" className="hero-chip-icon" />
                      {t.heroRecordLabel}
                    </span>
                  ) : null}
                  {dailyGlobalMeanAnomalyFreshness && dailyGlobalMeanAnomalyFreshness.tone !== "fresh" ? (
                    <span className={`freshness-chip ${dailyGlobalMeanAnomalyFreshness.tone}`}>
                      {dailyGlobalMeanAnomalyFreshness.tone === "stale" ? t.freshnessStale : t.freshnessLagging}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <div className="overview-hero-spark">
            <Sparkline
              points={dailyGlobalMeanAnomalyMetric.points}
              className="hero-sparkline"
              strokeWidth={2.2}
              readout={sparklineReadout(dailyGlobalMeanAnomalyMetric, t.overviewDailyGlobalTemperatureAnomalyTitle)}
            />
            <span>{t.heroSparklineLabel}</span>
          </div>
        </div>
        {warmingStripes.length ? (
          <div className="warming-stripes" role="img" aria-label={t.warmingStripesAria}>
            {warmingStripes.map((stripe) => (
              <span
                key={stripe.year}
                style={{ background: warmingStripeColor(stripe.ratio) }}
                title={`${stripe.year}: ${formatNumericValue(stripe.value, 2, language, t.valueUnavailable)} °C`}
              />
            ))}
          </div>
        ) : null}
      </section>
    ) : null;
  // The summary is regenerated with each daily data update; older than that means the update stalled.
  const aiSummaryFreshnessTone = (generatedAtIso: string): FreshnessTone => {
    const ageDays = utcDayAge(extractIsoDate(generatedAtIso));
    return ageDays == null || ageDays > 7 ? "stale" : ageDays > 2 ? "warning" : "fresh";
  };
  const renderOverviewAiSummary = () => (
    <section className={`ai-summary-panel overview-ai-summary ${aiDashboardSummary.tone}`} aria-label={t.aiSummaryAria}>
      <div className="ai-summary-label-row">
        <h2 className="alert-kicker">
          <ToolkitIcon name="up" />
          {t.aiSummaryTitle}
        </h2>
      </div>
      {runtimeDataReady ? (
        <div className="ai-overview-signal-list">
          {aiOverviewItems.map((item) => (
            <article className={`ai-overview-signal tone-${item.tone}`} key={item.key}>
              <span className="ai-overview-signal-icon" aria-hidden="true">
                <SignalIcon topic={item.icon} />
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="ai-summary-loading" role="status" aria-live="polite">
          <span className="ai-summary-spinner" aria-hidden="true" />
          <span>{t.aiSummaryLoading}</span>
        </div>
      )}
      {runtimeDataReady && dataSource.aiSummary ? (
        <p className="ai-summary-meta">
          <span className={`status-date tone-${aiSummaryFreshnessTone(dataSource.aiSummary.generatedAtIso)}`}>
            <span className="status-dot" aria-hidden="true" />
            <time dateTime={dataSource.aiSummary.generatedAtIso}>
              {formatDateLabel(extractIsoDate(dataSource.aiSummary.generatedAtIso), language)}
            </time>
          </span>
          <span>
            {dataSource.aiSummary.source === "openai"
              ? language === "hu" ? "ChatGPT-vel készült" : "via ChatGPT"
              : language === "hu" ? "automatikus összefoglaló" : "automatic summary"}
          </span>
        </p>
      ) : null}
    </section>
  );
  return (
    <div className="app-frame observatory">
      <a className="skip-link" href="#main-content" onClick={(event) => {event.preventDefault(); document.getElementById("main-content")?.focus();}}>{language === "hu" ? "Ugrás a tartalomra" : "Skip to content"}</a>
      <header className={`mobile-app-bar${mobileMenuOpen ? " menu-open" : ""}`}>
        <button type="button" className="mobile-brand" onClick={() => setDashboardView("overview")} aria-label={t.appTitle}>
          <span className={`sidebar-logo-wrap mode-${snapshot.sourceMode}`} title={sourceModeLabel}>
            <img className="sidebar-logo" src={EARTH_LOGO_URL} alt="" aria-hidden="true" />
            <span className="sidebar-status-dot" aria-hidden="true" />
          </span>
          <span>
            <strong>{t.appTitle}</strong>
            <small>{pageTitle}</small>
          </span>
        </button>
        <button
          type="button"
          className="mobile-menu-button"
          ref={mobileMenuButtonRef}
          aria-label={language === "hu" ? "Navigáció megnyitása" : "Open navigation"}
          aria-expanded={mobileMenuOpen}
          aria-controls="dashboard-sidebar"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </header>
      <button
        type="button"
        className={`sidebar-backdrop${mobileMenuOpen ? " open" : ""}`}
        aria-label={language === "hu" ? "Navigáció bezárása" : "Close navigation"}
        tabIndex={mobileMenuOpen ? 0 : -1}
        onClick={closeMobileMenu}
      />
      <aside
        id="dashboard-sidebar"
        className={`dashboard-sidebar${mobileMenuOpen ? " mobile-open" : ""}`}
        aria-label={t.dashboardNavigationAria}
      >
        <button type="button" className="sidebar-brand" onClick={() => setDashboardView("overview")} aria-label={t.appTitle}>
          <span className={`sidebar-logo-wrap mode-${snapshot.sourceMode}`} title={sourceModeLabel}>
            <img className="sidebar-logo" src={EARTH_LOGO_URL} alt="" aria-hidden="true" />
            <span className="sidebar-status-dot" aria-hidden="true" />
          </span>
          <span className="sidebar-brand-copy">
            <strong>{t.appTitle}</strong>
            <small>{t.brandSubtitle}</small>
          </span>
        </button>
        <button
          type="button"
          className="drawer-close-button"
          aria-label={language === "hu" ? "Navigáció bezárása" : "Close navigation"}
          onClick={closeMobileMenu}
        >
          <ToolkitIcon name="close" className="drawer-close-icon" />
        </button>
        <nav className="sidebar-nav">
          {navGroups.map((group) => {
            const items = navItems.filter((item) => group.views.includes(item.view) && item.available);
            if (!items.length) return null;
            return (
              <div className="sidebar-nav-group" key={group.key}>
                <span className="sidebar-nav-group-label">{group.label}</span>
                {items.map((item) => (
                  <button
                    type="button"
                    key={item.view}
                    className={activeView === item.view ? "active" : ""}
                    onClick={() => setDashboardView(item.view)}
                    title={item.label}
                    aria-label={item.label}
                    aria-current={activeView === item.view ? "page" : undefined}
                  >
                    <ToolkitIcon name={item.icon} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-controls">
          <div className="preferences-control">
            <div className="language-switch" role="group" aria-label={t.language}>
              {(["en", "hu"] as Language[]).map((languageOption) => (
                <button
                  type="button"
                  key={languageOption}
                  aria-pressed={language === languageOption}
                  onClick={() => setLanguage(languageOption)}
                >
                  {languageOption.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="preferences-divider" aria-hidden="true" />
            <button
              type="button"
              className="theme-cycle-button"
              onClick={() => setThemeMode(nextThemeMode)}
              aria-label={`${t.theme}: ${themeModeLabel(themeMode)}. ${language === "hu" ? "Váltás erre" : "Switch to"}: ${themeModeLabel(nextThemeMode)}`}
              title={`${t.theme}: ${themeModeLabel(themeMode)} → ${themeModeLabel(nextThemeMode)}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {themeMode === "light" ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
                  </>
                ) : themeMode === "dark" ? (
                  <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
                ) : (
                  <>
                    <rect x="3" y="4.5" width="18" height="12" rx="2" />
                    <path d="M8.5 20h7M12 16.5V20" />
                  </>
                )}
              </svg>
              <span className="theme-cycle-label">{themeModeLabel(themeMode)}</span>
            </button>
          </div>
        </div>
        <div className="sidebar-meta">
          <span>{t.dataUpdatedLabel}</span>
          <strong>
            {renderPrimaryValue(
              formatDateLabel(extractIsoDate(snapshot.updatedAtIso), language),
              "value-loading-skeleton sidebar-date-loading"
            )}
          </strong>
          {runtimeDataReady ? <small>{footerSources.slice(0, 4).map((source) => source.label.split(" · ").pop()).join(", ")}</small> : null}
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className={`app-shell dashboard-view dashboard-view-${activeView}`}>
        {activeView === "overview" ? (
          <div className="overview-page">
            <section className="overview-lead-grid">
              {renderOverviewHero()}
              <section className="overview-card overview-map-suite overview-primary-map planet-now-card" aria-label={t.planetNowTitle}>
                <div className="overview-card-header planet-now-header">
                  <h2>{t.planetNowTitle}</h2>
                  <div className="segmented-control planet-now-switch" role="group" aria-label={language === "hu" ? "Térképréteg" : "Map layer"}>
                    <button type="button" aria-pressed={overviewMapDomain === "air"} onClick={() => setOverviewMapMode(overviewMapModeFor("air", overviewMapView))}>
                      {language === "hu" ? "Levegő" : "Air"}
                    </button>
                    <button type="button" aria-pressed={overviewMapDomain === "ocean"} onClick={() => setOverviewMapMode(overviewMapModeFor("ocean", overviewMapView))}>
                      {language === "hu" ? "Óceán" : "Ocean"}
                    </button>
                  </div>
                </div>
                {overviewMapCard ? (
                  <>
                    <p className="planet-now-caption">
                      <strong>{overviewMapCard.caption}</strong>
                      <span className="planet-now-meta">
                        {overviewMapCard.dateIso ? (
                          <span className={`status-date tone-${overviewMapCard.freshness?.tone ?? "fresh"}`} title={overviewMapCard.freshness?.label}>
                            <span className="status-dot" aria-hidden="true" />
                            <time dateTime={overviewMapCard.dateIso}>{formatDateLabel(overviewMapCard.dateIso, language)}</time>
                          </span>
                        ) : null}
                        <span>{language === "hu" ? "napi átlag" : "1-day mean"}</span>
                        <span>{overviewMapCard.product}</span>
                      </span>
                      {overviewMapCard.freshness && overviewMapCard.freshness.tone !== "fresh" ? (
                        <span className={`freshness-chip ${overviewMapCard.freshness.tone}`}>
                          {overviewMapCard.freshness.tone === "stale" ? t.freshnessStale : t.freshnessLagging}
                        </span>
                      ) : null}
                    </p>
                    <ClimateMapImage
                      key={overviewMapCard.key}
                      imageUrls={[overviewMapCard.imageUrl, ...overviewMapCard.fallbackImageUrls]}
                      alt={overviewMapCard.imageAlt}
                      noImageLabel={t.mapUnavailable}
                      scaleStartLabel="°C"
                      scaleEndLabel={overviewMapCard.baselineLabel ?? undefined}
                      scaleTicks={overviewMapCard.scaleTicks}
                      loading={!runtimeDataReady}
                    />
                  </>
                ) : null}
                <div className="planet-now-footer">
                  <div className="segmented-control planet-now-switch" role="group" aria-label={language === "hu" ? "Nézet" : "View"}>
                    <button type="button" aria-pressed={overviewMapView === "anomaly"} onClick={() => setOverviewMapMode(overviewMapModeFor(overviewMapDomain, "anomaly"))}>
                      {language === "hu" ? "Anomália" : "Anomaly"}
                    </button>
                    <button type="button" aria-pressed={overviewMapView === "absolute"} onClick={() => setOverviewMapMode(overviewMapModeFor(overviewMapDomain, "absolute"))}>
                      {language === "hu" ? "Abszolút" : "Absolute"}
                    </button>
                  </div>
                  <span className="planet-now-credit">Climate Reanalyzer · University of Maine</span>
                  <button type="button" className="text-link-button" onClick={() => setDashboardView("maps")}>
                    {language === "hu" ? "Összes térkép" : "All maps"} →
                  </button>
                </div>
              </section>
              {renderOverviewAiSummary()}
            </section>

            <section className="overview-metric-grid" aria-label={t.latestSignalsAria}>
              {overviewMetricCards.map((card) => (
                <article
                  className={`overview-metric-card is-linked-card tone-${card.tone}${isNegativeAnomaly(card.metric) ? " is-negative-anomaly" : ""}`}
                  key={card.key}
                >
                  <span className="metric-icon" aria-hidden="true">
                    <ToolkitIcon name={card.icon} />
                  </span>
                  <div className="overview-metric-copy">
                    <h2>{renderChemicalFormula(card.title)}</h2>
                    <p className="metric-subtitle">{card.subtitle}</p>
                    <strong>{renderPrimaryValue(card.value, "value-loading-skeleton overview-value-loading")}</strong>
                    {runtimeDataReady && card.points ? (
                      <Sparkline className="metric-sparkline" points={card.points} readout={sparklineReadout(card.metric, card.title)} />
                    ) : null}
                    {runtimeDataReady ? (
                      <p className="metric-meta">{card.meta}</p>
                    ) : (
                      <p className="metric-meta">{renderLoadingValue("value-loading-skeleton metric-meta-loading")}</p>
                    )}
                    {runtimeDataReady && card.delta ? <span className="metric-delta">{card.delta}</span> : null}
                    <button type="button" className="text-link-button metric-explore card-stretched-link" onClick={() =>
                      openClimateSystemTopic(card.key === "overview-sea-ice" ? "ice" : card.key === "overview-co2" ? "forcing" : "temperature")
                    }>{language === "hu" ? "Részletes adatok" : "Explore indicator"} <span className="card-link-arrow" aria-hidden="true">→</span></button>
                  </div>
                </article>
              ))}
            </section>

            <section className="overview-main-grid overview-secondary-grid">
              <section className="overview-card overview-regional-signals is-linked-card" aria-label={t.regionalTemperatureAnomaliesSectionTitle}>
                <div className="overview-card-header">
                  <div>
                    <h2>{t.regionalTemperatureAnomaliesSectionTitle}</h2>
                    <p>{t.regionalTemperatureAnomaliesSectionNote}</p>
                  </div>
                  <button type="button" className="text-link-button overview-card-link card-stretched-link" onClick={() => openClimateSystemTopic("regions")}>
                    {language === "hu" ? "Összes régió" : "All regions"} <span className="card-link-arrow" aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="regional-signal-grid">
                  {overviewRegionalSignals.map((signal) => (
                    <article className={`regional-signal ${signal.tone}`} key={signal.key}>
                      <h3>{signal.title}</h3>
                      <strong>{renderPrimaryValue(signal.value, "value-loading-skeleton overview-value-loading")}</strong>
                      {runtimeDataReady ? <Sparkline className={`regional-sparkline ${signal.tone}`} points={signal.points} readout={sparklineReadout(signal.metric)} /> : null}
                    </article>
                  ))}
                </div>
              </section>
              {dailyNino34AnomalyLine ? (
                <div className="overview-nino-anomaly is-linked-card">
                  {renderIndicatorPanel(
                    dailyNino34AnomalyLine.metric,
                    dailyNino34AnomalyLine.lines,
                    dailyNino34AnomalyLine.currentYear,
                    dailyNino34AnomalyLine.climatology,
                    "overview"
                  )}
                  <button type="button" className="text-link-button card-stretched-link" onClick={() => openClimateSystemTopic("enso")}>{language === "hu" ? "Természetes változékonyság" : "Explore natural variability"} <span className="card-link-arrow" aria-hidden="true">→</span></button>
                </div>
              ) : null}
              <div className="overview-enso-with-link is-linked-card">{renderEnsoOutlookCard()}<button type="button" className="text-link-button card-stretched-link" onClick={() => openClimateSystemTopic("enso")}>{language === "hu" ? "Évszakos előrejelzés" : "Explore seasonal outlook"} <span className="card-link-arrow" aria-hidden="true">→</span></button></div>
              <article className="overview-card overview-projection-card outlook-featured is-linked-card">
                <div className="outlook-card-grid">
                    <div className="outlook-card-copy">
                      <div className="outlook-title-row">
                        <div>
                          <h2>{warmingEstimateHeading}</h2>
                          <span>{t.projectionExperimentalLabel.toLowerCase()} · {t.projectionProbabilityMethodLabel.toLowerCase()}</span>
                        </div>
                        <ToolkitIcon name="info" className="info-icon" />
                      </div>
                    {projectedAnnualGlobalMeanAnomaly ? (
                      <>
                        <p className="outlook-measure-label">{t.outlookProjectedAnnualMeanLabel}</p>
                        <strong className="outlook-main-value">
                          {renderPrimaryValue(
                            `${projectedAnnualGlobalMeanAnomaly.value > 0 ? "+" : ""}${projectionNumberFormat.format(
                              projectedAnnualGlobalMeanAnomaly.value
                            )} ${projectionUnitLabel}`,
                            "value-loading-skeleton projection-value-loading"
                          )}
                        </strong>
                        <p className="outlook-value-context">{t.overviewPreindustrialSubtitle}</p>
                        <div className="outlook-range-block">
                          <p>{t.projectionIntervalLabel}</p>
                          {runtimeDataReady ? (
                            <div
                              className="outlook-range-track"
                              role="img"
                              aria-label={`${t.projectionIntervalLabel}: ${projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.low)}-${projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.high)} ${projectionUnitLabel}`}
                            >
                              <span className="outlook-range-fill" />
                              <span className="outlook-range-endpoint outlook-range-low" aria-hidden="true">
                                {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.low)} {projectionUnitLabel}
                              </span>
                              <span className="outlook-range-marker" style={{ left: `${outlookIntervalMarker ?? 50}%` }} aria-hidden="true">
                                <span>{projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.value)} {projectionUnitLabel}</span>
                              </span>
                              <span className="outlook-range-endpoint outlook-range-high" aria-hidden="true">
                                {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.high)} {projectionUnitLabel}
                              </span>
                            </div>
                          ) : (
                            <div className="projection-track-loading" aria-hidden="true">
                              {renderLoadingValue("value-loading-skeleton projection-track-loading-bar")}
                            </div>
                          )}
                        </div>
                        {runtimeDataReady ? (
                          <div className="outlook-probability-row">
                            <span className="outlook-chip">
                              <strong>{projectionPercentFormat.format(projectedAnnualGlobalMeanAnomaly.probabilityAboveOnePointFive)}</strong>
                              <span>{t.outlookChanceAboveOnePointFiveLabel}</span>
                            </span>
                            <span className="outlook-chip">
                              <strong>{projectionPercentFormat.format(projectedAnnualGlobalMeanAnomaly.probabilityWarmestOnRecord)}</strong>
                              <span>{t.outlookChanceWarmestYearLabel}</span>
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <button type="button" className="text-link-button outlook-details-link card-stretched-link" onClick={() => setDashboardView("projections")}>{language === "hu" ? "Becslés és módszertan" : "View estimate & assumptions"} <span className="card-link-arrow" aria-hidden="true">→</span></button>
                  </div>
                  {projectedAnnualGlobalMeanAnomaly && outlookMiniChartScale && outlookMiniChartBars.length ? (
                    <div className="outlook-mini-chart" role="img" aria-label={t.outlookChartCaption}>
                      <div
                        className="outlook-chart-line threshold"
                        style={{ top: `${outlookMiniChartScale.linePercent(1.5)}%` }}
                        aria-hidden="true"
                      >
                        <span>1.5 °C</span>
                      </div>
                      <div
                        className="outlook-chart-line record"
                        style={{ top: `${outlookMiniChartScale.linePercent(projectedAnnualGlobalMeanAnomaly.recordThreshold)}%` }}
                        aria-hidden="true"
                      >
                        <span>
                          {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.recordThreshold)} {t.outlookRecordLabel}
                        </span>
                      </div>
                      <div className="outlook-bars" aria-hidden="true">
                        {outlookMiniChartBars.map((bar) => (
                          <div className="outlook-bar-cell" key={bar.year}>
                            <div
                              className={`outlook-bar ${bar.projected ? "projected" : ""}`}
                              style={{ height: `${outlookMiniChartScale.barPercent(bar.value)}%` }}
                              title={`${bar.year}: ${projectionNumberFormat.format(bar.value)} ${projectionUnitLabel}`}
                            >
                              <span className="outlook-bar-value">{projectionNumberFormat.format(bar.value)}</span>
                            </div>
                            <span className="outlook-bar-year">
                              {bar.year}
                              {bar.projected ? t.outlookProjectionSuffix : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p>{t.outlookChartCaption}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            </section>

            {pathwaysData ? (
              <section className="overview-long-range-section">
                <article
                  className="overview-card overview-temperature-trend-card is-linked-card is-clickable-card"
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    // Controls keep their own behaviour; on touch screens a tap on the chart reads its tooltip instead.
                    if (target.closest("button, a, .pathway-toggles")) return;
                    if (target.closest(".long-range-temperature-chart") && window.matchMedia("(hover: none)").matches) return;
                    setDashboardView("projections");
                  }}
                >
                  <div className="overview-card-header">
                    <div>
                      <h2>
                        <button type="button" className="card-title-link" onClick={() => setDashboardView("projections")}>
                          {t.longRangeTemperatureHorizonTitle}
                        </button>
                      </h2>
                      <p>{t.longRangeTemperatureTrendSubtitle}</p>
                    </div>
                  </div>
                  <div className="long-range-temperature-chart">
                    <PathwaysPanel
                      title={t.longRangeTemperatureHorizonTitle}
                      data={pathwaysData}
                      partialLatest={annualGlobalMeanAnomalyIsYtd}
                      referenceLabel="1850–1900"
                      unit={projectionUnitLabel}
                      language={language}
                      compact={compact}
                      dark={resolvedTheme === "dark"}
                      ready={runtimeDataReady}
                      summary
                    />
                  </div>
                </article>
              </section>
            ) : null}

          </div>
        ) : null}

      {activeView === "climate-system" ? (
      <section className={`collapsible-section detail-page-section detail-page-indicators indicator-topic-${indicatorTopic}`} id="climate-system">
        <div className="indicators-layout">
        <IndicatorRail {...indicatorNavProps} />
        <div className="indicators-main">
        <div className="indicator-page-intro">
          <div className="indicator-topic-copy">
            <span className="indicator-topic-eyebrow">{activeIndicatorGroupLabel}</span>
            <h2>{language === "hu" ? activeIndicatorTopic.hu : activeIndicatorTopic.en}</h2>
            <p>{language === "hu" ? activeIndicatorTopic.descriptionHu : activeIndicatorTopic.descriptionEn}</p>
          </div>
        </div>
        <div
          ref={topicNavRef}
          className="topic-navigation indicator-topic-navigation segmented-control"
          role="group"
          aria-label={language === "hu" ? "Mutatócsoport" : "Indicator category"}
        >
          {indicatorTopics.map((topic) => (
            <button type="button" key={topic.key} aria-pressed={indicatorTopic === topic.key} onClick={() => selectIndicatorTopic(topic.key)}>
              {language === "hu" ? topic.hu : topic.en}
            </button>
          ))}
        </div>
        <IndicatorLocator {...indicatorNavProps} />

          <div className="section-content">
            {renderIndicatorSubsection(
              "globalTemperatures",
              t.globalTemperaturesSectionTitle,
              t.globalTemperaturesSectionNote,
              <>
              <div className="charts-grid climate-grid">
                {globalTemperatureLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
              </div>
              </>
            )}

            {renderIndicatorSubsection(
              "temperatureAnomalies",
              t.temperatureAnomalySectionTitle,
              t.temperatureAnomalySectionNote,
              <>
              <div className="charts-grid climate-grid climate-grid-single">
                {anomalyTemperatureLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
                {dailyGlobalMeanAnomalyMetric && dailyWarmingContext ? (
                  <TrendContextPanel
                    anchorId="chart-daily-global-mean-anomaly"
                    title={t.dailyGlobalTemperatureAnomalyTitle}
                    subtitle={t.dailyGlobalTemperatureAnomalySubtitle}
                    data={dailyWarmingContext}
                    variant="warming-daily"
                    domain="temperature"
                    unit={cardUnitLabel(dailyGlobalMeanAnomalyMetric.key, dailyGlobalMeanAnomalyMetric.unit, language)}
                    decimals={dailyGlobalMeanAnomalyMetric.decimals}
                    language={language}
                    compact={compact}
                    dark={resolvedTheme === "dark"}
                    ready={runtimeDataReady}
                    referenceLabel="1850–1900"
                    freshnessLabel={dailyGlobalMeanAnomalyFreshness?.label}
                    freshnessTone={dailyGlobalMeanAnomalyFreshness?.tone}
                    expandLabel={t.chartFullscreenEnter}
                    collapseLabel={t.chartFullscreenExit}
                  />
                ) : null}
                {dailyGlobalMeanAnomalyMetric && annualWarmingContext ? (
                  <TrendContextPanel
                    anchorId="chart-annual-global-mean-anomaly"
                    title={t.annualGlobalTemperatureAnomalyTitle}
                    subtitle={t.annualGlobalTemperatureAnomalySubtitle}
                    data={annualWarmingContext}
                    variant="warming-annual"
                    domain="temperature"
                    unit={cardUnitLabel(dailyGlobalMeanAnomalyMetric.key, dailyGlobalMeanAnomalyMetric.unit, language)}
                    decimals={dailyGlobalMeanAnomalyMetric.decimals}
                    language={language}
                    compact={compact}
                    dark={resolvedTheme === "dark"}
                    ready={runtimeDataReady}
                    referenceLabel="1850–1900"
                    partialLatest={annualGlobalMeanAnomalyIsYtd}
                    freshnessLabel={dailyGlobalMeanAnomalyFreshness?.label}
                    freshnessTone={dailyGlobalMeanAnomalyFreshness?.tone}
                    expandLabel={t.chartFullscreenEnter}
                    collapseLabel={t.chartFullscreenExit}
                  />
                ) : null}
              </div>
              </>
            )}

            {renderIndicatorSubsection(
              "regionalTemperatures",
              t.regionalTemperaturesSectionTitle,
              t.regionalTemperaturesSectionNote,
              <>
              <div className="charts-grid climate-grid">
                {regionalTemperatureLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
              </div>
              </>
            )}

            {renderIndicatorSubsection(
              "regionalTemperatureAnomalies",
              t.regionalTemperatureAnomaliesSectionTitle,
              t.regionalTemperatureAnomaliesSectionNote,
              <>
              <div className="charts-grid climate-grid">
                {regionalTemperatureAnomalyLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
              </div>
              </>
            )}

            {renderIndicatorSubsection(
              "oceans",
              t.oceansSectionTitle,
              t.oceansSectionNote,
              <>
              <div className="charts-grid climate-grid">
                {oceanMetrics.map((metric) => renderTrendContextPanel(metric))}
              </div>
              </>
            )}

            {earthEnergyImbalanceMetric && earthEnergyImbalanceTrendPoints.length ? (
              renderIndicatorSubsection(
                "earthEnergyImbalance",
                t.earthEnergyImbalanceSectionTitle,
                t.earthEnergyImbalanceSectionNote,
                <>
                <div className="summary-cards-section">
                  <div className="regional-summary-grid">
                    <article className="alert-card summary">
                      <span className="alert-kicker">{t.latestLabel}</span>
                      <h2>{language === "hu" ? "12 havi átlag" : "12-month mean"}</h2>
                      <p className="alert-emphasis">
                        {renderPrimaryValue(
                          `${earthEnergyImbalanceLatestMean == null ? "-" : `+${formatNumericValue(earthEnergyImbalanceLatestMean, 2, language, t.valueUnavailable)}`} W/m²`,
                          "value-loading-skeleton detail-value-loading"
                        )}
                      </p>
                      {runtimeDataReady && earthEnergyImbalanceFreshness ? (
                        <span className={`freshness-chip ${earthEnergyImbalanceFreshness.tone}`}>{earthEnergyImbalanceFreshness.label}</span>
                      ) : null}
                      <div className="alert-meta">
                        <span className="alert-meta-chip confidence-medium">
                          {formatSourceShortName(earthEnergyImbalanceMetric.source.shortName, language)}
                        </span>
                      </div>
                    </article>
                    <article className="alert-card summary">
                      <span className="alert-kicker">{language === "hu" ? "Összehasonlítás" : "Reference"}</span>
                      <h2>{language === "hu" ? "2001–2010-es átlag" : "2001–2010 average"}</h2>
                      <p className="alert-emphasis">
                        {renderPrimaryValue(
                          `${earthEnergyImbalanceBaselineMean == null ? "-" : `+${formatNumericValue(earthEnergyImbalanceBaselineMean, 2, language, t.valueUnavailable)}`} W/m²`,
                          "value-loading-skeleton detail-value-loading"
                        )}
                      </p>
                      {runtimeDataReady && earthEnergyImbalanceLatestMean != null && earthEnergyImbalanceBaselineMean ? (
                        <p>
                          {language === "hu"
                            ? `Ez a mostani érték mintegy ${Math.round((earthEnergyImbalanceBaselineMean / earthEnergyImbalanceLatestMean) * 100)}%-a.`
                            : `Today's imbalance is ${formatNumericValue(earthEnergyImbalanceLatestMean / earthEnergyImbalanceBaselineMean, 1, language, "-")}× this level.`}
                        </p>
                      ) : null}
                    </article>
                  </div>
                </div>
                <div className="charts-grid climate-grid climate-grid-single">
                  {renderTrendContextPanel(earthEnergyImbalanceMetric, {
                    title: t.earthEnergyImbalanceTitle,
                    subtitle: t.earthEnergyImbalanceSubtitle,
                  })}
                </div>
                </>
              )
            ) : null}

            {renderIndicatorSubsection(
              "seaIce",
              t.seaIceSectionTitle,
              t.seaIceSectionNote,
              <>
              <div className="charts-grid climate-grid sea-ice-grid">
                {seaIceIndicatorLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
              </div>
              </>
            )}

            {snowCoverIndicatorLines.length ? (
              renderIndicatorSubsection(
                "snowCover",
                t.snowCoverSectionTitle,
                t.snowCoverSectionNote,
                <>
                <div className="charts-grid climate-grid">
                  {snowCoverIndicatorLines.map(({ metric, lines, currentYear, climatology }) =>
                    renderIndicatorPanel(metric, lines, currentYear, climatology)
                  )}
                </div>
                </>
              )
            ) : null}

            {iceSheetAndGlacierMetrics.length ? (
              renderIndicatorSubsection(
                "iceSheetsAndGlaciers",
                t.iceSheetsAndGlaciersSectionTitle,
                t.iceSheetsAndGlaciersSectionNote,
                <>
                <div className="summary-cards-section">
                  <div className="regional-summary-grid">
                    {ICE_SHEET_SEA_LEVEL_EQUIVALENTS.map((estimate) => (
                      <article className="alert-card summary topcat-sea-ice" key={estimate.key}>
                        <span className="alert-kicker">{t.seaLevelEquivalentKicker}</span>
                        <h2>
                          {estimate.acronym} · {language === "hu" ? estimate.nameHu : estimate.nameEn}
                        </h2>
                        <p className="alert-emphasis">
                          {estimate.valueMeters.toLocaleString(language === "hu" ? "hu-HU" : "en-US", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}{" "}
                          m
                        </p>
                        <p>{t.seaLevelEquivalentSubtitle}</p>
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{estimate.source}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="charts-grid climate-grid">
                  {iceSheetAndGlacierMetrics.map((metric) => renderTrendContextPanel(metric))}
                </div>
                </>
              )
            ) : null}

            {renderIndicatorSubsection(
              "forcingGases",
              climateSystemSectionCopy.forcingGases.title,
              climateSystemSectionCopy.forcingGases.note,
              <div className="charts-grid forcing-grid">{forcingGasMetrics.map(renderForcingPanel)}</div>
            )}

            {forcingOtherMetrics.length
              ? renderIndicatorSubsection(
                  "forcingCombined",
                  climateSystemSectionCopy.forcingCombined.title,
                  climateSystemSectionCopy.forcingCombined.note,
                  <div className="charts-grid forcing-grid">{forcingOtherMetrics.map(renderForcingPanel)}</div>
                )
              : null}

            {renderIndicatorSubsection(
              "enso",
              climateSystemSectionCopy.enso.title,
              climateSystemSectionCopy.enso.note,
              <>
              {ensoOverviewRows.length ? (
                <div className="summary-cards-section" id="chart-enso-outlook" data-toc-anchor="">
                  <div className="regional-summary-grid">
                    {ensoOverviewRows.map((row) => (
                      <article
                        className={`alert-card summary variability-index-card phase-tone-${ensoConditionTone(row.window.condition)}`}
                        key={`${row.key}-enso-outlook-summary`}
                      >
                        <span className="alert-kicker">{language === "hu" ? "IRI-előrejelzés" : "IRI outlook"}</span>
                        <h2>{row.horizon}</h2>
                        <p className="alert-emphasis">
                          {runtimeDataReady ? `${row.window.probability ?? "-"}%` : renderLoadingValue("value-loading-skeleton detail-value-loading")}
                        </p>
                        <span className="variability-phase-label">{formatEnsoConditionLabel(row.window.condition, t)}</span>
                        {runtimeDataReady ? <p>{formatEnsoTargetLabel(row.window.targetLabel, language)}</p> : null}
                        {runtimeDataReady && ensoOutlookFreshness ? (
                          <span className={`freshness-chip ${ensoOutlookFreshness.tone}`}>{ensoOutlookFreshness.label}</span>
                        ) : null}
                        <div className="alert-meta">
                          {ensoOutlook?.sourceUrl ? (
                            <a className="alert-meta-chip confidence-medium" href={ensoOutlook.sourceUrl} target="_blank" rel="noreferrer">
                              {ensoOutlook.sourceLabel || "IRI"} →
                            </a>
                          ) : (
                            <span className="alert-meta-chip confidence-medium">{ensoOutlook?.sourceLabel || "IRI"}</span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              {runtimeDataReady && ensoOutlook ? (
                <p className="variability-synopsis">
                  <span>{formatEnsoStatusLabel(ensoOutlook, language, t)}</span>
                  {ensoOutlook.synopsis}
                </p>
              ) : null}
              {dailyNino34Line ? (
                <div className="charts-grid climate-grid">
                  {renderIndicatorPanel(dailyNino34Line.metric, dailyNino34Line.lines, dailyNino34Line.currentYear, dailyNino34Line.climatology)}
                </div>
              ) : null}
              {dailyNino34AnomalyLine ? (
                <div className="charts-grid climate-grid">
                  {renderIndicatorPanel(
                    dailyNino34AnomalyLine.metric,
                    dailyNino34AnomalyLine.lines,
                    dailyNino34AnomalyLine.currentYear,
                    dailyNino34AnomalyLine.climatology
                  )}
                </div>
              ) : null}
              <div className="charts-grid climate-grid">
                {variabilityChartPanels.filter(({ metric }) => ENSO_INDEX_KEYS.has(metric.key)).map(renderVariabilityPanel)}
              </div>
              </>
            )}

            {renderIndicatorSubsection(
              "circulation",
              climateSystemSectionCopy.circulation.title,
              climateSystemSectionCopy.circulation.note,
              <div className="charts-grid climate-grid">
                {variabilityChartPanels.filter(({ metric }) => !ENSO_INDEX_KEYS.has(metric.key)).map(renderVariabilityPanel)}
              </div>
            )}
          </div>
        </div>
        </div>
      </section>
      ) : null}

      {activeView === "maps" ? (
      <section className={`collapsible-section detail-page-section detail-page-editorial detail-page-maps map-topic-${mapTopic}`} id="maps">
        {renderPageIntro(
          language === "hu" ? "Térképek" : "Maps",
          mapTopic === "surface"
            ? language === "hu" ? "Felszínközeli hőmérséklet" : "Surface temperature"
            : language === "hu" ? "Tengerfelszíni hőmérséklet" : "Sea surface temperature",
          mapTopic === "surface"
            ? language === "hu"
              ? "A GFS-modell 2 méteres magasságra számított napi középhőmérséklete a Climate Reanalyzer oldaláról. Az abszolút térkép az időjárást mutatja, az anomáliatérkép pedig azt, mennyire tér el ez az 1979–2000-es átlagtól."
              : "Daily mean 2-metre air temperature from the GFS model via Climate Reanalyzer. The absolute map shows the weather; the anomaly map shows how unusual it is against a 1979–2000 baseline."
            : language === "hu"
              ? "A tengerfelszín napi hőmérséklete és annak anomáliája a Climate Reanalyzer oldaláról. A többlethő nagy részét az óceánok nyelik el, ezért lassan, de tartósan reagálnak."
              : "Daily sea surface temperature and its anomaly via Climate Reanalyzer. The oceans store most of the extra heat, so they respond slowly but persistently."
        )}
        <div className="topic-navigation indicator-topic-navigation segmented-control" role="group" aria-label={t.mapsSectionTitle}>
          <button type="button" aria-pressed={mapTopic === "surface"} onClick={() => setMapTopic("surface")}>
            {language === "hu" ? "Felszínközeli hőmérséklet" : "Surface temperature"}
          </button>
          <button type="button" aria-pressed={mapTopic === "ocean"} onClick={() => setMapTopic("ocean")}>
            {language === "hu" ? "Óceánok" : "Oceans"}
          </button>
        </div>
        <div className="charts-grid climate-grid maps-grid">
          {mapCards.filter((card) => mapTopic === "surface" ? card.key.includes("2m") : !card.key.includes("2m")).map((mapCard) => (
            <MapPanel
              key={mapCard.key}
              title={mapCard.title}
              subtitle={mapCard.subtitle}
              imageUrl={mapCard.imageUrl}
              fallbackImageUrls={mapCard.fallbackImageUrls}
              imageAlt={mapCard.imageAlt}
              noImageLabel={t.mapUnavailable}
              expandLabel={t.chartFullscreenEnter}
              collapseLabel={t.chartFullscreenExit}
              freshnessLabel={mapCard.freshness?.label}
              freshnessTone={mapCard.freshness?.tone}
              scaleStartLabel="°C"
              scaleEndLabel={mapCard.baselineLabel ?? undefined}
              scaleTicks={mapCard.scaleTicks}
              loading={!runtimeDataReady}
            />
          ))}
        </div>
        <p className="maps-source-note">
          {language === "hu" ? "Forrás: " : "Source: "}
          <a href="https://climatereanalyzer.org/wx/todays-weather/" target="_blank" rel="noreferrer">
            Climate Reanalyzer, Climate Change Institute, University of Maine
          </a>
        </p>
      </section>
      ) : null}



      {activeView === "projections" && !runtimeDataReady ? (
        <section className="collapsible-section detail-page-section detail-page-editorial detail-page-projections" id="projections" aria-busy="true">
          {renderPageIntro(t.projectionExperimentalLabel, t.projectionsTitle, t.projectionsNote)}
          {renderLoadingValue("value-loading-skeleton detail-value-loading")}
        </section>
      ) : null}

      {activeView === "projections" && runtimeDataReady && projectedAnnualGlobalMeanAnomaly ? (
        <section className="collapsible-section detail-page-section detail-page-editorial detail-page-projections" id="projections">
          <div className="indicators-layout">
          <IndicatorRail {...projectionNavProps} />
          <div className="indicators-main">
          {renderPageIntro(
            t.projectionExperimentalLabel,
            t.projectionsTitle,
            language === "hu"
              ? "Merre tart az idei év, merre haladhat az évszázad, és milyen földrendszer-küszöbök kerülhetnek útba."
              : "Where this year is heading, where the century could go, and which Earth-system thresholds lie along the way."
          )}
          <IndicatorLocator {...projectionNavProps} />
          <div className="section-content">

          {renderPageSubsection(
            warmingEstimateHeading,
            language === "hu"
              ? "Az idei év globális átlaghőmérséklete hasonló (analóg) évek alapján, az aktuális ENSO-előrejelzés szerint súlyozva. Kísérleti becslés, nem hivatalos előrejelzés."
              : "Annual global mean temperature estimated from analog years weighted by the current ENSO forecast. An experimental estimate, not an official forecast.",
            <>
              {estimateWarmingContext && dailyGlobalMeanAnomalyMetric ? (
                <div className="charts-grid climate-grid climate-grid-single">
                  <TrendContextPanel
                    anchorId="chart-warming-estimate"
                    title={t.projectedAnnualTemperatureAnomalyChartTitle}
                    subtitle={t.projectedAnnualTemperatureAnomalyChartSubtitle}
                    data={estimateWarmingContext}
                    variant="warming-estimate"
                    domain="temperature"
                    unit={projectionUnitLabel}
                    decimals={dailyGlobalMeanAnomalyMetric.decimals}
                    language={language}
                    compact={compact}
                    dark={resolvedTheme === "dark"}
                    ready={runtimeDataReady}
                    referenceLabel="1850–1900"
                    estimate={warmingEstimate}
                    freshnessLabel={projectionFreshness?.label}
                    freshnessTone={projectionFreshness?.tone}
                    expandLabel={t.chartFullscreenEnter}
                    collapseLabel={t.chartFullscreenExit}
                  />
                </div>
              ) : null}
            </>,
            undefined,
            "section-warming-estimate"
          )}

          {pathwaysData
            ? renderPageSubsection(
                t.longRangeTemperatureHorizonTitle,
                t.longRangeTemperatureTrendSource,
                <>
                  <div className="charts-grid climate-grid climate-grid-single">
                    <PathwaysPanel
                      anchorId="chart-warming-pathways"
                      title={t.longRangeTemperatureTrendTitle}
                      subtitle={t.longRangeTemperatureTrendSubtitle}
                      data={pathwaysData}
                      partialLatest={annualGlobalMeanAnomalyIsYtd}
                      referenceLabel="1850–1900"
                      unit={projectionUnitLabel}
                      language={language}
                      compact={compact}
                      dark={resolvedTheme === "dark"}
                      ready={runtimeDataReady}
                      freshnessLabel={dailyGlobalMeanAnomalyFreshness?.label}
                      freshnessTone={dailyGlobalMeanAnomalyFreshness?.tone}
                      expandLabel={t.chartFullscreenEnter}
                      collapseLabel={t.chartFullscreenExit}
                    />
                  </div>
                </>,
                <a className="text-link-button subsection-source-link" href={CMIP7_SCENARIOMIP_TEMPERATURE_SOURCE_URL} target="_blank" rel="noreferrer">
                  {t.cmip7ScenarioSourceLabel} →
                </a>,
                "section-warming-pathways"
              )
            : null}

          {renderPageSubsection(
            t.tippingPointsTitle,
            t.tippingPointsSubtitle,
            <TippingLadderPanel
              title={language === "hu" ? "Billenési küszöbök közös skálán" : "Tipping thresholds on a shared scale"}
              items={tippingLadderItems}
              currentWarming={currentTippingWarming}
              partial={annualGlobalMeanAnomalyIsYtd}
              currentYear={latestAnnualGlobalMeanAnomaly?.year ?? null}
              pathways={pathwaysData}
              unit={projectionUnitLabel}
              language={language}
              dark={resolvedTheme === "dark"}
              ready={runtimeDataReady}
            />,
            <a className="text-link-button subsection-source-link" href={MCKAY_TIPPING_POINTS_SOURCE_URL} target="_blank" rel="noreferrer">
              {t.tippingPointsSourceLabel} →
            </a>,
            "section-tipping-points"
          )}
          </div>
          </div>
          </div>
        </section>
      ) : null}

      {activeView === "sources" ? (
      <section className="detail-page-section detail-page-editorial detail-page-sources" id="sources">
        {renderPageIntro(
          language === "hu" ? "Adatok és módszertan" : "Data & methods",
          t.sourceCardsTitle,
          language === "hu"
            ? "Az irányítópult minden idősora nyilvános elsődleges forrásból származik, és egy automatikus folyamat naponta frissíti. A frissességi jelzés azt mutatja, mennyire naprakész az egyes források legutóbbi értéke a várható frissítési ütemhez képest."
            : "Every series on the dashboard comes from a public upstream feed, refreshed daily by an automated pipeline. Freshness shows how current each feed's latest value is against its expected cadence."
        )}
        <div className="summary-cards-section">
          <div className="regional-summary-grid data-summary-grid">
            <article className={`alert-card summary data-status-summary ${snapshot.sourceMode === "live" ? "live" : "sample"}`}>
              <span className="alert-kicker">{t.sourceStatusTitle}</span>
              <h2>{sourceModeLabel}</h2>
              <p>{sourceModeNote}</p>
            </article>
            <article className="alert-card summary">
              <span className="alert-kicker">{t.sourceUpdatedTitle}</span>
              <h2>{formatDateTimeLabel(snapshot.updatedAtIso, language)}</h2>
              <p>{language === "hu" ? "Napi automatikus frissítés" : "Automated daily refresh"}</p>
            </article>
            <article className="alert-card summary">
              <span className="alert-kicker">{language === "hu" ? "Lefedettség" : "Coverage"}</span>
              <p className="alert-emphasis">{uniqueFooterSources.length}</p>
              <p>
                {language === "hu"
                  ? `adatforrás ${sourceProviderCount} szolgáltatótól`
                  : `feeds from ${sourceProviderCount} providers`}
              </p>
            </article>
            <article className="alert-card summary">
              <span className="alert-kicker">{language === "hu" ? "Frissesség" : "Freshness"}</span>
              <div className="data-freshness-breakdown">
                {(["fresh", "warning", "stale"] as const).map((tone) => (
                  <span className={`data-freshness-count ${tone}`} key={tone}>
                    <strong>{sourceFreshnessCounts[tone]}</strong>
                    <small>
                      {tone === "fresh"
                        ? language === "hu" ? "friss" : "current"
                        : tone === "warning"
                          ? t.freshnessLagging.toLocaleLowerCase()
                          : t.freshnessStale.toLocaleLowerCase()}
                    </small>
                  </span>
                ))}
              </div>
              <div className="data-freshness-bar" aria-hidden="true">
                {(["fresh", "warning", "stale"] as const).map((tone) =>
                  sourceFreshnessCounts[tone] ? (
                    <span className={tone} key={tone} style={{ flexGrow: sourceFreshnessCounts[tone] }} />
                  ) : null
                )}
              </div>
            </article>
          </div>
        </div>
        {footerWarnings.length ? (
          <details className="footer-warnings">
            <summary>
              {t.sourceWarningsTitle} ({footerWarnings.length})
            </summary>
            <ul>
              {footerWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="source-toolbar">
          <label className="source-search">
            <span>{language === "hu" ? "Adatforrások keresése" : "Find a data source"}</span>
            <input
              type="search"
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
              placeholder={language === "hu" ? "Név, szolgáltató vagy témakör…" : "Name, provider or topic…"}
            />
          </label>
          <p className="source-result-count" role="status">
            {filteredSourceCount
              ? language === "hu"
                ? `${filteredSourceCount} / ${uniqueFooterSources.length} forrás`
                : `${filteredSourceCount} of ${uniqueFooterSources.length} sources`
              : language === "hu"
                ? "Nincs találat."
                : "No matching sources."}
          </p>
        </div>
        {filteredSourceGroups.map((group) => (
          <section className="source-group" key={group.section}>
            <header className="source-group-header">
              <h2>{dataSourceSectionTitle(group.section, t)}</h2>
              <span>{group.sources.length}</span>
            </header>
            <ul className="source-table">
              {group.sources.map((source) => (
                <li key={source.key}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    <strong>
                      {source.title}
                      <span className="source-table-arrow" aria-hidden="true"> ↗</span>
                    </strong>
                    <span className="source-table-provider">{source.provider}</span>
                  </a>
                  {runtimeDataReady && source.freshness ? (
                    <span className={`freshness-chip ${source.freshness.tone}`}>{source.freshness.label}</span>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>
      ) : null}
      <footer className="overview-status-footer dashboard-status-footer" aria-label={t.dataStatusLabel}>
        <span className="overview-footer-credit">{t.footerCredit}</span>
        <span>{sourceModeLabel}</span>
        <span>
          {t.dataUpdatedLabel}:{" "}
          {renderPrimaryValue(
            formatDateLabel(extractIsoDate(snapshot.updatedAtIso), language),
            "value-loading-skeleton page-meta-loading"
          )}
        </span>
      </footer>
      </main>
    </div>
  );
}
