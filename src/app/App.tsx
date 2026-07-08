import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
import { buildForcingTrendOption } from "../charts/historicalTrend";
import { EChartsPanel } from "../components/EChartsPanel";
import { MapPanel } from "../components/MapPanel";
import { Sparkline } from "../components/Sparkline";

const STORAGE_LANG_KEY = "climate-dashboard-lang";
const STORAGE_THEME_KEY = "climate-dashboard-theme";
const DAY_MS = 86_400_000;
const PROJECTION_ANALOG_POOL_SIZE = 12;
const PROJECTION_MAX_ANALOGS = 8;
const PROJECTION_YTD_SIGMA = 0.16;
const PROJECTION_RECENCY_SCALE_YEARS = 6;
const PROJECTION_OVERVIEW_Y_MIN = 1;
const PROJECTION_OVERVIEW_Y_MAX = 2;
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
    colorLight: "#dc1f2f",
    colorDark: "#fb7185",
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
    colorLight: "#e96a00",
    colorDark: "#fbbf24",
  },
  {
    key: "mediumLow",
    labelEn: "Medium-Low",
    labelHu: "Közepes-alacsony",
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
    colorLight: "#7c3aed",
    colorDark: "#a78bfa",
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
    colorLight: "#008b81",
    colorDark: "#34d399",
  },
];

const MCKAY_TIPPING_POINTS: TippingPointDefinition[] = [
  {
    key: "greenland-ice-sheet",
    labelEn: "Greenland Ice Sheet collapse",
    labelHu: "Grönlandi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 1.5,
    minThreshold: 0.8,
    maxThreshold: 3,
  },
  {
    key: "west-antarctic-ice-sheet",
    labelEn: "West Antarctic Ice Sheet collapse",
    labelHu: "Nyugat-antarktiszi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 3,
  },
  {
    key: "coral-reefs",
    labelEn: "Low-latitude coral reef die-off",
    labelHu: "Alacsony szélességi korallzátonyok pusztulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 2,
  },
  {
    key: "abrupt-permafrost-thaw",
    labelEn: "Boreal permafrost abrupt thaw",
    labelHu: "Boreális permafroszt hirtelen olvadása",
    categoryEn: "Permafrost",
    categoryHu: "Permafroszt",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 2.3,
  },
  {
    key: "barents-sea-ice",
    labelEn: "Barents Sea ice abrupt loss",
    labelHu: "Barents-tengeri jég hirtelen elvesztése",
    categoryEn: "Sea ice",
    categoryHu: "Tengeri jég",
    centralThreshold: 1.6,
    minThreshold: 1.5,
    maxThreshold: 1.7,
  },
  {
    key: "labrador-irminger-convection",
    labelEn: "Labrador-Irminger Seas convection collapse",
    labelHu: "Labrador-Irminger tengeri konvekció összeomlása",
    categoryEn: "Ocean circulation",
    categoryHu: "Óceáni cirkuláció",
    centralThreshold: 1.8,
    minThreshold: 1.1,
    maxThreshold: 3.8,
  },
  {
    key: "mountain-glaciers",
    labelEn: "Mountain glacier loss",
    labelHu: "Hegyi gleccserek elvesztése",
    categoryEn: "Glaciers",
    categoryHu: "Gleccserek",
    centralThreshold: 2,
    minThreshold: 1.5,
    maxThreshold: 3,
  },
  {
    key: "sahel-greening",
    labelEn: "Sahel and West African monsoon greening",
    labelHu: "Száhel és nyugat-afrikai monszun zöldülése",
    categoryEn: "Monsoon",
    categoryHu: "Monszun",
    centralThreshold: 2.8,
    minThreshold: 2,
    maxThreshold: 3.5,
  },
  {
    key: "east-antarctic-subglacial-basins",
    labelEn: "East Antarctic subglacial basins collapse",
    labelHu: "Kelet-antarktiszi szubglaciális medencék összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 3,
    minThreshold: 2,
    maxThreshold: 6,
  },
  {
    key: "amazon-rainforest",
    labelEn: "Amazon rainforest dieback",
    labelHu: "Amazóniai esőerdő visszaszorulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 3.5,
    minThreshold: 2,
    maxThreshold: 6,
  },
  {
    key: "boreal-permafrost-collapse",
    labelEn: "Boreal permafrost collapse",
    labelHu: "Boreális permafroszt összeomlása",
    categoryEn: "Permafrost",
    categoryHu: "Permafroszt",
    centralThreshold: 4,
    minThreshold: 3,
    maxThreshold: 6,
  },
  {
    key: "amoc",
    labelEn: "Atlantic Meridional Overturning Circulation collapse",
    labelHu: "Atlanti meridionális áramlási rendszer összeomlása",
    categoryEn: "Ocean circulation",
    categoryHu: "Óceáni cirkuláció",
    centralThreshold: 4,
    minThreshold: 1.4,
    maxThreshold: 8,
  },
  {
    key: "boreal-forest-south",
    labelEn: "Boreal forest southern dieback",
    labelHu: "Boreális erdők déli visszaszorulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 4,
    minThreshold: 1.4,
    maxThreshold: 5,
  },
  {
    key: "boreal-forest-north",
    labelEn: "Boreal forest northern expansion",
    labelHu: "Boreális erdők északi terjeszkedése",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 4,
    minThreshold: 1.5,
    maxThreshold: 7.2,
  },
  {
    key: "arctic-winter-sea-ice",
    labelEn: "Arctic winter sea ice collapse",
    labelHu: "Arktiszi téli tengeri jég összeomlása",
    categoryEn: "Sea ice",
    categoryHu: "Tengeri jég",
    centralThreshold: 6.3,
    minThreshold: 4.5,
    maxThreshold: 8.7,
  },
  {
    key: "east-antarctic-ice-sheet",
    labelEn: "East Antarctic Ice Sheet collapse",
    labelHu: "Kelet-antarktiszi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 7.5,
    minThreshold: 5,
    maxThreshold: 10,
  },
];
type DashboardView = "overview" | "indicators" | "forcing" | "variability" | "maps" | "projections" | "sources";
type IndicatorSubsectionKey =
  | "globalTemperatures"
  | "temperatureAnomalies"
  | "regionalTemperatures"
  | "regionalTemperatureAnomalies"
  | "oceans"
  | "earthEnergyImbalance"
  | "seaIce"
  | "snowCover"
  | "iceSheetsAndGlaciers";
type ToolkitIconName =
  | "alert"
  | "bars"
  | "calendar"
  | "cloud"
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

const DASHBOARD_VIEW_IDS = new Set<DashboardView>([
  "overview",
  "indicators",
  "forcing",
  "variability",
  "maps",
  "projections",
  "sources",
]);
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
  "nao_index",
  "pna_index",
  "soi_index",
  "arctic_oscillation_index",
];
const VARIABILITY_INDEX_KEY_SET = new Set<ClimateMetricSeries["key"]>(VARIABILITY_INDEX_KEYS);
const MONTHLY_COMPARISON_EXCLUDED_KEYS = new Set([...OCEAN_KEYS, EARTH_ENERGY_IMBALANCE_KEY, ...ICE_SHEET_AND_GLACIER_KEYS]);
const REGIONAL_TEMPERATURE_KEYS = new Set([
  "northern_hemisphere_surface_temperature",
  "southern_hemisphere_surface_temperature",
  "arctic_surface_temperature",
  "antarctic_surface_temperature",
  "north_atlantic_sea_surface_temperature",
]);
const REGIONAL_TEMPERATURE_ORDER: ClimateMetricSeries["key"][] = [
  "northern_hemisphere_surface_temperature",
  "southern_hemisphere_surface_temperature",
  "arctic_surface_temperature",
  "antarctic_surface_temperature",
  "north_atlantic_sea_surface_temperature",
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
const SEA_ICE_SUMMARY_ORDER: ClimateMetricSeries["key"][] = [
  "global_sea_ice_extent",
  "arctic_sea_ice_extent",
  "antarctic_sea_ice_extent",
];
const SEA_ICE_SUMMARY_RANK = new Map(SEA_ICE_SUMMARY_ORDER.map((key, index) => [key, index]));
const SNOW_COVER_SUMMARY_ORDER: ClimateMetricSeries["key"][] = ["northern_hemisphere_snow_cover_extent"];
const SNOW_COVER_SUMMARY_RANK = new Map(SNOW_COVER_SUMMARY_ORDER.map((key, index) => [key, index]));

const STRINGS = {
  en: {
    appTitle: "Climate Dashboard",
    appSubtitle: "Global climate indicators and forcings",
    dashboardNavigationAria: "Dashboard navigation",
    brandSubtitle: "Global Climate Dashboard",
    dataUpdatedLabel: "Data updated",
    dataStatusLabel: "Data status",
    navOverview: "Overview",
    navIndicators: "Indicators",
    navVariability: "Variability",
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
    planetNowTitle: "Planet Now",
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
    outlookTitle: "Outlook",
    ensoOutlookTitle: "ENSO Outlook",
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
    recordWarningsAria: "Record climate warnings",
    recordWarningKicker: "Record warning",
    recordWarningDateMeta: "Date",
    highestEverGlobalSurfaceTemperatureAnomalyTitle: "Highest Ever Global Surface Temperature Anomaly",
    highestEverGlobalSeaSurfaceTemperatureAnomalyTitle: "Highest Ever Global Sea Surface Temperature Anomaly",
    climateIndicatorsTitle: "Climate Indicators",
    climateIndicatorsNote: "Core climate indicators.",
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
    projectedAnnualTemperatureAnomalyTitle: "Projected Annual Temperature Anomaly",
    projectedAnnualTemperatureAnomalyChartTitle: "Annual Global Temperature Anomaly + Projection",
    projectedAnnualTemperatureAnomalyChartSubtitle:
      "Historical annual means with the projected current-year value and confidence interval.",
    longRangeTemperatureTrendTitle: "Temperature Trend to 2100",
    longRangeTemperatureTrendShortTitle: "2100 Trend",
    longRangeTemperatureTrendSubtitle:
      "Measured annual warming to present, then indicative CMIP7 ScenarioMIP FaIR median pathways.",
    longRangeTemperatureTrendSource:
      "Scenario values are preliminary FaIR simple-climate-model medians from Van Vuuren et al. (2026), not final CMIP7 Earth system model output.",
    longRangeTemperatureTrendValueLabel: "2100 value",
    cmip7ScenarioSourceLabel: "CMIP7 ScenarioMIP",
    scenarioHighLabel: "High",
    scenarioMediumLabel: "Medium",
    scenarioMediumLowLabel: "Medium-Low",
    scenarioLowLabel: "Low",
    tippingPointsTitle: "Earth System Tipping Points",
    tippingPointsSubtitle:
      "Central global-warming thresholds from Armstrong McKay et al. (2022), colored by proximity to the dashboard's current annual warming estimate.",
    tippingPointsSourceLabel: "McKay et al. 2022",
    tippingCurrentWarmingLabel: "Current warming estimate",
    tippingCentralThresholdLabel: "central threshold",
    tippingRangeLabel: "assessed range",
    tippingStateLikely: "Above central threshold",
    tippingStatePossible: "Inside uncertainty range",
    tippingStateBelow: "Below assessed range",
    projectionExperimentalLabel: "Experimental",
    projectionEstimateLabel: "Projected mean",
    projectionIntervalLabel: "15th-85th percentile interval",
    projectionRangeLabel: "Range",
    projectionMethodLabel: "YTD + recent analog seasonal paths",
    projectionSignalLabel: "ENSO signal",
    projectionProbabilityAboveOnePointFiveTitle: "Chance of annual mean > 1.5°C",
    projectionProbabilityWarmestRecordTitle: "Chance of warmest year on record",
    projectionProbabilityMethodLabel: "Weighted analog years",
    projectionAnalogsLabel: "analogs",
    projectionRecordThresholdLabel: "Record to beat",
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
      "Daily Jan-Dec comparison for Northern Hemisphere, Arctic, North Atlantic SST, Southern Hemisphere, and Antarctic temperatures.",
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
    soiIndexSubtitle: "NOAA PSL monthly Southern Oscillation Index",
    arcticOscillationIndexSubtitle: "NOAA CPC monthly Arctic Oscillation index",
    naturalVariabilityTitle: "Natural Variability",
    naturalVariabilityNote: "ENSO and climate indices.",
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
    forcingNote: "Greenhouse gases and solar input.",
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
    sourceCardsTitle: "Data",
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
    footerCredit: "Made by András Tóth and GPT-5.3-Codex.",
  },
  hu: {
    appTitle: "Klíma Dashboard",
    appSubtitle: "Globális klímaindikátorok és éghajlati kényszerek",
    dashboardNavigationAria: "Irányítópult-navigáció",
    brandSubtitle: "Globális éghajlati irányítópult",
    dataUpdatedLabel: "Adatok frissítve",
    dataStatusLabel: "Adatállapot",
    navOverview: "Áttekintés",
    navIndicators: "Indikátorok",
    navVariability: "Változékonyság",
    overviewTitle: "Globális éghajlati áttekintés",
    overviewSubtitle: "Friss éghajlati jelzések",
    overviewDailyGlobalTemperatureAnomalyTitle: "Napi globális hőmérsékleti anomália",
    overviewPreindustrialSubtitle: "az 1850-1900-as átlaghoz képest",
    overviewSurfaceAnomalyTitle: "Felszíni hőmérsékleti anomália",
    overviewSstAnomalyTitle: "Tengerfelszíni hőmérsékleti anomália",
    overviewCo2Title: "CO₂-koncentráció",
    overviewAtmosphericSubtitle: "Légköri",
    overviewArcticSeaIceTitle: "Arktiszi tengeri jégkiterjedés",
    overviewClimatologySubtitle: "az 1991-2020-as átlaghoz képest",
    planetNowTitle: "A bolygó most",
    heroSparklineLabel: "Elmúlt 365 nap",
    heroRecordLabel: "Mindenkori csúcs",
    warmingStripesAria: "Éves globális hőmérsékleti anomáliák 1940 óta, melegedési csíkokként ábrázolva",
    navGroupMonitor: "Megfigyelés",
    navGroupExplore: "Felfedezés",
    navGroupSystem: "Rendszer",
    deltaSincePrevious: "az előző értékhez képest",
    recordReachedText: "elérte ezt az értéket:",
    ensoTargetConnector: "időszakra:",
    viewAllForcing: "Minden kényszer megtekintése",
    viewAllMaps: "Minden térkép megtekintése",
    recentHighlightsTitle: "Legfrissebb kiemelések",
    outlookTitle: "Kilátások",
    ensoOutlookTitle: "ENSO kilátások",
    ensoNextThreeMonths: "Következő 3 hónap",
    ensoNextSixMonths: "Következő 6 hónap",
    ensoStatusLabel: "Státusz",
    ensoConditionNeutral: "ENSO-semleges",
    ensoConditionLaNina: "La Niña",
    ensoConditionElNino: "El Niño",
    ensoAlertNeutral: "ENSO-semleges",
    ensoAlertLaNinaAdvisory: "La Niña figyelmeztetés",
    ensoAlertElNinoAdvisory: "El Niño figyelmeztetés",
    ensoAlertLaNinaWatch: "Lehetséges La Niña",
    ensoAlertElNinoWatch: "Lehetséges El Niño",
    ensoAlertFinalLaNina: "Utolsó La Niña figyelmeztetés",
    ensoAlertFinalElNino: "Utolsó El Niño figyelmeztetés",
    language: "Nyelv",
    theme: "Téma",
    themeSystem: "Rendszer",
    themeDark: "Sötét",
    themeLight: "Világos",
    sectionExpand: "Kinyitás",
    sectionCollapse: "Összecsukás",
    latestLabel: "Legfrissebb",
    latestAnnualLabel: "Legfrissebb éves érték",
    latestSignalsAria: "Legfrissebb klímaindikátorok",
    aiSummaryAria: "AI klímaösszefoglaló",
    aiSummaryTitle: "AI összefoglaló",
    aiSummaryKicker: "AI-összefoglaló",
    aiGeneratedAria: "AI által készített",
    aiSummaryLoading: "A legfrissebb AI-összefoglaló betöltése",
    aiSummaryRecordHigh: "a legfrissebb érték eléri vagy meghaladja az azonos dátumú történeti rekordot",
    aiSummaryNearRecordHigh: "a legfrissebb érték közel van az azonos dátumú történeti rekordhoz",
    aiSummaryAboveMean: "az 1991-2020-as azonos dátumú átlag felett",
    aiSummaryBelowMean: "az 1991-2020-as azonos dátumú átlag alatt",
    aiSummaryComparedWithMean: "az 1991-2020-as átlaghoz képest",
    aiSummaryComparedWithRecord: "az azonos dátumú rekordhoz képest",
    aiSummaryRankLabel: "azonos dátumú rang",
    aiSummaryNoWarnings: "A globális felszíni hőmérséklet és a globális tengerfelszíni hőmérséklet nem szokatlanul magas az azonos dátumú történeti rekordokhoz képest.",
    aiSummaryMostImportantSignals: "Fő jelzések:",
    recordWarningsAria: "Rekord éghajlati figyelmeztetések",
    recordWarningKicker: "Rekordfigyelmeztetés",
    recordWarningDateMeta: "Dátum",
    highestEverGlobalSurfaceTemperatureAnomalyTitle: "Mindenkori legmagasabb globális felszíni hőmérsékleti anomália",
    highestEverGlobalSeaSurfaceTemperatureAnomalyTitle: "Mindenkori legmagasabb globális tengerfelszíni hőmérsékleti anomália",
    climateIndicatorsTitle: "Éghajlati Indikátorok",
    climateIndicatorsNote: "Fő klímaindikátorok.",
    globalTemperaturesSectionTitle: "Globális hőmérsékletek",
    globalTemperaturesSectionNote: "Globális felszíni és tengerfelszíni hőmérsékletek január-decemberi napi összehasonlító nézetben.",
    oceansSectionTitle: "Óceánok",
    oceansSectionNote: "Hosszú távú óceáni állapotmutatók: globális átlagos tengerszint és óceáni hőtartalom.",
    earthEnergyImbalanceSectionTitle: "A Föld energiaegyensúlyának felborulása",
    earthEnergyImbalanceSectionNote:
      "A NASA CERES EBAF globális nettó légkör-teteji sugárzási fluxusa, 12 havi futóátlagként a havi zaj csökkentésére.",
    earthEnergyImbalanceTitle: "A Föld energiaegyensúlyának felborulása",
    earthEnergyImbalanceSubtitle: "NASA CERES EBAF havi globális nettó TOA fluxus · 12 havi futóátlag",
    temperatureAnomalySectionTitle: "Hőmérsékleti anomáliák",
    temperatureAnomalySectionNote:
      "A globális felszíni és tengerfelszíni anomáliák 1991-2020-as klimatológiára épülnek; a napi és éves globális átlaganomália-grafikonok ERA5-alapú, becsült 1850-1900-as bázishoz viszonyított értékeket mutatnak.",
    dailyGlobalTemperatureAnomalyTitle: "Napi globális átlaghőmérséklet-anomália",
    dailyGlobalTemperatureAnomaly365DayAverage: "365 napos átlag",
    dailyGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, becsült 1850-1900-as referencia)",
    annualGlobalTemperatureAnomalyTitle: "Éves globális hőmérsékleti anomália",
    annualGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, becsült 1850-1900-as referencia)",
    annualGlobalTemperatureAnomalyMethod: "Az elérhető napi anomáliák átlaga (az aktuális évben évközi átlag).",
    projectedAnnualTemperatureAnomalyTitle: "Becsült éves hőmérsékleti anomália",
    projectedAnnualTemperatureAnomalyChartTitle: "Éves globális hőmérsékleti anomália + előrejelzés",
    projectedAnnualTemperatureAnomalyChartSubtitle:
      "Történeti éves átlagok az aktuális év becsült értékével és bizonytalansági tartományával.",
    longRangeTemperatureTrendTitle: "Hőmérsékleti trend 2100-ig",
    longRangeTemperatureTrendShortTitle: "2100-as trend",
    longRangeTemperatureTrendSubtitle:
      "Mért éves melegedés napjainkig, majd indikatív CMIP7 ScenarioMIP FaIR medián pályák.",
    longRangeTemperatureTrendSource:
      "A forgatókönyvértékek Van Vuuren et al. (2026) előzetes FaIR egyszerűklíma-modell mediánjai, nem végleges CMIP7 földrendszermodell-eredmények.",
    longRangeTemperatureTrendValueLabel: "2100-as érték",
    cmip7ScenarioSourceLabel: "CMIP7 ScenarioMIP",
    scenarioHighLabel: "Magas",
    scenarioMediumLabel: "Közepes",
    scenarioMediumLowLabel: "Közepes-alacsony",
    scenarioLowLabel: "Alacsony",
    tippingPointsTitle: "Földrendszer billenőpontjai",
    tippingPointsSubtitle:
      "Armstrong McKay et al. (2022) központi globális melegedési küszöbei, a dashboard aktuális éves melegedési becsléséhez viszonyítva színezve.",
    tippingPointsSourceLabel: "McKay et al. 2022",
    tippingCurrentWarmingLabel: "Aktuális melegedési becslés",
    tippingCentralThresholdLabel: "központi küszöb",
    tippingRangeLabel: "becsült tartomány",
    tippingStateLikely: "A központi küszöb felett",
    tippingStatePossible: "A bizonytalansági tartományban",
    tippingStateBelow: "A becsült tartomány alatt",
    projectionExperimentalLabel: "Kísérleti",
    projectionEstimateLabel: "Becsült átlag",
    projectionIntervalLabel: "15-85. percentilis tartomány",
    projectionRangeLabel: "Tartomány",
    projectionMethodLabel: "Évközi + közeli analóg évek szezonális lefutása",
    projectionSignalLabel: "ENSO jel",
    projectionProbabilityAboveOnePointFiveTitle: "Annak esélye, hogy az éves átlag > 1,5°C",
    projectionProbabilityWarmestRecordTitle: "Annak esélye, hogy ez legyen a legmelegebb év a mérésekben",
    projectionProbabilityMethodLabel: "Súlyozott analóg évek",
    projectionAnalogsLabel: "analóg",
    projectionRecordThresholdLabel: "Megközelítendő rekord",
    outlookProjectedAnnualMeanLabel: "Becsült éves átlag",
    outlookChanceAboveOnePointFiveLabel: "esély 1,5 °C felett",
    outlookChanceWarmestYearLabel: "esély rekordmeleg évre",
    outlookChartCaption: "éves anomália, elmúlt öt év + 2026 becslés",
    outlookProjectionSuffix: "b",
    outlookRecordLabel: "rekord",
    projectionsTitle: "Előrejelzések",
    projectionsNote: "Kísérleti melegedési kilátás.",
    yearLabel: "Év",
    regionalTemperaturesSectionTitle: "Regionális hőmérsékletek",
    regionalTemperaturesSectionNote:
      "Napi január-decemberi összehasonlítás az északi félteke, a déli félteke, az Arktisz, az Antarktisz és az észak-atlanti tengerfelszíni hőmérséklet (SST) adataival.",
    regionalTemperatureAnomaliesSectionTitle: "Regionális hőmérsékleti anomáliák",
    regionalTemperatureAnomaliesSectionNote:
      "Napi regionális anomáliák az egyes adatforrások 1991-2020-as klimatológiájához viszonyítva: féltekék, sarkvidékek és Észak-Atlanti SST.",
    climatologyMeanLabel: "1991-2020-as átlag",
    seaIceSectionTitle: "Tengeri jég",
    seaIceSectionNote:
      "Globális, arktiszi és antarktiszi jégkiterjedés napi adatokkal, január-decemberi összehasonlító nézetben.",
    snowCoverSectionTitle: "Hóborítottság",
    snowCoverSectionNote:
      "Havi északi féltekei szárazföldi hóborítottsági kiterjedés a Rutgers Global Snow Lab adatai alapján. Összehasonlítható déli féltekei/globális hóborítottsági idősor ugyanebben a klíma-adatforrásban nem érhető el.",
    iceSheetsAndGlaciersSectionTitle: "Jégtakarók és gleccserek",
    iceSheetsAndGlaciersSectionNote:
      "A WGMS globális gleccser-tömegváltozása és referencia-gleccser tömegmérlege, valamint a NASA GRACE/GRACE-FO tömegváltozási adataiból származtatott kumulatív antarktiszi és grönlandi jégtakaró-tömegveszteség 2002 óta.",
    seaLevelEquivalentKicker: "Tengerszint-egyenérték",
    seaLevelEquivalentSubtitle: "A teljes jégtakaró-veszteségből adódó lehetséges globális átlagos tengerszint-emelkedés.",
    nino34IndexTitle: "Történeti Niño 3.4 index",
    nino34IndexSubtitle: "NOAA CPC Óceáni Niño Index · középre igazított 3 havi Niño 3.4 SST-anomália",
    naoIndexSubtitle: "NOAA CPC havi észak-atlanti oszcilláció index",
    pnaIndexSubtitle: "NOAA CPC havi csendes-óceáni-észak-amerikai index",
    soiIndexSubtitle: "NOAA PSL havi déli oszcilláció index",
    arcticOscillationIndexSubtitle: "NOAA CPC havi arktikus oszcilláció index",
    naturalVariabilityTitle: "Természetes változékonyság",
    naturalVariabilityNote: "ENSO és klímaindexek.",
    mapsSectionTitle: "Térképek",
    mapsSectionNote: "Friss globális időjárási térképek.",
    map2mTemperatureTitle: "Felszíni hőmérséklet (2m)",
    map2mTemperatureAnomalyTitle: "Felszíni hőmérsékleti anomália (2m)",
    mapSstTitle: "Tengerfelszíni hőmérséklet",
    mapSstAnomalyTitle: "Tengerfelszíni hőmérsékleti anomália",
    mapGlobalSubtitle: "Aktuális napi térkép · Climate Reanalyzer Today’s Weather",
    mapSstSubtitle: "Legfrissebb elérhető térkép · Climate Reanalyzer Today’s Weather",
    mapUnavailable: "A térkép nem érhető el",
    forcingTitle: "Éghajlati kényszerek",
    forcingNote: "Üvegházgázok és napsugárzás.",
    sourceTitle: "Adatforrás mód",
    sourceLive: "Élő adatforrások",
    sourceMixed: "Vegyes (élő + tartalék)",
    sourceBundled: "Beépített tartalékadatok",
    sourceLiveNote: "Minden adatsor távoli élő adatforrásból töltődött be.",
    sourceMixedNote: "Egy vagy több élő adatforrás nem elérhető; a hiányt tartalék adatok pótolják.",
    sourceBundledNote: "Minden élő adatforrás nem elérhető; minden grafikon tartalék adatokat használ.",
    sourceWarningsTitle: "Adatfigyelmeztetések",
    sourceStatusTitle: "Adatkészlet státusza",
    sourceUpdatedTitle: "Utolsó frissítés",
    sourceListTitle: "Forráshivatkozások",
    sourceListNote: "Elsődleges adatforrások.",
    sourceCardsTitle: "Adatok",
    sourceLabel: "Forrás",
    chartFullscreenEnter: "Teljes képernyő",
    chartFullscreenExit: "Kilépés",
    freshnessAsOf: "Dátum",
    freshnessDaily: "napi",
    freshnessMonthly: "havi",
    freshnessQuarterly: "negyedéves",
    freshnessAnnual: "éves",
    freshnessAssessment: "értékelési adatsor",
    freshnessLagging: "Késik",
    freshnessStale: "Elavult",
    ytdLabel: "évközi",
    chartLatest: "Legfrissebb",
    noData: "Nincs adat",
    valuesLoading: "A legfrissebb értékek betöltése",
    valueUnavailable: "Nincs érték",
    footerMode: "Mód",
    footerUpdated: "Frissítve",
    footerCredit: "Készítette: Tóth András és a GPT-5.3-Codex.",
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

function safeLanguage(raw: string | null): Language {
  return raw === "hu" ? "hu" : "en";
}

function safeTheme(raw: string | null): ThemeMode {
  if (raw === "dark" || raw === "light" || raw === "system") return raw;
  return "light";
}

function dashboardViewFromHash(hash: string): DashboardView {
  const normalized = hash.replace(/^#/, "");
  return DASHBOARD_VIEW_IDS.has(normalized as DashboardView) ? (normalized as DashboardView) : "overview";
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

function buildMapImageCandidates({
  path,
  fallbackFileName,
  versionToken,
  remoteUrls,
  preferGeneratedMap = true,
}: {
  path: string | null | undefined;
  fallbackFileName: string;
  versionToken: string;
  remoteUrls: Array<string | null | undefined>;
  preferGeneratedMap?: boolean;
}): { imageUrl: string; fallbackImageUrls: string[] } {
  const hasGeneratedMapMetadata = typeof path === "string" && path.trim().length > 0;
  const localImageUrl = buildMapAssetUrl(path, fallbackFileName, versionToken);
  const remoteImageUrls = uniqueNonEmptyStrings(remoteUrls);

  if ((hasGeneratedMapMetadata && preferGeneratedMap) || !remoteImageUrls.length) {
    return {
      imageUrl: localImageUrl,
      fallbackImageUrls: remoteImageUrls,
    };
  }

  return {
    imageUrl: remoteImageUrls[0],
    fallbackImageUrls: [...remoteImageUrls.slice(1), localImageUrl],
  };
}

function formatMapImageAlt(title: string, mapDateIso: string | null, language: Language): string {
  return mapDateIso ? `${title} (${formatDateLabel(mapDateIso, language)})` : title;
}

function formatAnnualAnomalyTopMeta(year: number, language: Language, isYtd: boolean, ytdLabel: string): string {
  const ytdSuffix = isYtd ? ` (${ytdLabel})` : "";
  if (language === "hu") return `Év: ${year}${ytdSuffix} · az 1850-1900-as referenciaidőszakhoz képest`;
  return `Year: ${year}${ytdSuffix} vs 1850-1900`;
}

function formatProjectionTopMeta(year: number, language: Language): string {
  if (language === "hu") return `Év: ${year} · becslés az 1850-1900-as referenciaidőszakhoz képest`;
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
  checks: SameDateTemperatureCheck[];
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
  const sourceGeneratedText = language === "hu" ? aiSummary?.textHu : aiSummary?.textEn;
  const generatedText = sourceGeneratedText
    ? localizeMetricMentions(sourceGeneratedText, [...snapshot.indicators, ...snapshot.forcing], language)
    : null;
  const headline = generatedText
    ? generatedText
    : warningChecks.length > 0
      ? `${warningChecks.map((check) => `${metricTitle(check.metric, language)} ${sameDateCheckReason(check, t)}`).join("; ")}.`
      : t.aiSummaryNoWarnings;

  return {
    tone,
    headline,
    bulletItems: splitAiSummaryBulletItems(headline),
    checks,
  };
}

function buildMonthLabels(language: Language): string[] {
  if (language === "hu") return ["Jan", "Febr", "Márc", "Ápr", "Máj", "Jún", "Júl", "Aug", "Szept", "Okt", "Nov", "Dec"];
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
}

const ENSO_TARGET_MONTH_LABELS: Record<string, { en: string; hu: string }> = {
  January: { en: "January", hu: "Január" },
  February: { en: "February", hu: "Február" },
  March: { en: "March", hu: "Március" },
  April: { en: "April", hu: "Április" },
  May: { en: "May", hu: "Máj" },
  June: { en: "June", hu: "Június" },
  July: { en: "July", hu: "Július" },
  August: { en: "August", hu: "Augusztus" },
  September: { en: "September", hu: "Szeptember" },
  October: { en: "October", hu: "Október" },
  November: { en: "November", hu: "November" },
  December: { en: "December", hu: "December" },
};
const ENSO_TARGET_SEASON_LABELS: Record<string, { en: string; hu: string }> = {
  DJF: { en: "December-February", hu: "December-Február" },
  JFM: { en: "January-March", hu: "Január-Március" },
  FMA: { en: "February-April", hu: "Február-Április" },
  MAM: { en: "March-May", hu: "Március-Máj" },
  AMJ: { en: "April-June", hu: "Április-Június" },
  MJJ: { en: "May-July", hu: "Máj-Július" },
  JJA: { en: "June-August", hu: "Június-Augusztus" },
  JAS: { en: "July-September", hu: "Július-Szeptember" },
  ASO: { en: "August-October", hu: "Augusztus-Október" },
  SON: { en: "September-November", hu: "Szeptember-November" },
  OND: { en: "October-December", hu: "Október-December" },
  NDJ: { en: "November-January", hu: "November-Január" },
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

function formatEnsoTargetLabel(targetLabel: string | null, language: Language): string {
  if (!targetLabel) return "-";
  const seasonMatch = /^([A-Z]{3})\s+(\d{4})$/.exec(targetLabel.trim());
  if (seasonMatch) {
    const seasonLabel = ENSO_TARGET_SEASON_LABELS[seasonMatch[1]]?.[language] ?? seasonMatch[1];
    return `${seasonLabel} ${seasonMatch[2]}`;
  }
  return targetLabel.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g,
    (match) => ENSO_TARGET_MONTH_LABELS[match]?.[language] ?? match
  );
}

function formatSourceShortName(shortName: string, language: Language): string {
  if (language === "hu" && shortName === "WGMS annual estimates") return "WGMS éves becslések";
  return shortName;
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

function tippingPointAccent(currentWarming: number | null, threshold: number): string {
  if (currentWarming == null || !Number.isFinite(currentWarming) || !Number.isFinite(threshold) || threshold <= 0) {
    return "#7db0ff";
  }
  const progress = clamp(currentWarming / threshold, 0, 1);
  const hue = Math.round(210 - progress * 210);
  const lightness = Math.round(48 + progress * 4);
  return `hsl(${hue} 78% ${lightness}%)`;
}

function tippingPointState(
  tippingPoint: TippingPointDefinition,
  currentWarming: number | null,
  t: (typeof STRINGS)[Language]
): string {
  if (currentWarming == null || !Number.isFinite(currentWarming)) return t.tippingStateBelow;
  if (currentWarming >= tippingPoint.centralThreshold) return t.tippingStateLikely;
  if (currentWarming >= tippingPoint.minThreshold) return t.tippingStatePossible;
  return t.tippingStateBelow;
}

function interpolateScenarioValue(anchors: Array<[number, number]>, year: number): number | null {
  if (!anchors.length) return null;
  const sortedAnchors = [...anchors].sort((left, right) => left[0] - right[0]);
  const first = sortedAnchors[0];
  const last = sortedAnchors[sortedAnchors.length - 1];
  if (year < first[0] || year > last[0]) return null;
  const exact = sortedAnchors.find(([anchorYear]) => anchorYear === year);
  if (exact) return exact[1];

  for (let index = 1; index < sortedAnchors.length; index += 1) {
    const previous = sortedAnchors[index - 1];
    const next = sortedAnchors[index];
    if (year < previous[0] || year > next[0]) continue;
    const fraction = (year - previous[0]) / (next[0] - previous[0]);
    return Math.round((previous[1] + (next[1] - previous[1]) * fraction) * 1000) / 1000;
  }

  return null;
}

function buildScenarioAnnualPoints(scenario: LongRangeScenarioDefinition): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (let year = LONG_RANGE_SCENARIO_START_YEAR; year <= LONG_RANGE_SCENARIO_END_YEAR; year += 1) {
    const value = interpolateScenarioValue(scenario.anchors, year);
    if (value == null) continue;
    points.push({ date: `${year}-01-01`, value });
  }
  return points;
}

function buildLongRangeTemperatureTrendOption({
  observedPoints,
  language,
  unit,
  compact,
  dark,
}: {
  observedPoints: DailyPoint[];
  language: Language;
  unit: string;
  compact: boolean;
  dark: boolean;
}): EChartsOption | null {
  const observedByYear = new Map<number, number>();
  for (const point of observedPoints) {
    const year = parseYearFromDateIso(point.date);
    if (year == null || !Number.isFinite(point.value)) continue;
    observedByYear.set(year, point.value);
  }
  if (!observedByYear.size) return null;

  const firstObservedYear = Math.min(...observedByYear.keys());
  const latestObservedYear = Math.max(...observedByYear.keys());
  const years: number[] = [];
  for (let year = firstObservedYear; year <= LONG_RANGE_SCENARIO_END_YEAR; year += 1) years.push(year);

  const formatter = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 1,
  });
  const palette = dark
    ? {
        axis: "rgba(148, 163, 184, 0.45)",
        label: "#cbd5e1",
        text: "#f1f5fb",
        grid: "rgba(148, 163, 184, 0.16)",
        tooltipBg: "rgba(15, 23, 42, 0.96)",
        tooltipBorder: "rgba(148, 163, 184, 0.48)",
        observed: "#7db0ff",
        legendBg: "rgba(15, 23, 42, 0.82)",
        legendBorder: "rgba(148, 163, 184, 0.32)",
      }
    : {
        axis: "rgba(15, 23, 42, 0.20)",
        label: "#334155",
        text: "#0f172a",
        grid: "rgba(15, 23, 42, 0.1)",
        tooltipBg: "rgba(15, 23, 42, 0.94)",
        tooltipBorder: "rgba(30, 41, 59, 0.24)",
        observed: "#0b69ff",
        legendBg: "rgba(248, 250, 252, 0.92)",
        legendBorder: "rgba(148, 163, 184, 0.38)",
      };

  const observedSeriesName = language === "hu" ? "Mért éves érték" : "Measured annual";
  const xLabels = years.map(String);
  const scenarioPoints = CMIP7_SCENARIOMIP_SCENARIOS.map((scenario) => ({
    scenario,
    label: scenarioDisplayLabel(scenario, language),
    value2100: scenario.anchors.find(([year]) => year === LONG_RANGE_SCENARIO_END_YEAR)?.[1] ?? null,
    color: dark ? scenario.colorDark : scenario.colorLight,
    points: buildScenarioAnnualPoints(scenario),
  }));
  const scenarioValueByLabel = new Map(
    scenarioPoints.map(({ label, value2100 }) => [label, value2100] as const)
  );
  const tippingThresholdMarkers =
    language === "hu"
      ? [
          { threshold: 1.5, label: "1,5 °C · WAIS + GrIS összeomlás, korallzátonyok" },
          { threshold: 2, label: "2,0 °C · hegyi gleccserek, Száhel-monszun" },
          { threshold: 3, label: "3,0 °C · Amazónia pusztulása, K-antarktiszi medencék" },
        ]
      : [
          { threshold: 1.5, label: "1.5 °C · WAIS + GrIS collapse, coral reefs" },
          { threshold: 2, label: "2.0 °C · mountain glaciers, Sahel monsoon" },
          { threshold: 3, label: "3.0 °C · Amazon dieback, E. Antarctic basins" },
        ];

  return {
    animation: false,
    aria: { enabled: true },
    grid: {
      top: compact ? 54 : 74,
      right: compact ? 28 : 86,
      bottom: compact ? 44 : 42,
      left: compact ? 54 : 66,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: "#f8fafc", fontWeight: 600 },
      extraCssText: "box-shadow: 0 14px 30px rgba(2, 6, 23, 0.28); max-width: min(360px, 78vw); white-space: normal;",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [];
        if (!rows.length) return "";
        const axisLabel = (rows[0] as { axisValueLabel?: string }).axisValueLabel ?? "";
        const lines = [axisLabel];
        for (const row of rows as Array<{ marker?: string; seriesName?: string; data?: number | null }>) {
          if (typeof row.data !== "number" || !Number.isFinite(row.data)) continue;
          lines.push(`${row.marker ?? ""} ${row.seriesName ?? ""}: ${formatter.format(row.data)} ${unit}`);
        }
        return lines.join("<br/>");
      },
    },
    legend: {
      show: true,
      top: 4,
      left: 8,
      right: 8,
      itemWidth: 14,
      itemHeight: 8,
      itemGap: compact ? 8 : 12,
      padding: [6, 10],
      backgroundColor: palette.legendBg,
      borderColor: palette.legendBorder,
      borderWidth: 1,
      borderRadius: 10,
      textStyle: { color: palette.text, fontWeight: 650, fontSize: compact ? 10 : 12, lineHeight: 16 },
      formatter: (name: string) => {
        const value2100 = scenarioValueByLabel.get(name);
        if (value2100 == null) return name;
        return `${name} · 2100: ${formatter.format(value2100)}${unit}`;
      },
    },
    xAxis: {
      type: "category",
      data: xLabels,
      axisLine: { lineStyle: { color: palette.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: palette.label,
        fontWeight: 600,
        formatter: (value: string) => {
          const year = Number(value);
          if (!Number.isFinite(year)) return "";
          if (year === firstObservedYear || year === latestObservedYear || year === 2050 || year === 2100) return value;
          return year % 20 === 0 ? value : "";
        },
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 4,
      name: unit,
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: compact ? 40 : 48,
      nameTextStyle: { color: palette.label, fontWeight: 700, fontSize: compact ? 11 : 12 },
      axisLabel: {
        color: palette.label,
        formatter: (value: number) => formatter.format(value),
      },
      splitLine: { lineStyle: { color: palette.grid, type: [4, 5] } },
    },
    series: [
      {
        name: observedSeriesName,
        type: "line",
        data: years.map((year) => observedByYear.get(year) ?? null),
        smooth: 0.18,
        showSymbol: false,
        connectNulls: false,
        z: 5,
        lineStyle: { color: palette.observed, width: compact ? 2.6 : 3.2, cap: "round" },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", width: 1.3, color: dark ? "rgba(248, 113, 113, 0.55)" : "rgba(220, 38, 38, 0.45)" },
          label: {
            show: !compact,
            position: "insideStartTop" as const,
            color: dark ? "#fca5a5" : "#a32d2d",
            fontSize: 10.5,
            fontWeight: 700,
            padding: [0, 0, 2, 2],
          },
          data: tippingThresholdMarkers.map((marker) => ({
            yAxis: marker.threshold,
            label: { formatter: marker.label },
          })),
        },
      },
      ...scenarioPoints.map(({ label, color, points }) => {
        const valuesByYear = new Map(points.map((point) => [parseYearFromDateIso(point.date), point.value] as const));
        return {
          name: label,
          type: "line" as const,
          data: years.map((year) => valuesByYear.get(year) ?? null),
          smooth: 0.22,
          showSymbol: false,
          connectNulls: false,
          z: 4,
          lineStyle: { color, width: compact ? 2.1 : 2.6, cap: "round" as const },
        };
      }),
      ...scenarioPoints.map(({ label, color, scenario, value2100 }) => {
        return {
          name: label,
          type: "scatter" as const,
          data: value2100 == null ? [] : [[String(LONG_RANGE_SCENARIO_END_YEAR), value2100]],
          symbolSize: compact ? 6 : 8,
          itemStyle: { color },
          tooltip: { show: false },
          label: {
            show: !compact,
            position: "right" as const,
            color,
            fontWeight: 800,
            formatter: () => `${scenario.shortLabel} ${value2100 == null ? "" : formatter.format(value2100)}${unit}`,
          },
          z: 8,
        };
      }),
    ],
  };
}

function buildAnnualProjectionTrendOption({
  points,
  projection,
  seriesName,
  projectionSeriesName,
  rangeLabel,
  unit,
  decimals = 2,
  compact,
  dark = false,
  yAxisMin,
  yAxisMax,
  yAxisUnitLabel,
  xAxisYearLabelStep = 1,
  disableDataZoom = false,
  forceMappedYearLabels = false,
  showLegend = false,
  color,
  referenceLines,
  labels,
}: {
  points: DailyPoint[];
  projection: AnnualProjectionEstimate | null;
  seriesName: string;
  projectionSeriesName: string;
  rangeLabel: string;
  unit: string;
  decimals?: number;
  compact: boolean;
  dark?: boolean;
  yAxisMin?: number;
  yAxisMax?: number;
  yAxisUnitLabel?: string;
  xAxisYearLabelStep?: number;
  disableDataZoom?: boolean;
  forceMappedYearLabels?: boolean;
  showLegend?: boolean;
  color?: string;
  referenceLines?: Array<{
    value: number;
    label: string;
    color: string;
  }>;
  labels?: {
    noData: string;
    latest: string;
  };
}) {
  const option = buildClimateTrendOption({
    points,
    seriesName,
    unit,
    decimals,
    yAxisMin,
    yAxisMax,
    yAxisUnitLabel,
    xAxisYearLabelStep,
    disableDataZoom,
    forceMappedYearLabels,
    showLegend,
    compact,
    dark,
    color,
    referenceLines,
    labels,
  });

  if (!projection || !points.length) return option;

  const projectionDate = `${projection.year}-01-01`;
  const projectionIndex = points.findIndex((point) => point.date === projectionDate);
  if (projectionIndex < 0) return option;

  const historicalLineColor = topicChartColor(DAILY_GLOBAL_MEAN_ANOMALY_KEY, dark);
  const historicalAreaColor = dark ? "rgba(251, 113, 133, 0.12)" : "rgba(225, 29, 47, 0.12)";
  const projectionLineColor = dark ? "#fda4af" : "#be123c";
  const projectionBandFill = dark ? "rgba(251, 113, 133, 0.20)" : "rgba(225, 29, 47, 0.16)";
  const projectionBandStroke = dark ? "#fda4af" : "#be123c";
  const intervalMarkerFill = dark ? "#fff1f2" : "#fff1f2";
  const historicalLineData = points.map((point) => point.value);
  const projectedScatterData = points.map((point, index) => (index === projectionIndex ? projection.value : null));
  const projectedLowScatterData = points.map((point, index) => (index === projectionIndex ? projection.low : null));
  const projectedHighScatterData = points.map((point, index) => (index === projectionIndex ? projection.high : null));
  const tooltipNumberFormat = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const baseTooltip =
    option.tooltip && typeof option.tooltip === "object" && !Array.isArray(option.tooltip) ? option.tooltip : {};

  return {
    ...option,
    tooltip: {
      ...baseTooltip,
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [];
        if (!rows.length) return "";

        const firstRow = rows[0] as { axisValue?: string; axisValueLabel?: string };
        const rawAxisValue =
          typeof firstRow.axisValue === "string"
            ? firstRow.axisValue
            : typeof firstRow.axisValueLabel === "string"
              ? firstRow.axisValueLabel
              : "";
        const axisYear = parseYearFromDateIso(rawAxisValue);
        const tooltipLines = [Number.isFinite(axisYear) ? String(axisYear) : rawAxisValue];

        const actualRow = rows.find(
          (row) =>
            (row as { seriesName?: string; data?: number | null }).seriesName === seriesName &&
            typeof (row as { data?: number | null }).data === "number"
        ) as { marker?: string; data?: number | null } | undefined;
        const projectedRow = rows.find(
          (row) => (row as { seriesName?: string }).seriesName === projectionSeriesName
        ) as { marker?: string; data?: number | null } | undefined;

        if (typeof actualRow?.data === "number" && Number.isFinite(actualRow.data)) {
          tooltipLines.push(`${actualRow.marker ?? ""} ${seriesName}: ${tooltipNumberFormat.format(actualRow.data)} ${unit}`);
        }
        if (typeof projectedRow?.data === "number" && Number.isFinite(projectedRow.data)) {
          tooltipLines.push(
            `${projectedRow.marker ?? ""} ${projectionSeriesName}: ${tooltipNumberFormat.format(projectedRow.data)} ${unit}`
          );
          tooltipLines.push(
            `${rangeLabel}: ${tooltipNumberFormat.format(projection.low)}-${tooltipNumberFormat.format(projection.high)} ${unit}`
          );
        }

        return tooltipLines.join("<br/>");
      },
    },
    series: [
      {
        name: seriesName,
        type: "line" as const,
        data: historicalLineData,
        z: 2,
        smooth: 0.16,
        showSymbol: false,
        symbol: "circle",
        symbolSize: compact ? 5 : 6,
        lineStyle: {
          color: historicalLineColor,
          width: 2.4,
        },
        itemStyle: {
          color: historicalLineColor,
        },
        areaStyle: {
          color: historicalAreaColor,
        },
      },
      {
        name: rangeLabel,
        type: "custom" as const,
        silent: true,
        tooltip: { show: false },
        z: 4,
        data: [[projectionDate, projection.low, projection.high]],
        renderItem: (_params: unknown, api: any) => {
          const xValue = String(api.value(0));
          const lowValue = Number(api.value(1));
          const highValue = Number(api.value(2));
          const lowPoint = api.coord([xValue, lowValue]) as [number, number];
          const highPoint = api.coord([xValue, highValue]) as [number, number];
          const x = lowPoint[0];
          const topY = highPoint[1];
          const bottomY = lowPoint[1];
          const halfWidth = compact ? 11 : 13;
          const bodyWidth = compact ? 8 : 10;

          return {
            type: "group",
            children: [
              {
                type: "rect",
                shape: {
                  x: x - bodyWidth / 2,
                  y: topY,
                  width: bodyWidth,
                  height: Math.max(bottomY - topY, 1),
                },
                style: {
                  fill: projectionBandFill,
                  stroke: projectionBandStroke,
                  lineWidth: 1,
                },
              },
              {
                type: "line",
                shape: { x1: x, y1: topY, x2: x, y2: bottomY },
                style: {
                  stroke: projectionBandStroke,
                  lineWidth: 2.1,
                },
              },
              {
                type: "line",
                shape: { x1: x - halfWidth, y1: topY, x2: x + halfWidth, y2: topY },
                style: {
                  stroke: projectionBandStroke,
                  lineWidth: 2.1,
                },
              },
              {
                type: "line",
                shape: { x1: x - halfWidth, y1: bottomY, x2: x + halfWidth, y2: bottomY },
                style: {
                  stroke: projectionBandStroke,
                  lineWidth: 2.1,
                },
              },
            ],
          };
        },
      },
      {
        name: rangeLabel,
        type: "scatter" as const,
        data: projectedLowScatterData,
        tooltip: { show: false },
        z: 5,
        symbol: "circle",
        symbolSize: compact ? 8 : 9,
        itemStyle: {
          color: intervalMarkerFill,
          borderColor: projectionBandStroke,
          borderWidth: 1.4,
        },
      },
      {
        name: rangeLabel,
        type: "scatter" as const,
        data: projectedHighScatterData,
        tooltip: { show: false },
        z: 5,
        symbol: "circle",
        symbolSize: compact ? 8 : 9,
        itemStyle: {
          color: intervalMarkerFill,
          borderColor: projectionBandStroke,
          borderWidth: 1.4,
        },
      },
      {
        name: projectionSeriesName,
        type: "scatter" as const,
        data: projectedScatterData,
        z: 6,
        symbol: "diamond",
        symbolSize: compact ? 13 : 15,
        itemStyle: {
          color: projectionLineColor,
          borderColor: dark ? "#f8fafc" : "#ffffff",
          borderWidth: 1.7,
        },
      },
    ],
  } as ReturnType<typeof buildClimateTrendOption>;
}

function buildAnnualProjectionBarOption({
  points,
  projection,
  observedSeriesName,
  projectionSeriesName,
  intervalLabel,
  unit,
  decimals = 2,
  compact,
  dark = false,
  yAxisMin,
  yAxisMax,
  yAxisUnitLabel,
}: {
  points: DailyPoint[];
  projection: AnnualProjectionEstimate | null;
  observedSeriesName: string;
  projectionSeriesName: string;
  intervalLabel: string;
  unit: string;
  decimals?: number;
  compact: boolean;
  dark?: boolean;
  yAxisMin: number;
  yAxisMax: number;
  yAxisUnitLabel?: string;
}) {
  if (!projection) return null;

  const historicalPoints = points
    .map((point) => ({ year: parseYearFromDateIso(point.date), value: point.value }))
    .filter((point): point is { year: number; value: number } => point.year != null && point.year < projection.year)
    .slice(-6);
  if (!historicalPoints.length) return null;

  const categories = [...historicalPoints.map((point) => String(point.year)), String(projection.year)];
  const historicalBarTopColor = topicChartColor(DAILY_GLOBAL_MEAN_ANOMALY_KEY, dark);
  const historicalBarBottomColor = dark ? "rgba(251, 113, 133, 0.16)" : "rgba(225, 29, 47, 0.14)";
  const projectedBarColor = dark ? "#fda4af" : "#be123c";
  const observedBarStyle = {
    borderRadius: [7, 7, 2, 2],
    color: {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: historicalBarTopColor },
        { offset: 1, color: historicalBarBottomColor },
      ],
    },
  };
  const barData = [
    ...historicalPoints.map((point) => ({ value: point.value })),
    {
      value: projection.value,
      itemStyle: {
        borderRadius: [7, 7, 2, 2],
        color: projectedBarColor,
      },
    },
  ];
  const tooltipNumberFormat = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const textColor = dark ? "#dbe7f6" : "#33415c";
  const mutedTextColor = dark ? "#91a0b8" : "#66728a";
  const axisColor = dark ? "rgba(203, 214, 232, 0.22)" : "rgba(51, 65, 85, 0.16)";
  const splitLineColor = dark ? "rgba(203, 214, 232, 0.12)" : "rgba(51, 65, 85, 0.09)";

  return {
    animationDuration: 420,
    grid: {
      left: compact ? 48 : 58,
      right: compact ? 18 : 24,
      top: compact ? 20 : 28,
      bottom: compact ? 34 : 38,
      containLabel: false,
    },
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      backgroundColor: dark ? "#0f172a" : "#ffffff",
      borderColor: dark ? "rgba(203, 214, 232, 0.18)" : "rgba(15, 23, 42, 0.12)",
      textStyle: { color: dark ? "#f8fafc" : "#0f172a" },
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [];
        const firstRow = rows[0] as { axisValue?: string } | undefined;
        const axisYear = firstRow?.axisValue ?? "";
        const tooltipLines = [axisYear];
        const barRow = rows.find(
          (row) => (row as { seriesName?: string }).seriesName === observedSeriesName
        ) as { marker?: string; data?: number | { value?: number }; value?: number } | undefined;
        const barValue =
          typeof barRow?.value === "number"
            ? barRow.value
            : typeof barRow?.data === "number"
              ? barRow.data
              : typeof barRow?.data === "object" && barRow.data != null && typeof barRow.data.value === "number"
                ? barRow.data.value
                : null;

        if (barValue != null && axisYear === String(projection.year)) {
          tooltipLines.push(
            `${barRow?.marker ?? ""} ${projectionSeriesName}: ${tooltipNumberFormat.format(barValue)} ${unit}`
          );
          tooltipLines.push(
            `${intervalLabel}: ${tooltipNumberFormat.format(projection.low)}-${tooltipNumberFormat.format(projection.high)} ${unit}`
          );
        } else if (barValue != null) {
          tooltipLines.push(`${barRow?.marker ?? ""} ${observedSeriesName}: ${tooltipNumberFormat.format(barValue)} ${unit}`);
        }
        return tooltipLines.join("<br/>");
      },
    },
    xAxis: {
      type: "category" as const,
      data: categories,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: {
        color: mutedTextColor,
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
      },
    },
    yAxis: {
      type: "value" as const,
      min: yAxisMin,
      max: yAxisMax,
      name: yAxisUnitLabel,
      nameTextStyle: {
        color: mutedTextColor,
        fontSize: compact ? 10 : 11,
        padding: [0, 0, 6, 0],
      },
      axisLabel: {
        color: mutedTextColor,
        fontSize: compact ? 10 : 11,
        formatter: (value: number) => value.toFixed(1),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: { color: splitLineColor, type: "dashed" as const },
      },
    },
    series: [
      {
        name: observedSeriesName,
        type: "bar" as const,
        data: barData,
        barWidth: compact ? 22 : 28,
        itemStyle: observedBarStyle,
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed" as const, width: 1.3 },
          label: {
            color: textColor,
            fontSize: compact ? 10 : 11,
          },
          data: [
            { yAxis: 1.5, label: { formatter: "1.5°C" }, lineStyle: { color: dark ? "#fbbf24" : "#f59e0b" } },
            { yAxis: 2, label: { formatter: "2.0°C" }, lineStyle: { color: dark ? "#f87171" : "#dc2626" } },
          ],
        },
      },
    ],
  } as ReturnType<typeof buildClimateTrendOption>;
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

function topicChartColor(metricKey: ClimateMetricSeries["key"], dark: boolean): string {
  const category = topSummaryCategoryClass(metricKey);
  switch (category) {
    case "topcat-temperature":
    case "topcat-anomaly":
      return dark ? "#f08a8a" : "#c55353";
    case "topcat-sea-ice":
      return dark ? "#94b4df" : "#4f86bf";
    case "topcat-forcing":
    case "topcat-enso":
      return dark ? "#9ab47a" : "#78945b";
    case "topcat-ocean":
    case "topcat-neutral":
    default:
      return dark ? "#91b7e4" : "#4f86bf";
  }
}

function topicChartSoftColor(metricKey: ClimateMetricSeries["key"], dark: boolean): string {
  const category = topSummaryCategoryClass(metricKey);
  switch (category) {
    case "topcat-temperature":
    case "topcat-anomaly":
      return dark ? "rgba(240, 138, 138, 0.42)" : "rgba(197, 83, 83, 0.34)";
    case "topcat-sea-ice":
      return dark ? "rgba(148, 180, 223, 0.42)" : "rgba(79, 134, 191, 0.34)";
    case "topcat-forcing":
    case "topcat-enso":
      return dark ? "rgba(154, 180, 122, 0.42)" : "rgba(120, 148, 91, 0.34)";
    case "topcat-ocean":
    case "topcat-neutral":
    default:
      return dark ? "rgba(145, 183, 228, 0.42)" : "rgba(79, 134, 191, 0.34)";
  }
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
      return { min: 0, max: 2600 };
    case "greenland_ice_sheet_mass_balance":
      return { min: 0, max: 6200 };
    case "northern_hemisphere_surface_temperature":
      return { min: 6, max: 24 };
    case "southern_hemisphere_surface_temperature":
      return { min: 9, max: 18 };
    case "arctic_surface_temperature":
      return { min: -35, max: 10 };
    case "antarctic_surface_temperature":
      return { min: -40, max: -8 };
    case "north_atlantic_sea_surface_temperature":
      return { min: 18, max: 26 };
    case "global_sea_ice_extent":
      return { min: 10, max: 30 };
    case "arctic_sea_ice_extent":
      return { min: 2, max: 18 };
    case "antarctic_sea_ice_extent":
      return { min: 0, max: 22 };
    case "northern_hemisphere_snow_cover_extent":
      return { min: 0, max: 55 };
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
    case "global_surface_temperature_anomaly":
    case "global_sea_surface_temperature_anomaly":
    case "northern_hemisphere_surface_temperature_anomaly":
    case "southern_hemisphere_surface_temperature_anomaly":
    case "arctic_surface_temperature_anomaly":
    case "antarctic_surface_temperature_anomaly":
    case "north_atlantic_sea_surface_temperature_anomaly":
    case "daily_global_mean_temperature_anomaly":
      return "°C";
    case "global_mean_sea_level":
      return language === "hu" ? "milliméter (mm)" : "millimeters (mm)";
    case "ocean_heat_content":
      return language === "hu" ? "10^22 joule" : "10^22 joules";
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

function forcingYAxisUnitLabel(metricKey: ClimateMetricSeries["key"], language: Language): string | undefined {
  switch (metricKey) {
    case "atmospheric_co2":
      return language === "hu" ? "CO2 ppm" : "CO2 parts per million (ppm)";
    case "atmospheric_ch4":
      return language === "hu" ? "CH4 ppb" : "CH4 parts per billion (ppb)";
    case "atmospheric_n2o":
      return language === "hu" ? "N2O ppb" : "N2O parts per billion (ppb)";
    case "atmospheric_aggi":
      return language === "hu" ? "AGGI index (1990=1)" : "AGGI index (1990=1)";
    case "incoming_solar_energy":
      return language === "hu" ? "teljes napsugárzás (W/m²)" : "total solar irradiance (W/m²)";
    default:
      return undefined;
  }
}

function forcingAxisBounds(metricKey: ClimateMetricSeries["key"]): { yMin?: number; yMax?: number; minYear?: number } {
  switch (metricKey) {
    case "atmospheric_co2":
      return { yMin: 280, yMax: 500, minYear: 1974 };
    case "atmospheric_ch4":
      return { yMin: 1500, yMax: 2050, minYear: 1983 };
    case "atmospheric_n2o":
      return { yMin: 300, yMax: 360, minYear: 2001 };
    case "atmospheric_aggi":
      return { yMin: 0.7, yMax: 1.8, minYear: 1979 };
    case "incoming_solar_energy":
      return { yMin: 1360, yMax: 1363, minYear: 2018 };
    default:
      return {};
  }
}

function cardUnitLabel(metricKey: ClimateMetricSeries["key"], unit: string, language: Language): string {
  if (
    GLOBAL_TEMPERATURE_KEYS.has(metricKey) ||
    REGIONAL_TEMPERATURE_KEYS.has(metricKey) ||
    TEMPERATURE_ANOMALY_KEYS.has(metricKey) ||
    REGIONAL_TEMPERATURE_ANOMALY_KEYS.has(metricKey) ||
    metricKey === DAILY_GLOBAL_MEAN_ANOMALY_KEY ||
    metricKey === "nino34_index"
  ) {
    return "°C";
  }
  if (VARIABILITY_INDEX_KEY_SET.has(metricKey)) return "index";
  if (language !== "hu") return unit;
  if (SEA_ICE_KEYS.has(metricKey) || SNOW_COVER_KEYS.has(metricKey)) return "millió km²";
  if (metricKey === "global_mean_sea_level") return "mm";
  if (metricKey === "ocean_heat_content") return "10^22 J";
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
    case "north_atlantic_sea_surface_temperature_anomaly":
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
  const [language, setLanguage] = useState<Language>(() => safeLanguage(localStorage.getItem(STORAGE_LANG_KEY)));
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => safeTheme(localStorage.getItem(STORAGE_THEME_KEY)));
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(safeTheme(localStorage.getItem(STORAGE_THEME_KEY))));
  const [compact, setCompact] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 980px)").matches;
  });
  const [dataSource, setDataSource] = useState<DashboardDataSource>(() =>
    createBundledDataSource("Loading live climate feeds; using bundled fallback in the meantime.")
  );
  const [runtimeDataReady, setRuntimeDataReady] = useState(false);
  const [climateSectionOpen, setClimateSectionOpen] = useState(true);
  const [indicatorSubsectionsOpen, setIndicatorSubsectionsOpen] = useState<Record<IndicatorSubsectionKey, boolean>>({
    globalTemperatures: true,
    temperatureAnomalies: true,
    regionalTemperatures: true,
    regionalTemperatureAnomalies: true,
    oceans: true,
    earthEnergyImbalance: true,
    seaIce: true,
    snowCover: true,
    iceSheetsAndGlaciers: true,
  });
  const [mapsSectionOpen, setMapsSectionOpen] = useState(true);
  const [forcingSectionOpen, setForcingSectionOpen] = useState(true);
  const [variabilitySectionOpen, setVariabilitySectionOpen] = useState(true);
  const [projectionsSectionOpen, setProjectionsSectionOpen] = useState(true);
  const [activeView, setActiveView] = useState<DashboardView>(() => {
    if (typeof window === "undefined") return "overview";
    return dashboardViewFromHash(window.location.hash);
  });

  const t = STRINGS[language];
  const ensoOutlook = dataSource.ensoOutlook ?? null;

  useEffect(() => {
    localStorage.setItem(STORAGE_LANG_KEY, language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem(STORAGE_THEME_KEY, themeMode);

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
    if (typeof window === "undefined") return;
    const handleHashChange = () => setActiveView(dashboardViewFromHash(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

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
    }));
    if (ensoSource?.sourceUrl) {
      sources.push({
        key: "enso-outlook-footer-source",
        url: ensoSource.sourceUrl,
        title: t.ensoOutlookTitle,
        provider: ensoSource.sourceLabel || "NOAA CPC",
        section: "outlook",
        label: `${t.ensoOutlookTitle} · ${ensoSource.sourceLabel || "NOAA CPC"}`,
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
  const projectedAnnualGlobalMeanAnomaly = useMemo(() => {
    if (!dailyGlobalMeanAnomalyMetric || !annualGlobalMeanAnomalyIsYtd) return null;
    return buildAnnualProjectionEstimate(dailyGlobalMeanAnomalyMetric.points, ensoOutlook);
  }, [dailyGlobalMeanAnomalyMetric, annualGlobalMeanAnomalyIsYtd, ensoOutlook]);
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
  const earthEnergyImbalanceTrendPoints = useMemo(
    () => (earthEnergyImbalanceMetric ? buildTrailingMeanSeries(earthEnergyImbalanceMetric.points, 12) : []),
    [earthEnergyImbalanceMetric]
  );
  const variabilityChartPanels = useMemo(
    () =>
      variabilityMetrics
        .flatMap((metric) => {
          if (!metric.points.length) return [];
          const isTemperatureIndex = metric.key === "nino34_index";
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
          return [{
            metric,
            subtitle,
            option: buildForcingTrendOption({
              points: metric.points,
              title: metricTitle(metric, language),
              unit: cardUnitLabel(metric.key, metric.unit, language),
              decimals: metric.decimals,
              yAxisMin: isTemperatureIndex ? -3 : -4,
              yAxisMax: isTemperatureIndex ? 3 : 4,
              yAxisUnitLabel: isTemperatureIndex ? "°C" : "index",
              xAxisStartYear: 1950,
              compact,
              dark: resolvedTheme === "dark",
              color: topicChartColor(metric.key, resolvedTheme === "dark"),
              labels: {
                noData: t.noData,
                latest: t.chartLatest,
              },
            }),
          }];
        }),
    [
      compact,
      language,
      resolvedTheme,
      t.arcticOscillationIndexSubtitle,
      t.chartLatest,
      t.naoIndexSubtitle,
      t.nino34IndexSubtitle,
      t.noData,
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
  const projectedAnnualOverviewChartOption = useMemo(() => {
    if (!dailyGlobalMeanAnomalyMetric || !projectedAnnualGlobalMeanAnomaly || !projectedAnnualChartPoints.length) return null;

    return buildAnnualProjectionBarOption({
      points: projectedAnnualChartPoints,
      projection: projectedAnnualGlobalMeanAnomaly,
      observedSeriesName: t.annualGlobalTemperatureAnomalyTitle,
      projectionSeriesName: t.projectedAnnualTemperatureAnomalyTitle,
      intervalLabel: t.projectionIntervalLabel,
      unit: cardUnitLabel(dailyGlobalMeanAnomalyMetric.key, dailyGlobalMeanAnomalyMetric.unit, language),
      decimals: dailyGlobalMeanAnomalyMetric.decimals,
      yAxisMin: PROJECTION_OVERVIEW_Y_MIN,
      yAxisMax: PROJECTION_OVERVIEW_Y_MAX,
      yAxisUnitLabel: indicatorYAxisUnitLabel(dailyGlobalMeanAnomalyMetric.key, language),
      compact,
      dark: resolvedTheme === "dark",
    });
  }, [
    compact,
    dailyGlobalMeanAnomalyMetric,
    language,
    projectedAnnualChartPoints,
    projectedAnnualGlobalMeanAnomaly,
    resolvedTheme,
    t.annualGlobalTemperatureAnomalyTitle,
    t.projectedAnnualTemperatureAnomalyTitle,
    t.projectionIntervalLabel,
  ]);
  const longRangeTemperatureTrendOption = useMemo(() => {
    if (!dailyGlobalMeanAnomalyMetric || !annualGlobalMeanAnomalyPoints.length) return null;
    return buildLongRangeTemperatureTrendOption({
      observedPoints: annualGlobalMeanAnomalyPoints,
      language,
      unit: cardUnitLabel(dailyGlobalMeanAnomalyMetric.key, dailyGlobalMeanAnomalyMetric.unit, language),
      compact,
      dark: resolvedTheme === "dark",
    });
  }, [annualGlobalMeanAnomalyPoints, compact, dailyGlobalMeanAnomalyMetric, language, resolvedTheme]);
  const longRangeScenarioSummaries = useMemo(
    () =>
      CMIP7_SCENARIOMIP_SCENARIOS.map((scenario) => ({
        key: scenario.key,
        label: scenarioDisplayLabel(scenario, language),
        value2100: scenario.anchors.find(([year]) => year === LONG_RANGE_SCENARIO_END_YEAR)?.[1] ?? null,
        color: resolvedTheme === "dark" ? scenario.colorDark : scenario.colorLight,
      })),
    [language, resolvedTheme]
  );
  const currentTippingWarming = latestAnnualGlobalMeanAnomaly?.value ?? null;
  const tippingPointCards = useMemo(
    () =>
      MCKAY_TIPPING_POINTS.map((tippingPoint) => ({
        key: tippingPoint.key,
        label: tippingPointLabel(tippingPoint, language),
        category: tippingPointCategory(tippingPoint, language),
        centralThreshold: tippingPoint.centralThreshold,
        minThreshold: tippingPoint.minThreshold,
        maxThreshold: tippingPoint.maxThreshold,
        state: tippingPointState(tippingPoint, currentTippingWarming, t),
        accent: tippingPointAccent(currentTippingWarming, tippingPoint.centralThreshold),
      })),
    [currentTippingWarming, language, t]
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
  const regionalSummaryMetrics = useMemo(
    () =>
      snapshot.indicators
        .filter((metric) => REGIONAL_TEMPERATURE_KEYS.has(metric.key))
        .sort((left, right) => {
          const leftRank = REGIONAL_TEMPERATURE_RANK.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = REGIONAL_TEMPERATURE_RANK.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [snapshot.indicators]
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
  const regionalTemperatureAnomalySummaryMetrics = useMemo(
    () =>
      snapshot.indicators
        .filter((metric) => REGIONAL_TEMPERATURE_ANOMALY_KEYS.has(metric.key))
        .sort((left, right) => {
          const leftRank = REGIONAL_TEMPERATURE_ANOMALY_RANK.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = REGIONAL_TEMPERATURE_ANOMALY_RANK.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [snapshot.indicators]
  );
  const seaIceIndicatorLines = useMemo(
    () => indicatorLines.filter(({ metric }) => SEA_ICE_KEYS.has(metric.key)),
    [indicatorLines]
  );
  const snowCoverIndicatorLines = useMemo(
    () => indicatorLines.filter(({ metric }) => SNOW_COVER_KEYS.has(metric.key)),
    [indicatorLines]
  );
  const seaIceSummaryMetrics = useMemo(
    () =>
      snapshot.indicators
        .filter((metric) => SEA_ICE_SUMMARY_RANK.has(metric.key))
        .sort((left, right) => {
          const leftRank = SEA_ICE_SUMMARY_RANK.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = SEA_ICE_SUMMARY_RANK.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [snapshot.indicators]
  );
  const snowCoverSummaryMetrics = useMemo(
    () =>
      snapshot.indicators
        .filter((metric) => SNOW_COVER_SUMMARY_RANK.has(metric.key))
        .sort((left, right) => {
          const leftRank = SNOW_COVER_SUMMARY_RANK.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = SNOW_COVER_SUMMARY_RANK.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [snapshot.indicators]
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
      preferGeneratedMap: surfaceFreshness?.tone !== "stale",
    });
    const surfaceAnomalyImageCandidates = buildMapImageCandidates({
      path: mapAssets.global_2m_temperature_anomaly?.path,
      fallbackFileName: LOCAL_MAP_FILENAMES.global_2m_temperature_anomaly,
      versionToken: mapVersion,
      remoteUrls: [mapAssets.global_2m_temperature_anomaly?.sourceUrl, CURRENT_MAP_REMOTE_URLS.global_2m_temperature_anomaly],
      preferGeneratedMap: surfaceAnomalyFreshness?.tone !== "stale",
    });
    const sstImageCandidates = buildMapImageCandidates({
      path: mapAssets.global_sst?.path,
      fallbackFileName: LOCAL_MAP_FILENAMES.global_sst,
      versionToken: mapVersion,
      remoteUrls: [mapAssets.global_sst?.sourceUrl, CURRENT_MAP_REMOTE_URLS.global_sst],
      preferGeneratedMap: sstFreshness?.tone !== "stale",
    });
    const sstAnomalyImageCandidates = buildMapImageCandidates({
      path: mapAssets.global_sst_anomaly?.path,
      fallbackFileName: LOCAL_MAP_FILENAMES.global_sst_anomaly,
      versionToken: mapVersion,
      remoteUrls: [mapAssets.global_sst_anomaly?.sourceUrl, CURRENT_MAP_REMOTE_URLS.global_sst_anomaly],
      preferGeneratedMap: sstAnomalyFreshness?.tone !== "stale",
    });

    return [
      {
        key: "map-2m-temperature",
        title: t.map2mTemperatureTitle,
        subtitle: surfaceSubtitle,
        imageUrl: surfaceImageCandidates.imageUrl,
        fallbackImageUrls: surfaceImageCandidates.fallbackImageUrls,
        imageAlt: formatMapImageAlt(t.map2mTemperatureTitle, surfaceMapDisplayDateIso, language),
        freshness: surfaceFreshness,
      },
      {
        key: "map-2m-temperature-anomaly",
        title: t.map2mTemperatureAnomalyTitle,
        subtitle: surfaceSubtitle,
        imageUrl: surfaceAnomalyImageCandidates.imageUrl,
        fallbackImageUrls: surfaceAnomalyImageCandidates.fallbackImageUrls,
        imageAlt: formatMapImageAlt(t.map2mTemperatureAnomalyTitle, surfaceAnomalyMapDisplayDateIso, language),
        freshness: surfaceAnomalyFreshness,
      },
      {
        key: "map-sst",
        title: t.mapSstTitle,
        subtitle: sstSubtitle,
        imageUrl: sstImageCandidates.imageUrl,
        fallbackImageUrls: sstImageCandidates.fallbackImageUrls,
        imageAlt: formatMapImageAlt(t.mapSstTitle, sstMapDisplayDateIso, language),
        freshness: sstFreshness,
      },
      {
        key: "map-sst-anomaly",
        title: t.mapSstAnomalyTitle,
        subtitle: sstSubtitle,
        imageUrl: sstAnomalyImageCandidates.imageUrl,
        fallbackImageUrls: sstAnomalyImageCandidates.fallbackImageUrls,
        imageAlt: formatMapImageAlt(t.mapSstAnomalyTitle, sstAnomalyMapDisplayDateIso, language),
        freshness: sstAnomalyFreshness,
      },
    ];
  }, [snapshot.updatedAtIso, dataSource.maps, language, t]);

  const renderIndicatorPanel = (
    metric: ClimateMetricSeries,
    lines: Array<{ year: number; points: Array<[number, number]> }>,
    currentYear: number,
    climatology: DailyClimatologyEnvelope | null
  ) => {
    const bounds = indicatorYAxisBounds(metric.key);
    const yAxisLabel = indicatorYAxisUnitLabel(metric.key, language);
    const freshness = metricFreshnessBadge(metric, language, t);

    return (
      <EChartsPanel
        key={metric.key}
        title={metricTitle(metric, language)}
        subtitle={formatSourceShortName(metric.source.shortName, language)}
        expandLabel={t.chartFullscreenEnter}
        collapseLabel={t.chartFullscreenExit}
        freshnessLabel={freshness.label}
        freshnessTone={freshness.tone}
        option={buildClimateMonthlyComparisonOption({
          monthLabels: monthlyLabels,
          lines,
          unit: cardUnitLabel(metric.key, metric.unit, language),
          decimals: metric.decimals,
          yAxisMin: bounds.min,
          yAxisMax: bounds.max,
          yAxisUnitLabel: yAxisLabel,
          climatology: climatology
            ? {
                ...climatology,
                meanLabel: t.climatologyMeanLabel,
              }
            : undefined,
          compact,
          dark: resolvedTheme === "dark",
          yearColors: buildIndicatorYearColors(currentYear, metric.key, resolvedTheme === "dark"),
          labels: {
            noData: t.noData,
          },
        })}
      />
    );
  };

  const renderTrendPanel = (
    metric: ClimateMetricSeries,
    options?: {
      xAxisYearLabelStep?: number;
      lineWidth?: number;
      color?: string;
      showArea?: boolean;
      yAxisInverse?: boolean;
    }
  ) => {
    const bounds = indicatorYAxisBounds(metric.key);
    const yAxisLabel = indicatorYAxisUnitLabel(metric.key, language);
    const freshness = metricFreshnessBadge(metric, language, t);

    return (
      <EChartsPanel
        key={metric.key}
        title={metricTitle(metric, language)}
        subtitle={formatSourceShortName(metric.source.shortName, language)}
        expandLabel={t.chartFullscreenEnter}
        collapseLabel={t.chartFullscreenExit}
        freshnessLabel={freshness.label}
        freshnessTone={freshness.tone}
        option={buildClimateTrendOption({
          points: metric.points,
          seriesName: metricTitle(metric, language),
          unit: cardUnitLabel(metric.key, metric.unit, language),
          decimals: metric.decimals,
          lineWidth: options?.lineWidth ?? 2.1,
          yAxisMin: bounds.min,
          yAxisMax: bounds.max,
          yAxisInverse: options?.yAxisInverse ?? false,
          yAxisUnitLabel: yAxisLabel,
          xAxisYearLabelStep: options?.xAxisYearLabelStep ?? 10,
          disableDataZoom: true,
          forceMappedYearLabels: true,
          showLegend: false,
          compact,
          dark: resolvedTheme === "dark",
          color: options?.color ?? topicChartColor(metric.key, resolvedTheme === "dark"),
          showArea: options?.showArea ?? true,
          labels: {
            noData: t.noData,
            latest: t.chartLatest,
          },
        })}
      />
    );
  };

  const renderOceanPanel = (metric: ClimateMetricSeries) => renderTrendPanel(metric);

  const renderIndicatorSubsection = (
    key: IndicatorSubsectionKey,
    title: string,
    note: string,
    content: ReactNode
  ) => {
    const open = indicatorSubsectionsOpen[key];

    return (
      <div className="climate-subsection" key={key}>
        <div className="climate-subsection-header collapsible-subsection-header">
          <div className="climate-subsection-heading">
            <h3>{title}</h3>
            <p>{note}</p>
          </div>
          <button
            type="button"
            className="section-toggle subsection-toggle"
            aria-expanded={open}
            onClick={() =>
              setIndicatorSubsectionsOpen((current) => ({
                ...current,
                [key]: !current[key],
              }))
            }
          >
            <span className={`section-toggle-icon ${open ? "open" : ""}`} aria-hidden="true" />
            <span>{open ? t.sectionCollapse : t.sectionExpand}</span>
          </button>
        </div>
        {open ? <div className="climate-subsection-content">{content}</div> : null}
      </div>
    );
  };

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
  const ensoOutlookFreshness = ensoFreshnessBadge(ensoOutlook, language, t);
  const dailyGlobalMeanAnomalyFreshness = dailyGlobalMeanAnomalyMetric
    ? metricFreshnessBadge(dailyGlobalMeanAnomalyMetric, language, t)
    : null;
  const earthEnergyImbalanceFreshness = earthEnergyImbalanceMetric
    ? metricFreshnessBadge(earthEnergyImbalanceMetric, language, t)
    : null;
  const projectionFreshness = ensoOutlookFreshness ?? dailyGlobalMeanAnomalyFreshness;
  const currentYear = new Date().getFullYear();
  const projectionNumberFormat = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    minimumFractionDigits: dailyGlobalMeanAnomalyMetric?.decimals ?? 2,
    maximumFractionDigits: dailyGlobalMeanAnomalyMetric?.decimals ?? 2,
  });
  const projectionPercentFormat = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const projectionSignalSummary = projectedAnnualGlobalMeanAnomaly?.ensoWindow
    ? `${t.projectionSignalLabel}: ${formatEnsoTargetLabel(projectedAnnualGlobalMeanAnomaly.ensoWindow.targetLabel, language)} · ${formatEnsoConditionLabel(projectedAnnualGlobalMeanAnomaly.ensoWindow.condition, t)} · ${projectedAnnualGlobalMeanAnomaly.ensoWindow.probability ?? "-"}%`
    : null;
  const projectionSupportSource = ensoOutlook?.sourceLabel ?? dailyGlobalMeanAnomalyMetric?.source.shortName ?? null;
  const projectionSupportLabel = projectionSupportSource ? formatSourceShortName(projectionSupportSource, language) : null;
  const projectionUnitLabel = cardUnitLabel(
    DAILY_GLOBAL_MEAN_ANOMALY_KEY,
    dailyGlobalMeanAnomalyMetric?.unit ?? "°C",
    language
  );
  const projectionIntervalTrack = projectedAnnualGlobalMeanAnomaly
    ? (() => {
        const span = PROJECTION_OVERVIEW_Y_MAX - PROJECTION_OVERVIEW_Y_MIN;
        const start = clamp(((projectedAnnualGlobalMeanAnomaly.low - PROJECTION_OVERVIEW_Y_MIN) / span) * 100, 0, 100);
        const end = clamp(((projectedAnnualGlobalMeanAnomaly.high - PROJECTION_OVERVIEW_Y_MIN) / span) * 100, 0, 100);
        const marker = clamp(((projectedAnnualGlobalMeanAnomaly.value - PROJECTION_OVERVIEW_Y_MIN) / span) * 100, 0, 100);
        return {
          start,
          width: Math.max(end - start, 1.5),
          marker,
        };
      })()
    : null;
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
  const renderProjectionEstimate = (variant: "overview" | "summary") =>
    projectedAnnualGlobalMeanAnomaly && projectionIntervalTrack ? (
      <div className={`projection-estimate-panel ${variant}`}>
        <div className="projection-estimate-copy">
          <span>{t.projectionEstimateLabel}</span>
          <strong>
            {renderPrimaryValue(
              `${projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.value)} ${projectionUnitLabel}`,
              "value-loading-skeleton projection-value-loading"
            )}
          </strong>
          {runtimeDataReady ? <small>{formatProjectionTopMeta(projectedAnnualGlobalMeanAnomaly.year, language)}</small> : null}
        </div>
        <div className="projection-interval-card">
          <div className="projection-interval-heading">
            <span>{t.projectionIntervalLabel}</span>
            <strong>
              {renderPrimaryValue(
                `${projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.low)}-${projectionNumberFormat.format(
                  projectedAnnualGlobalMeanAnomaly.high
                )} ${projectionUnitLabel}`,
                "value-loading-skeleton projection-interval-loading"
              )}
            </strong>
          </div>
          {runtimeDataReady ? (
            <>
              <div className="projection-interval-track" aria-hidden="true">
                <span className="projection-threshold threshold-one-point-five" />
                <span className="projection-threshold threshold-two" />
                <span
                  className="projection-interval-range"
                  style={{ left: `${projectionIntervalTrack.start}%`, width: `${projectionIntervalTrack.width}%` }}
                />
                <span className="projection-interval-marker" style={{ left: `${projectionIntervalTrack.marker}%` }} />
              </div>
              <div className="projection-interval-axis" aria-hidden="true">
                <span>{PROJECTION_OVERVIEW_Y_MIN.toFixed(1)}</span>
                <span>1.5</span>
                <span>
                  {PROJECTION_OVERVIEW_Y_MAX.toFixed(1)} {projectionUnitLabel}
                </span>
              </div>
            </>
          ) : (
            <div className="projection-track-loading" aria-hidden="true">
              {renderLoadingValue("value-loading-skeleton projection-track-loading-bar")}
            </div>
          )}
        </div>
      </div>
    ) : null;
  const setDashboardView = (view: DashboardView) => {
    setActiveView(view);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${view}`);
    }
  };
  const navItems: Array<{ view: DashboardView; label: string; icon: ToolkitIconName; available: boolean }> = [
    { view: "overview", label: t.navOverview, icon: "home", available: true },
    { view: "indicators", label: t.navIndicators, icon: "bars", available: true },
    { view: "forcing", label: t.forcingTitle, icon: "trend", available: true },
    { view: "variability", label: t.navVariability, icon: "ocean", available: true },
    { view: "maps", label: t.mapsSectionTitle, icon: "map", available: true },
    { view: "projections", label: t.projectionsTitle, icon: "trend", available: projectedAnnualGlobalMeanAnomaly != null },
    { view: "sources", label: t.sourceCardsTitle, icon: "reports", available: true },
  ];
  const navGroups: Array<{ key: string; label: string; views: DashboardView[] }> = [
    { key: "monitor", label: t.navGroupMonitor, views: ["overview", "indicators", "forcing", "variability"] },
    { key: "explore", label: t.navGroupExplore, views: ["maps", "projections"] },
    { key: "system", label: t.navGroupSystem, views: ["sources"] },
  ];
  const pageTitle =
    activeView === "overview"
      ? t.overviewTitle
      : activeView === "indicators"
        ? t.climateIndicatorsTitle
        : activeView === "forcing"
          ? t.forcingTitle
          : activeView === "variability"
            ? t.naturalVariabilityTitle
            : activeView === "maps"
              ? t.mapsSectionTitle
              : activeView === "projections"
                ? t.projectionsTitle
                : t.sourceCardsTitle;
  const pageSubtitle =
    activeView === "overview"
      ? t.overviewSubtitle
      : activeView === "indicators"
        ? t.climateIndicatorsNote
        : activeView === "forcing"
          ? t.forcingNote
          : activeView === "variability"
            ? t.naturalVariabilityNote
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
      };
    })(),
    (() => {
      const metric = metricByKey.get("arctic_sea_ice_extent") ?? metricByKey.get("global_sea_ice_extent");
      if (!metric) return null;
      const delta = formatMetricDelta(metric);
      return {
        key: "overview-sea-ice",
        title: metric.key === "arctic_sea_ice_extent" ? t.overviewArcticSeaIceTitle : metricTitle(metric, language),
        subtitle: t.overviewClimatologySubtitle,
        value: `${formatMetricValue(metric, language, t.valueUnavailable)} ${cardUnitLabel(metric.key, metric.unit, language)}`,
        meta: `${t.chartLatest}: ${formatDateLabel(metric.latestDate, language)}`,
        delta: delta?.label ?? metricFreshnessBadge(metric, language, t).label,
        icon: "snow" as ToolkitIconName,
        tone: "purple",
        points: metric.points,
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
      };
    })(),
  ].filter((card): card is NonNullable<typeof card> => card != null);
  const overviewMapCards = [
    mapCards.find((card) => card.key === "map-2m-temperature-anomaly"),
    mapCards.find((card) => card.key === "map-sst-anomaly"),
  ].filter((card): card is (typeof mapCards)[number] => card != null);
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
  const renderEnsoOutlookCard = (options?: { showSourceLink?: boolean }) => (
    <article className="overview-card enso-outlook-card">
      <div className="overview-card-header">
        <h2>{t.ensoOutlookTitle}</h2>
        <ToolkitIcon name="info" className="info-icon" />
      </div>
      <div className="enso-overview-status">
        <span>{t.ensoStatusLabel}</span>
        <strong>
          {renderPrimaryValue(
            formatEnsoStatusLabel(ensoOutlook, language, t),
            "value-loading-skeleton enso-status-loading"
          )}
        </strong>
      </div>
      {runtimeDataReady && ensoOutlook?.synopsis ? <p className="enso-overview-synopsis">{ensoOutlook.synopsis}</p> : null}
      <div className="enso-overview-window-list">
        {ensoOverviewRows.map((row) => (
          <div className="enso-overview-window" key={row.key}>
            <span>{row.horizon}</span>
            <strong>
              {renderPrimaryValue(
                formatEnsoConditionLabel(row.window.condition, t),
                "value-loading-skeleton enso-window-loading"
              )}
            </strong>
            {runtimeDataReady ? (
              <small>
                {row.window.probability ?? "-"}% · {formatEnsoTargetLabel(row.window.targetLabel, language)}
              </small>
            ) : (
              <small>{renderLoadingValue("value-loading-skeleton enso-window-meta-loading")}</small>
            )}
          </div>
        ))}
      </div>
      <div className="enso-overview-meta">
        {runtimeDataReady && ensoOutlookFreshness ? (
          <span className={`freshness-chip ${ensoOutlookFreshness.tone}`}>{ensoOutlookFreshness.label}</span>
        ) : null}
        {options?.showSourceLink && ensoOutlook?.sourceUrl ? (
          <a className="text-link-button" href={ensoOutlook.sourceUrl} target="_blank" rel="noreferrer">
            {ensoOutlook.sourceLabel || "NOAA CPC"} →
          </a>
        ) : null}
      </div>
    </article>
  );
  return (
    <div className="app-frame">
      <aside className="dashboard-sidebar" aria-label={t.dashboardNavigationAria}>
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
          <button
            type="button"
            className="sidebar-control-btn"
            onClick={() => setThemeMode(themeMode === "system" ? "light" : themeMode === "light" ? "dark" : "system")}
            title={`${t.theme}: ${themeMode === "dark" ? t.themeDark : themeMode === "light" ? t.themeLight : t.themeSystem}`}
            aria-label={`${t.theme}: ${themeMode === "dark" ? t.themeDark : themeMode === "light" ? t.themeLight : t.themeSystem}`}
          >
            <ToolkitIcon
              name={themeMode === "dark" ? "moon" : themeMode === "light" ? "sun" : "contrast"}
              className="control-icon"
            />
            <span className="control-label">
              {themeMode === "dark" ? t.themeDark : themeMode === "light" ? t.themeLight : t.themeSystem}
            </span>
          </button>
          <button
            type="button"
            className="sidebar-control-btn"
            onClick={() => setLanguage(language === "hu" ? "en" : "hu")}
            title={`${t.language}: ${language === "hu" ? "Magyar" : "English"}`}
            aria-label={`${t.language}: ${language === "hu" ? "Magyar" : "English"}`}
          >
            <span className="control-lang">{language.toUpperCase()}</span>
            <span className="control-label">{language === "hu" ? "Magyar" : "English"}</span>
          </button>
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

      <main className="app-shell">
        <header className="topbar">
          <div className="topbar-brand">
            <div>
              <h1>{pageTitle}</h1>
              <p className="subtitle">{pageSubtitle}</p>
              <div className="page-meta-row" aria-label={t.dataStatusLabel}>
                <span>{sourceModeLabel}</span>
                <span>
                  {t.dataUpdatedLabel}:{" "}
                  {renderPrimaryValue(
                    formatDateLabel(extractIsoDate(snapshot.updatedAtIso), language),
                    "value-loading-skeleton page-meta-loading"
                  )}
                </span>
                {runtimeDataReady && ensoOutlookFreshness ? <span>{ensoOutlookFreshness.label}</span> : null}
              </div>
            </div>
          </div>

        </header>

        {activeView === "overview" && dailyGlobalMeanAnomalyMetric ? (
          <section className="overview-hero" aria-label={t.overviewDailyGlobalTemperatureAnomalyTitle}>
            <div className="overview-hero-main">
              <div className="overview-hero-copy">
                <span className="overview-hero-kicker">
                  {t.overviewDailyGlobalTemperatureAnomalyTitle} · {t.overviewPreindustrialSubtitle}
                </span>
                <strong className="overview-hero-value">
                  {renderMetricValue(dailyGlobalMeanAnomalyMetric, "value-loading-skeleton overview-value-loading")}
                </strong>
                <div className="overview-hero-chips">
                  {runtimeDataReady ? (
                    <>
                      <span className="overview-hero-chip">
                        {t.chartLatest}: {formatDateLabel(dailyGlobalMeanAnomalyMetric.latestDate, language)}
                      </span>
                      {heroDelta ? <span className="overview-hero-chip">{heroDelta.label}</span> : null}
                      {heroRecordPoint ? (
                        <span className="overview-hero-chip record">
                          <ToolkitIcon name="up" className="hero-chip-icon" />
                          {t.heroRecordLabel}
                        </span>
                      ) : null}
                      {dailyGlobalMeanAnomalyFreshness ? (
                        <span className={`freshness-chip ${dailyGlobalMeanAnomalyFreshness.tone}`}>
                          {dailyGlobalMeanAnomalyFreshness.label}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="overview-hero-spark" aria-hidden="true">
                <Sparkline points={dailyGlobalMeanAnomalyMetric.points} className="hero-sparkline" strokeWidth={2.2} />
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
        ) : null}

        {activeView === "overview" ? (
          <section className={`ai-summary-panel overview-ai-summary ${aiDashboardSummary.tone}`} aria-label={t.aiSummaryAria}>
            <div className="ai-summary-main">
              <div className="ai-summary-copy">
                <div className="ai-summary-label-row">
                  <span className="ai-generic-mark" aria-label={t.aiGeneratedAria}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M12 2.8 13.55 7.2 18 8.75l-4.45 1.55L12 14.8l-1.55-4.5L6 8.75l4.45-1.55L12 2.8Z" />
                      <path d="M17.9 13.1 18.8 15.6l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z" />
                      <path d="M6.1 14.1 6.8 16l1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9Z" />
                    </svg>
                  </span>
                  <span className="alert-kicker">{t.aiSummaryKicker}</span>
                </div>
                {runtimeDataReady ? (
                  aiDashboardSummary.bulletItems.length > 0 ? (
                    <ul className="ai-summary-list">
                      {aiDashboardSummary.bulletItems.map((item, index) => (
                        <li key={`${index}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{aiDashboardSummary.headline}</p>
                  )
                ) : (
                  <div className="ai-summary-loading" role="status" aria-live="polite">
                    <span className="ai-summary-spinner" aria-hidden="true" />
                    <span>{t.aiSummaryLoading}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeView === "overview" ? (
          <div className="overview-page">
            <section className="overview-metric-grid" aria-label={t.latestSignalsAria}>
              {overviewMetricCards.map((card) => (
                <article className={`overview-metric-card tone-${card.tone}`} key={card.key}>
                  <span className="metric-icon" aria-hidden="true">
                    <ToolkitIcon name={card.icon} />
                  </span>
                  <div className="overview-metric-copy">
                    <h2>{card.title}</h2>
                    <p className="metric-subtitle">{card.subtitle}</p>
                    <strong>{renderPrimaryValue(card.value, "value-loading-skeleton overview-value-loading")}</strong>
                    {runtimeDataReady && card.points ? (
                      <Sparkline className="metric-sparkline" points={card.points} />
                    ) : null}
                    {runtimeDataReady ? (
                      <p className="metric-meta">{card.meta}</p>
                    ) : (
                      <p className="metric-meta">{renderLoadingValue("value-loading-skeleton metric-meta-loading")}</p>
                    )}
                    {runtimeDataReady && card.delta ? <span className="metric-delta">{card.delta}</span> : null}
                  </div>
                </article>
              ))}
            </section>

            <section className="overview-main-grid">
              <section className="overview-card overview-map-suite" aria-label={t.mapsSectionTitle}>
                <div className="overview-card-header planet-now-header">
                  <h2>{t.planetNowTitle}</h2>
                  <button type="button" className="text-link-button" onClick={() => setDashboardView("maps")}>
                    {t.viewAllMaps} →
                  </button>
                </div>
                <div className="overview-map-pair">
                  {overviewMapCards.map((mapCard) => (
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
                    />
                  ))}
                </div>
              </section>

              {renderEnsoOutlookCard({ showSourceLink: false })}
            </section>

            <section className="overview-bottom-grid">
              <article className="overview-card overview-projection-card outlook-featured">
                <div className="outlook-card-grid">
                  <div className="outlook-card-copy">
                    <div className="outlook-title-row">
                      <h2>{currentYear} {t.outlookTitle}</h2>
                      <span>{t.projectionExperimentalLabel.toLowerCase()} · {t.projectionProbabilityMethodLabel.toLowerCase()}</span>
                    </div>
                    {projectedAnnualGlobalMeanAnomaly ? (
                      <>
                        <p className="outlook-measure-label">
                          {t.outlookProjectedAnnualMeanLabel} · {t.overviewPreindustrialSubtitle}
                        </p>
                        <strong className="outlook-main-value">
                          {renderPrimaryValue(
                            `${projectedAnnualGlobalMeanAnomaly.value > 0 ? "+" : ""}${projectionNumberFormat.format(
                              projectedAnnualGlobalMeanAnomaly.value
                            )} ${projectionUnitLabel}`,
                            "value-loading-skeleton projection-value-loading"
                          )}
                        </strong>
                        <div className="outlook-range-block">
                          <p>
                            {t.projectionIntervalLabel} · {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.low)}-
                            {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.high)} {projectionUnitLabel}
                          </p>
                          {runtimeDataReady ? (
                            <div className="outlook-range-track" aria-hidden="true">
                              <span className="outlook-range-fill" />
                              <span className="outlook-range-marker" style={{ left: `${outlookIntervalMarker ?? 50}%` }} />
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
                              {t.outlookChanceAboveOnePointFiveLabel} ·{" "}
                              <strong>{projectionPercentFormat.format(projectedAnnualGlobalMeanAnomaly.probabilityAboveOnePointFive)}</strong>
                            </span>
                            <span className="outlook-chip">
                              {t.outlookChanceWarmestYearLabel} ·{" "}
                              <strong>{projectionPercentFormat.format(projectedAnnualGlobalMeanAnomaly.probabilityWarmestOnRecord)}</strong>
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
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
                            />
                            <span>
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

            {longRangeTemperatureTrendOption ? (
              <section className="overview-long-range-section">
                <article className="overview-card overview-temperature-trend-card">
                  <div className="overview-card-header">
                    <div>
                      <h2>{t.longRangeTemperatureTrendShortTitle}</h2>
                      <p>{t.longRangeTemperatureTrendSource}</p>
                    </div>
                    <a
                      className="text-link-button"
                      href={CMIP7_SCENARIOMIP_TEMPERATURE_SOURCE_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.cmip7ScenarioSourceLabel} →
                    </a>
                  </div>
                  <div className="long-range-temperature-chart">
                    <EChartsPanel
                      title={t.longRangeTemperatureTrendShortTitle}
                      subtitle={t.longRangeTemperatureTrendSubtitle}
                      expandLabel={t.chartFullscreenEnter}
                      collapseLabel={t.chartFullscreenExit}
                      option={longRangeTemperatureTrendOption}
                    />
                  </div>
                  <div className="scenario-2100-values" aria-label={t.longRangeTemperatureTrendValueLabel}>
                    {longRangeScenarioSummaries.map((scenario) => (
                      <div
                        className="scenario-2100-chip"
                        key={scenario.key}
                        style={{ "--scenario-color": scenario.color } as CSSProperties}
                      >
                        <span>{scenario.label}</span>
                        <strong>
                          {scenario.value2100 == null ? "-" : projectionNumberFormat.format(scenario.value2100)} {projectionUnitLabel}
                        </strong>
                        <small>{t.longRangeTemperatureTrendValueLabel}</small>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            ) : null}

          </div>
        ) : null}

      {activeView === "indicators" ? (
      <section className="collapsible-section detail-page-section" id="indicators">
        <header className="section-header">
          <div className="section-header-main">
            <h2>{t.climateIndicatorsTitle}</h2>
            <p>{t.climateIndicatorsNote}</p>
          </div>
          <button
            type="button"
            className="section-toggle"
            aria-expanded={climateSectionOpen}
            onClick={() => setClimateSectionOpen((open) => !open)}
          >
            <span className={`section-toggle-icon ${climateSectionOpen ? "open" : ""}`} aria-hidden="true" />
            <span>{climateSectionOpen ? t.sectionCollapse : t.sectionExpand}</span>
          </button>
        </header>

        {climateSectionOpen ? (
          <div className="section-content">
            {renderIndicatorSubsection(
              "globalTemperatures",
              t.globalTemperaturesSectionTitle,
              t.globalTemperaturesSectionNote,
              <>
              <div className="summary-cards-section">
                <div className="regional-summary-grid">
                  {globalTemperatureLines.map(({ metric }) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className={`alert-card summary ${topSummaryCategoryClass(metric.key)}`} key={`${metric.key}-global-temperature-summary`}>
                        <span className="alert-kicker">{t.latestLabel}</span>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">{renderMetricValue(metric, "value-loading-skeleton detail-value-loading")}</p>
                        {runtimeDataReady ? (
                          <p>
                            {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                          </p>
                        ) : null}
                        {runtimeDataReady ? <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span> : null}
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{formatSourceShortName(metric.source.shortName, language)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
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
              <div className="summary-cards-section">
                <div className="regional-summary-grid">
                  {anomalyTemperatureLines.map(({ metric }) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className={`alert-card summary ${topSummaryCategoryClass(metric.key)}`} key={`${metric.key}-temperature-anomaly-summary`}>
                        <span className="alert-kicker">{t.latestLabel}</span>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">{renderMetricValue(metric, "value-loading-skeleton detail-value-loading")}</p>
                        {runtimeDataReady ? (
                          <p>
                            {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                          </p>
                        ) : null}
                        {runtimeDataReady ? <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span> : null}
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{formatSourceShortName(metric.source.shortName, language)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="charts-grid climate-grid">
                {anomalyTemperatureLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
                {dailyGlobalMeanAnomalyMetric ? (
                  <EChartsPanel
                    title={t.dailyGlobalTemperatureAnomalyTitle}
                    subtitle={t.dailyGlobalTemperatureAnomalySubtitle}
                    expandLabel={t.chartFullscreenEnter}
                    collapseLabel={t.chartFullscreenExit}
                    freshnessLabel={dailyGlobalMeanAnomalyFreshness?.label}
                    freshnessTone={dailyGlobalMeanAnomalyFreshness?.tone}
                    option={buildClimateTrendOption({
                      points: dailyGlobalMeanAnomalyMetric.points,
                      seriesName: t.dailyGlobalTemperatureAnomalyTitle,
                      unit: cardUnitLabel(dailyGlobalMeanAnomalyMetric.key, dailyGlobalMeanAnomalyMetric.unit, language),
                      decimals: dailyGlobalMeanAnomalyMetric.decimals,
                      lineWidth: 1.15,
                      yAxisMin: indicatorYAxisBounds(dailyGlobalMeanAnomalyMetric.key).min,
                      yAxisMax: indicatorYAxisBounds(dailyGlobalMeanAnomalyMetric.key).max,
                      yAxisUnitLabel: indicatorYAxisUnitLabel(dailyGlobalMeanAnomalyMetric.key, language),
                      xAxisYearLabelStep: 10,
                      disableDataZoom: true,
                      forceMappedYearLabels: true,
                      showLegend: false,
                      compact,
                      dark: resolvedTheme === "dark",
                      color: topicChartSoftColor(dailyGlobalMeanAnomalyMetric.key, resolvedTheme === "dark"),
                      showArea: false,
                      overlaySeries: [
                        {
                          points: dailyGlobalMeanAnomaly365DayPoints,
                          seriesName: t.dailyGlobalTemperatureAnomaly365DayAverage,
                          color: topicChartColor(dailyGlobalMeanAnomalyMetric.key, resolvedTheme === "dark"),
                          lineWidth: 3.6,
                        },
                      ],
                      referenceLines: [
                        { value: 1.5, label: "1.5°C", color: resolvedTheme === "dark" ? "#fbbf24" : "#f59e0b" },
                        { value: 2, label: "2.0°C", color: resolvedTheme === "dark" ? "#f87171" : "#dc2626" },
                      ],
                      labels: {
                        noData: t.noData,
                        latest: t.chartLatest,
                      },
                    })}
                  />
                ) : null}
                {dailyGlobalMeanAnomalyMetric && annualGlobalMeanAnomalyPoints.length ? (
                  <EChartsPanel
                    title={t.annualGlobalTemperatureAnomalyTitle}
                    subtitle={`${t.annualGlobalTemperatureAnomalySubtitle}${annualGlobalMeanAnomalyIsYtd ? ` · ${t.ytdLabel}` : ""}`}
                    expandLabel={t.chartFullscreenEnter}
                    collapseLabel={t.chartFullscreenExit}
                    freshnessLabel={dailyGlobalMeanAnomalyFreshness?.label}
                    freshnessTone={dailyGlobalMeanAnomalyFreshness?.tone}
                    option={buildClimateTrendOption({
                      points: annualGlobalMeanAnomalyPoints,
                      seriesName: t.annualGlobalTemperatureAnomalyTitle,
                      unit: cardUnitLabel(dailyGlobalMeanAnomalyMetric.key, dailyGlobalMeanAnomalyMetric.unit, language),
                      decimals: dailyGlobalMeanAnomalyMetric.decimals,
                      yAxisMin: indicatorYAxisBounds(dailyGlobalMeanAnomalyMetric.key).min,
                      yAxisMax: indicatorYAxisBounds(dailyGlobalMeanAnomalyMetric.key).max,
                      yAxisUnitLabel: indicatorYAxisUnitLabel(dailyGlobalMeanAnomalyMetric.key, language),
                      xAxisYearLabelStep: 10,
                      disableDataZoom: true,
                      forceMappedYearLabels: true,
                      showLegend: false,
                      compact,
                      dark: resolvedTheme === "dark",
                      color: topicChartColor(dailyGlobalMeanAnomalyMetric.key, resolvedTheme === "dark"),
                      referenceLines: [
                        { value: 1.5, label: "1.5°C", color: resolvedTheme === "dark" ? "#fbbf24" : "#f59e0b" },
                        { value: 2, label: "2.0°C", color: resolvedTheme === "dark" ? "#f87171" : "#dc2626" },
                      ],
                      labels: {
                        noData: t.noData,
                        latest: t.chartLatest,
                      },
                    })}
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
              <div className="summary-cards-section">
                <div className="regional-summary-grid">
                  {regionalSummaryMetrics.map((metric) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className={`alert-card summary ${topSummaryCategoryClass(metric.key)}`} key={`${metric.key}-regional-summary`}>
                        <span className="alert-kicker">{t.latestLabel}</span>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">{renderMetricValue(metric, "value-loading-skeleton detail-value-loading")}</p>
                        {runtimeDataReady ? (
                          <p>
                            {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                          </p>
                        ) : null}
                        {runtimeDataReady ? <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span> : null}
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{formatSourceShortName(metric.source.shortName, language)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
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
              <div className="summary-cards-section">
                <div className="regional-summary-grid">
                  {regionalTemperatureAnomalySummaryMetrics.map((metric) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className={`alert-card summary ${topSummaryCategoryClass(metric.key)}`} key={`${metric.key}-regional-anomaly-summary`}>
                        <span className="alert-kicker">{t.latestLabel}</span>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">{renderMetricValue(metric, "value-loading-skeleton detail-value-loading")}</p>
                        {runtimeDataReady ? (
                          <p>
                            {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                          </p>
                        ) : null}
                        {runtimeDataReady ? <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span> : null}
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{formatSourceShortName(metric.source.shortName, language)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
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
              <div className="summary-cards-section">
                <div className="regional-summary-grid">
                  {oceanMetrics.map((metric) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className={`alert-card summary ${topSummaryCategoryClass(metric.key)}`} key={`${metric.key}-ocean-summary`}>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">{renderMetricValue(metric, "value-loading-skeleton detail-value-loading")}</p>
                        {runtimeDataReady ? (
                          <p>
                            {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                          </p>
                        ) : null}
                        {runtimeDataReady ? <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span> : null}
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{formatSourceShortName(metric.source.shortName, language)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="charts-grid climate-grid">
                {oceanMetrics.map((metric) => renderOceanPanel(metric))}
              </div>
              </>
            )}

            {earthEnergyImbalanceMetric && earthEnergyImbalanceTrendPoints.length ? (
              renderIndicatorSubsection(
                "earthEnergyImbalance",
                t.earthEnergyImbalanceSectionTitle,
                t.earthEnergyImbalanceSectionNote,
                <>
                <div className="charts-grid climate-grid climate-grid-single">
                  <EChartsPanel
                    title={t.earthEnergyImbalanceTitle}
                    subtitle={t.earthEnergyImbalanceSubtitle}
                    expandLabel={t.chartFullscreenEnter}
                    collapseLabel={t.chartFullscreenExit}
                    freshnessLabel={earthEnergyImbalanceFreshness?.label}
                    freshnessTone={earthEnergyImbalanceFreshness?.tone}
                    option={buildClimateTrendOption({
                      points: earthEnergyImbalanceTrendPoints,
                      seriesName: t.earthEnergyImbalanceTitle,
                      unit: cardUnitLabel(earthEnergyImbalanceMetric.key, earthEnergyImbalanceMetric.unit, language),
                      decimals: earthEnergyImbalanceMetric.decimals,
                      lineWidth: 2.2,
                      yAxisMin: indicatorYAxisBounds(earthEnergyImbalanceMetric.key).min,
                      yAxisMax: indicatorYAxisBounds(earthEnergyImbalanceMetric.key).max,
                      yAxisUnitLabel: indicatorYAxisUnitLabel(earthEnergyImbalanceMetric.key, language),
                      xAxisYearLabelStep: 2,
                      disableDataZoom: true,
                      forceMappedYearLabels: true,
                      showLegend: false,
                      compact,
                      dark: resolvedTheme === "dark",
                      color: topicChartColor(earthEnergyImbalanceMetric.key, resolvedTheme === "dark"),
                      referenceLines: [
                        { value: 0, label: "0 W/m²", color: resolvedTheme === "dark" ? "#fef3c7" : "#92400e" },
                      ],
                      labels: {
                        noData: t.noData,
                        latest: t.chartLatest,
                      },
                    })}
                  />
                </div>
                </>
              )
            ) : null}

            {renderIndicatorSubsection(
              "seaIce",
              t.seaIceSectionTitle,
              t.seaIceSectionNote,
              <>
              <div className="summary-cards-section">
                <div className="regional-summary-grid">
                  {seaIceSummaryMetrics.map((metric) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className={`alert-card summary ${topSummaryCategoryClass(metric.key)}`} key={`${metric.key}-sea-ice-summary`}>
                        <span className="alert-kicker">{t.latestLabel}</span>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">{renderMetricValue(metric, "value-loading-skeleton detail-value-loading")}</p>
                        {runtimeDataReady ? (
                          <p>
                            {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                          </p>
                        ) : null}
                        {runtimeDataReady ? <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span> : null}
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{formatSourceShortName(metric.source.shortName, language)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="charts-grid climate-grid sea-ice-grid">
                {seaIceIndicatorLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
              </div>
              </>
            )}

            {snowCoverSummaryMetrics.length || snowCoverIndicatorLines.length ? (
              renderIndicatorSubsection(
                "snowCover",
                t.snowCoverSectionTitle,
                t.snowCoverSectionNote,
                <>
                {snowCoverSummaryMetrics.length ? (
                  <div className="summary-cards-section">
                    <div className="regional-summary-grid">
                      {snowCoverSummaryMetrics.map((metric) => {
                        const freshness = metricFreshnessBadge(metric, language, t);
                        return (
                          <article className={`alert-card summary ${topSummaryCategoryClass(metric.key)}`} key={`${metric.key}-snow-cover-summary`}>
                            <span className="alert-kicker">{t.latestLabel}</span>
                            <h2>{metricTitle(metric, language)}</h2>
                            <p className="alert-emphasis">{renderMetricValue(metric, "value-loading-skeleton detail-value-loading")}</p>
                            {runtimeDataReady ? (
                              <p>
                                {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                              </p>
                            ) : null}
                            {runtimeDataReady ? <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span> : null}
                            <div className="alert-meta">
                              <span className="alert-meta-chip confidence-medium">{formatSourceShortName(metric.source.shortName, language)}</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
                  {iceSheetAndGlacierMetrics.map((metric) =>
                    renderTrendPanel(metric, {
                      xAxisYearLabelStep: 5,
                      showArea: false,
                      yAxisInverse: ICE_SHEET_LOSS_KEYS.has(metric.key),
                      color: topicChartColor(metric.key, resolvedTheme === "dark"),
                    })
                  )}
                </div>
                </>
              )
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      {activeView === "maps" ? (
      <section className="collapsible-section detail-page-section" id="maps">
        <header className="section-header">
          <div className="section-header-main">
            <h2>{t.mapsSectionTitle}</h2>
            <p>{t.mapsSectionNote}</p>
          </div>
          <button
            type="button"
            className="section-toggle"
            aria-expanded={mapsSectionOpen}
            onClick={() => setMapsSectionOpen((open) => !open)}
          >
            <span className={`section-toggle-icon ${mapsSectionOpen ? "open" : ""}`} aria-hidden="true" />
            <span>{mapsSectionOpen ? t.sectionCollapse : t.sectionExpand}</span>
          </button>
        </header>

        {mapsSectionOpen ? (
          <div className="section-content">
            <div className="charts-grid climate-grid maps-grid">
              {mapCards.map((mapCard) => (
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
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {activeView === "forcing" ? (
      <section className="collapsible-section detail-page-section" id="forcing">
        <header className="section-header">
          <div className="section-header-main">
            <h2>{t.forcingTitle}</h2>
            <p>{t.forcingNote}</p>
          </div>
          <button
            type="button"
            className="section-toggle"
            aria-expanded={forcingSectionOpen}
            onClick={() => setForcingSectionOpen((open) => !open)}
          >
            <span className={`section-toggle-icon ${forcingSectionOpen ? "open" : ""}`} aria-hidden="true" />
            <span>{forcingSectionOpen ? t.sectionCollapse : t.sectionExpand}</span>
          </button>
        </header>

        {forcingSectionOpen ? (
          <div className="section-content">
            <div className="summary-cards-section">
              <div className="regional-summary-grid">
                {snapshot.forcing.map((metric) => {
                  const freshness = metricFreshnessBadge(metric, language, t);
                  return (
                    <article className={`alert-card summary ${topSummaryCategoryClass(metric.key)}`} key={`${metric.key}-forcing-summary`}>
                      <span className="alert-kicker">{t.latestLabel}</span>
                      <h2>{metricTitle(metric, language)}</h2>
                      <p className="alert-emphasis">{renderMetricValue(metric, "value-loading-skeleton detail-value-loading")}</p>
                      {runtimeDataReady ? (
                        <p>
                          {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                        </p>
                      ) : null}
                      {runtimeDataReady ? <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span> : null}
                      <div className="alert-meta">
                        <span className="alert-meta-chip confidence-medium">{formatSourceShortName(metric.source.shortName, language)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
            <div className={`charts-grid forcing-grid ${snapshot.forcing.length === 1 ? "forcing-grid-single" : ""}`}>
              {snapshot.forcing.map((metric) => {
                const axisBounds = forcingAxisBounds(metric.key);
                const title = metricTitle(metric, language);
                const freshness = metricFreshnessBadge(metric, language, t);
                const option =
                  metric.key === "atmospheric_aggi"
                    ? buildClimateTrendOption({
                        points: metric.points,
                        seriesName: title,
                        unit: metric.unit,
                        decimals: metric.decimals,
                        lineWidth: 2.1,
                        yAxisMin: axisBounds.yMin,
                        yAxisMax: axisBounds.yMax,
                        yAxisUnitLabel: forcingYAxisUnitLabel(metric.key, language),
                        xAxisYearLabelStep: 5,
                        disableDataZoom: true,
                        forceMappedYearLabels: true,
                        showLegend: false,
                        compact,
                        dark: resolvedTheme === "dark",
                        color: topicChartColor(metric.key, resolvedTheme === "dark"),
                        labels: {
                          noData: t.noData,
                          latest: t.chartLatest,
                        },
                      })
                    : buildForcingTrendOption({
                        points: metric.points,
                        title,
                        unit: metric.unit,
                        yAxisUnitLabel: forcingYAxisUnitLabel(metric.key, language),
                        yAxisMin: axisBounds.yMin,
                        yAxisMax: axisBounds.yMax,
                        xAxisStartYear: axisBounds.minYear,
                        decimals: metric.decimals,
                        compact,
                        dark: resolvedTheme === "dark",
                        color: topicChartColor(metric.key, resolvedTheme === "dark"),
                        labels: {
                          noData: t.noData,
                          latest: t.chartLatest,
                        },
                      });
                return (
                  <EChartsPanel
                    key={metric.key}
                    title={title}
                    subtitle={formatSourceShortName(metric.source.shortName, language)}
                    expandLabel={t.chartFullscreenEnter}
                    collapseLabel={t.chartFullscreenExit}
                    freshnessLabel={freshness.label}
                    freshnessTone={freshness.tone}
                    option={option}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {activeView === "variability" ? (
        <section className="collapsible-section detail-page-section" id="variability">
          <header className="section-header">
            <div className="section-header-main">
              <h2>{t.naturalVariabilityTitle}</h2>
              <p>{t.naturalVariabilityNote}</p>
            </div>
            <button
              type="button"
              className="section-toggle"
              aria-expanded={variabilitySectionOpen}
              onClick={() => setVariabilitySectionOpen((open) => !open)}
            >
              <span className={`section-toggle-icon ${variabilitySectionOpen ? "open" : ""}`} aria-hidden="true" />
              <span>{variabilitySectionOpen ? t.sectionCollapse : t.sectionExpand}</span>
            </button>
          </header>

          {variabilitySectionOpen ? (
            <div className="section-content">
              <div className="projection-enso-card-row">{renderEnsoOutlookCard({ showSourceLink: true })}</div>
              {variabilityChartPanels.length ? (
                <div className="charts-grid climate-grid">
                  {variabilityChartPanels.map(({ metric, subtitle, option }) => (
                    <EChartsPanel
                      key={metric.key}
                      title={metricTitle(metric, language)}
                      subtitle={subtitle}
                      expandLabel={t.chartFullscreenEnter}
                      collapseLabel={t.chartFullscreenExit}
                      freshnessLabel={metricFreshnessBadge(metric, language, t)?.label}
                      freshnessTone={metricFreshnessBadge(metric, language, t)?.tone}
                      option={option}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeView === "projections" && projectedAnnualGlobalMeanAnomaly ? (
        <section className="collapsible-section detail-page-section" id="projections">
          <header className="section-header">
            <div className="section-header-main">
              <h2>{t.projectionsTitle}</h2>
              <p>{t.projectionsNote}</p>
            </div>
            <button
              type="button"
              className="section-toggle"
              aria-expanded={projectionsSectionOpen}
              onClick={() => setProjectionsSectionOpen((open) => !open)}
            >
              <span className={`section-toggle-icon ${projectionsSectionOpen ? "open" : ""}`} aria-hidden="true" />
              <span>{projectionsSectionOpen ? t.sectionCollapse : t.sectionExpand}</span>
            </button>
          </header>

          {projectionsSectionOpen ? (
            <div className="section-content">
              <article className="overview-card overview-projection-card projections-outlook-card">
                <div className="overview-card-header">
                  <h2>{currentYear} {t.outlookTitle}</h2>
                  <ToolkitIcon name="info" className="info-icon" />
                </div>
                {renderProjectionEstimate("overview")}
                <div className="projection-chart-cell overview-current-year-chart">
                  {projectedAnnualOverviewChartOption ? (
                    <EChartsPanel
                      title={t.projectedAnnualTemperatureAnomalyChartTitle}
                      subtitle={t.projectedAnnualTemperatureAnomalyChartSubtitle}
                      expandLabel={t.chartFullscreenEnter}
                      collapseLabel={t.chartFullscreenExit}
                      freshnessLabel={projectionFreshness?.label}
                      freshnessTone={projectionFreshness?.tone}
                      option={projectedAnnualOverviewChartOption}
                    />
                  ) : null}
                </div>
              </article>

              <div className="regional-summary-grid projection-summary-grid projection-compact-grid">
                <article className="alert-card summary topcat-anomaly projection-summary-card projection-compact-card">
                  <h2>{t.projectionProbabilityAboveOnePointFiveTitle}</h2>
                  <p className="alert-emphasis">
                    {renderPrimaryValue(
                      projectionPercentFormat.format(projectedAnnualGlobalMeanAnomaly.probabilityAboveOnePointFive),
                      "value-loading-skeleton detail-value-loading"
                    )}
                  </p>
                  {runtimeDataReady ? (
                    <p>
                      {t.projectionRangeLabel}: {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.low)}-
                      {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.high)} {projectionUnitLabel}
                    </p>
                  ) : null}
                  <div className="alert-meta">
                    <span className="alert-meta-chip confidence-medium">{t.projectionProbabilityMethodLabel}</span>
                    <span className="alert-meta-chip confidence-medium">
                      {projectedAnnualGlobalMeanAnomaly.analogCount} {t.projectionAnalogsLabel}
                    </span>
                  </div>
                </article>
                <article className="alert-card summary topcat-anomaly projection-summary-card projection-compact-card">
                  <h2>{t.projectionProbabilityWarmestRecordTitle}</h2>
                  <p className="alert-emphasis">
                    {renderPrimaryValue(
                      projectionPercentFormat.format(projectedAnnualGlobalMeanAnomaly.probabilityWarmestOnRecord),
                      "value-loading-skeleton detail-value-loading"
                    )}
                  </p>
                  {runtimeDataReady ? (
                    <p>
                      {t.projectionRecordThresholdLabel}:{" "}
                      {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.recordThreshold)} {projectionUnitLabel}
                    </p>
                  ) : null}
                  <div className="alert-meta">
                    <span className="alert-meta-chip confidence-medium">{t.projectionProbabilityMethodLabel}</span>
                    <span className="alert-meta-chip confidence-medium">
                      {projectedAnnualGlobalMeanAnomaly.analogCount} {t.projectionAnalogsLabel}
                    </span>
                  </div>
                </article>
              </div>

              {longRangeTemperatureTrendOption ? (
                <section className="overview-long-range-section projections-long-range-section">
                  <article className="overview-card overview-temperature-trend-card">
                    <div className="overview-card-header">
                      <div>
                        <h2>{t.longRangeTemperatureTrendTitle}</h2>
                        <p>{t.longRangeTemperatureTrendSource}</p>
                      </div>
                      <a
                        className="text-link-button"
                        href={CMIP7_SCENARIOMIP_TEMPERATURE_SOURCE_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.cmip7ScenarioSourceLabel} →
                      </a>
                    </div>
                    <div className="long-range-temperature-chart">
                      <EChartsPanel
                        title={t.longRangeTemperatureTrendTitle}
                        subtitle={t.longRangeTemperatureTrendSubtitle}
                        expandLabel={t.chartFullscreenEnter}
                        collapseLabel={t.chartFullscreenExit}
                        option={longRangeTemperatureTrendOption}
                      />
                    </div>
                    <div className="scenario-2100-values" aria-label={t.longRangeTemperatureTrendValueLabel}>
                      {longRangeScenarioSummaries.map((scenario) => (
                        <div
                          className="scenario-2100-chip"
                          key={scenario.key}
                          style={{ "--scenario-color": scenario.color } as CSSProperties}
                        >
                          <span>{scenario.label}</span>
                          <strong>
                            {scenario.value2100 == null ? "-" : projectionNumberFormat.format(scenario.value2100)}{" "}
                            {projectionUnitLabel}
                          </strong>
                          <small>{t.longRangeTemperatureTrendValueLabel}</small>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>
              ) : null}

              <section className="overview-tipping-section">
                <article className="overview-card overview-tipping-card">
                  <div className="overview-card-header">
                    <div>
                      <h2>{t.tippingPointsTitle}</h2>
                      <p>{t.tippingPointsSubtitle}</p>
                    </div>
                    <a className="text-link-button" href={MCKAY_TIPPING_POINTS_SOURCE_URL} target="_blank" rel="noreferrer">
                      {t.tippingPointsSourceLabel} →
                    </a>
                  </div>
                  <div className="tipping-current-pill">
                    <span>{t.tippingCurrentWarmingLabel}</span>
                    <strong>
                      {currentTippingWarming == null ? "-" : projectionNumberFormat.format(currentTippingWarming)} {projectionUnitLabel}
                    </strong>
                    {annualGlobalMeanAnomalyIsYtd ? <small>{t.ytdLabel}</small> : null}
                  </div>
                  <div className="tipping-card-grid">
                    {tippingPointCards.map((card) => (
                      <article
                        className="tipping-point-card"
                        key={card.key}
                        style={{ "--tipping-accent": card.accent } as CSSProperties}
                        aria-label={`${card.label}: ${card.state}`}
                      >
                        <div className="tipping-card-topline">
                          <span>{card.category}</span>
                        </div>
                        <h3>{card.label}</h3>
                        <div className="tipping-threshold-row">
                          <span>{t.tippingCentralThresholdLabel}</span>
                          <strong>
                            {projectionNumberFormat.format(card.centralThreshold)} {projectionUnitLabel}
                          </strong>
                        </div>
                        <div className="tipping-range-track" aria-hidden="true">
                          <span
                            className="tipping-current-marker"
                            style={{
                              left:
                                currentTippingWarming == null
                                  ? "0%"
                                  : `${clamp((currentTippingWarming / card.maxThreshold) * 100, 0, 100)}%`,
                            }}
                          />
                          <span
                            className="tipping-central-marker"
                            style={{ left: `${clamp((card.centralThreshold / card.maxThreshold) * 100, 0, 100)}%` }}
                          />
                        </div>
                        <p>
                          {t.tippingRangeLabel}: {projectionNumberFormat.format(card.minThreshold)}-
                          {projectionNumberFormat.format(card.maxThreshold)} {projectionUnitLabel}
                        </p>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeView === "sources" ? (
      <footer className="dashboard-footer detail-page-section" id="sources">
        <div className="data-page-status-grid">
          <article className={`data-status-card source ${snapshot.sourceMode === "live" ? "live" : "sample"}`}>
            <span>{t.sourceStatusTitle}</span>
            <strong>{sourceModeLabel}</strong>
            <p>{sourceModeNote}</p>
          </article>
          <article className="data-status-card">
            <span>{t.sourceUpdatedTitle}</span>
            <strong>{formatDateTimeLabel(snapshot.updatedAtIso, language)}</strong>
            <p>{t.sourceListNote}</p>
          </article>
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
        <div className="footer-sources">
          <div className="footer-sources-header">
            <strong className="footer-sources-title">{t.sourceListTitle}</strong>
            <p>{t.sourceListNote}</p>
          </div>
          {groupedFooterSources.map((group) => (
            <section className="source-link-section" key={group.section}>
              <h2>{dataSourceSectionTitle(group.section, t)}</h2>
              <ul className="source-link-list">
                {group.sources.map((source) => (
                  <li key={source.key}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                    <span>
                      {t.sourceLabel}: {source.provider}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="footer-credit">{t.footerCredit}</p>
      </footer>
      ) : null}
      </main>
    </div>
  );
}
