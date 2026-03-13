import { Fragment, useEffect, useMemo, useState } from "react";
import { buildDashboardSnapshot, createBundledDataSource } from "../data/adapter";
import type {
  ClimateMapKey,
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

const STORAGE_LANG_KEY = "climate-dashboard-lang";
const STORAGE_THEME_KEY = "climate-dashboard-theme";
const DAY_MS = 86_400_000;
const PROJECTION_ANALOG_POOL_SIZE = 12;
const PROJECTION_MAX_ANALOGS = 8;
const PROJECTION_YTD_SIGMA = 0.16;
const PROJECTION_RECENCY_SCALE_YEARS = 6;
const PROJECTION_DELTA_SCALE = 0.18;
const REFERENCE_LEAP_YEAR = 2024;
const REFERENCE_LEAP_YEAR_START_UTC = Date.UTC(REFERENCE_LEAP_YEAR, 0, 1);
const CLIMATOLOGY_BASELINE_START_YEAR = 1991;
const CLIMATOLOGY_BASELINE_END_YEAR = 2020;
const MAP_CLIMATOLOGY_PERIOD = "1991-2020";
const EARTH_LOGO_URL = `${import.meta.env.BASE_URL}earthicon.png`;
const LOCAL_MAP_ASSET_BASE_URL = `${import.meta.env.BASE_URL}data/maps`;
const LOCAL_MAP_FILENAMES: Record<ClimateMapKey, string> = {
  global_2m_temperature: "global-2m-temperature.png",
  global_2m_temperature_anomaly: "global-2m-temperature-anomaly.png",
  global_sst: "global-sst.png",
  global_sst_anomaly: "global-sst-anomaly.png",
};
const SEA_ICE_KEYS = new Set(["global_sea_ice_extent", "arctic_sea_ice_extent", "antarctic_sea_ice_extent"]);
const OCEAN_KEYS = new Set(["global_mean_sea_level", "ocean_heat_content"]);
const TEMPERATURE_ANOMALY_KEYS = new Set(["global_surface_temperature_anomaly", "global_sea_surface_temperature_anomaly"]);
const DAILY_GLOBAL_MEAN_ANOMALY_KEY: ClimateMetricSeries["key"] = "daily_global_mean_temperature_anomaly";
const GLOBAL_TEMPERATURE_KEYS = new Set(["global_surface_temperature", "global_sea_surface_temperature"]);
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
const OCEAN_ORDER: ClimateMetricSeries["key"][] = ["global_mean_sea_level", "ocean_heat_content"];
const OCEAN_RANK = new Map(OCEAN_ORDER.map((key, index) => [key, index]));
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
const SEA_ICE_SUMMARY_ORDER: ClimateMetricSeries["key"][] = [
  "global_sea_ice_extent",
  "arctic_sea_ice_extent",
  "antarctic_sea_ice_extent",
];
const SEA_ICE_SUMMARY_RANK = new Map(SEA_ICE_SUMMARY_ORDER.map((key, index) => [key, index]));

const STRINGS = {
  en: {
    appTitle: "Climate Dashboard",
    appSubtitle: "Global climate indicators and forcings",
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
    climateIndicatorsTitle: "Climate Indicators",
    climateIndicatorsNote:
      "Monthly Jan-Dec view with daily points for temperature and sea-ice indicators, plus long-term ocean-state charts.",
    globalTemperaturesSectionTitle: "Global Temperatures",
    globalTemperaturesSectionNote: "Global surface and sea surface temperatures in a Jan-Dec daily comparison view.",
    oceansSectionTitle: "Oceans",
    oceansSectionNote: "Long-term ocean state indicators: global mean sea level and ocean heat content.",
    temperatureAnomalySectionTitle: "Temperature Anomalies",
    temperatureAnomalySectionNote:
      "Global and sea-surface anomaly cards use a 1991-2020 climatology; daily and annual global-mean anomaly charts use an ERA5 preindustrial (1850-1900) estimate.",
    dailyGlobalTemperatureAnomalyTitle: "Daily Global Mean Temperature Anomaly",
    dailyGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, estimated 1850-1900 baseline)",
    annualGlobalTemperatureAnomalyTitle: "Annual Global Temperature Anomaly",
    annualGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, estimated 1850-1900 baseline)",
    annualGlobalTemperatureAnomalyMethod: "Mean of available daily anomalies (year-to-date for the current year).",
    projectedAnnualTemperatureAnomalyTitle: "Projected Annual Temperature Anomaly",
    projectionExperimentalLabel: "Experimental",
    projectionRangeLabel: "Range",
    projectionMethodLabel: "YTD + recent analog seasonal paths",
    projectionSignalLabel: "ENSO signal",
    projectionsTitle: "Projections",
    projectionsNote:
      "Experimental outlook based on the current year-to-date global anomaly, recent analog years, and the latest ENSO forecast.",
    yearLabel: "Year",
    regionalTemperaturesSectionTitle: "Regional Temperatures",
    regionalTemperaturesSectionNote:
      "Daily Jan-Dec comparison for Northern Hemisphere, Arctic, North Atlantic SST, Southern Hemisphere, and Antarctic temperatures.",
    climatologyMeanLabel: "1991-2020 mean",
    seaIceSectionTitle: "Sea Ice",
    seaIceSectionNote:
      "Global, Arctic, and Antarctic extent shown with daily points in a Jan-Dec comparison view.",
    mapsSectionTitle: "Maps",
    mapsSectionNote:
      "Global Climate Reanalyzer map snapshots for 2m temperature, 2m anomaly, sea-surface temperature, and sea-surface temperature anomaly.",
    map2mTemperatureTitle: "Surface Temperature (2m)",
    map2mTemperatureAnomalyTitle: "Surface Temperature Anomaly (2m)",
    mapSstTitle: "Sea Surface Temperature",
    mapSstAnomalyTitle: "Sea Surface Temperature Anomaly",
    mapGlobalSubtitle: "Global map · Climate Reanalyzer",
    mapUnavailable: "Map unavailable",
    forcingTitle: "Forcing",
    forcingNote: "Atmospheric forcing signals from Mauna Loa CO2, global CH4 observations, and the NOAA Annual Greenhouse Gas Index.",
    sourceTitle: "Data source mode",
    sourceLive: "Live feeds",
    sourceMixed: "Mixed live + fallback",
    sourceBundled: "Bundled fallback",
    sourceLiveNote: "All series loaded from remote source feeds.",
    sourceMixedNote: "One or more live feeds failed; fallback data fills gaps.",
    sourceBundledNote: "All live feeds failed; bundled fallback drives every chart.",
    sourceCardsTitle: "Primary sources",
    sourceLabel: "Source",
    chartFullscreenEnter: "Full screen",
    chartFullscreenExit: "Exit full screen",
    freshnessAsOf: "As of",
    freshnessDaily: "daily",
    freshnessMonthly: "monthly",
    freshnessQuarterly: "quarterly",
    freshnessAnnual: "annual",
    freshnessLagging: "Lagging",
    freshnessStale: "Stale",
    ytdLabel: "YTD",
    chartLatest: "Latest",
    noData: "No data",
    valueUnavailable: "No value",
    footerMode: "Mode",
    footerUpdated: "Updated",
    footerCredit: "Made by András Tóth and GPT-5.3-Codex.",
  },
  hu: {
    appTitle: "Klíma Dashboard",
    appSubtitle: "Globális klímaindikátorok és éghajlati kényszerek",
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
    climateIndicatorsTitle: "Éghajlati Indikátorok",
    climateIndicatorsNote:
      "Január-decemberi nézet napi adatokkal a hőmérsékleti és tengeri jég indikátorokhoz, valamint hosszú távú óceáni állapotgrafikonokkal.",
    globalTemperaturesSectionTitle: "Globális hőmérsékletek",
    globalTemperaturesSectionNote: "Globális felszíni és tengerfelszíni hőmérsékletek január-decemberi napi összehasonlító nézetben.",
    oceansSectionTitle: "Óceánok",
    oceansSectionNote: "Hosszú távú óceáni állapotmutatók: globális átlagos tengerszint és óceáni hőtartalom.",
    temperatureAnomalySectionTitle: "Hőmérsékleti anomáliák",
    temperatureAnomalySectionNote:
      "A globális felszíni és tengerfelszíni anomáliák 1991-2020-as klimatológiára épülnek; a napi és éves globális átlaganomália-grafikonok ERA5-alapú, becsült 1850-1900-as bázishoz viszonyított értékeket mutatnak.",
    dailyGlobalTemperatureAnomalyTitle: "Napi globális átlaghőmérséklet-anomália",
    dailyGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, becsült 1850-1900-as referencia)",
    annualGlobalTemperatureAnomalyTitle: "Éves globális hőmérsékleti anomália",
    annualGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, becsült 1850-1900-as referencia)",
    annualGlobalTemperatureAnomalyMethod: "Az elérhető napi anomáliák átlaga (az aktuális évben évközi átlag).",
    projectedAnnualTemperatureAnomalyTitle: "Becsült éves hőmérsékleti anomália",
    projectionExperimentalLabel: "Kísérleti",
    projectionRangeLabel: "Tartomány",
    projectionMethodLabel: "Évközi + közeli analóg évek szezonális lefutása",
    projectionSignalLabel: "ENSO jel",
    projectionsTitle: "Előrejelzések",
    projectionsNote:
      "Kísérleti becslés az aktuális évközi globális anomália, a közelmúlt analóg évei és a legfrissebb ENSO-kilátás alapján.",
    yearLabel: "Év",
    regionalTemperaturesSectionTitle: "Regionális hőmérsékletek",
    regionalTemperaturesSectionNote:
      "Napi január-decemberi összehasonlítás az északi félteke, a déli félteke, az Arktisz, az Antarktisz és az észak-atlanti tengerfelszíni hőmérséklet (SST) adataival.",
    climatologyMeanLabel: "1991-2020-as átlag",
    seaIceSectionTitle: "Tengeri jég",
    seaIceSectionNote:
      "Globális, arktiszi és antarktiszi jégkiterjedés napi adatokkal, január-decemberi összehasonlító nézetben.",
    mapsSectionTitle: "Térképek",
    mapsSectionNote:
      "Globális Climate Reanalyzer térképkivonatok a 2 m hőmérsékletről, 2 m anomáliáról, tengerfelszíni hőmérsékletről és SST-anomáliáról.",
    map2mTemperatureTitle: "Felszíni hőmérséklet (2m)",
    map2mTemperatureAnomalyTitle: "Felszíni hőmérsékleti anomália (2m)",
    mapSstTitle: "Tengerfelszíni hőmérséklet",
    mapSstAnomalyTitle: "Tengerfelszíni hőmérsékleti anomália",
    mapGlobalSubtitle: "Globális térkép · Climate Reanalyzer",
    mapUnavailable: "A térkép nem érhető el",
    forcingTitle: "Éghajlati kényszerek",
    forcingNote: "Légköri kényszerek a Mauna Loa CO2, a globális CH4 megfigyelések és a NOAA éves üvegházhatásúgáz-index alapján.",
    sourceTitle: "Adatforrás mód",
    sourceLive: "Élő adatforrások",
    sourceMixed: "Vegyes (élő + tartalék)",
    sourceBundled: "Beépített tartalékadatok",
    sourceLiveNote: "Minden adatsor távoli élő adatforrásból töltődött be.",
    sourceMixedNote: "Egy vagy több élő adatforrás nem elérhető; a hiányt tartalék adatok pótolják.",
    sourceBundledNote: "Minden élő adatforrás nem elérhető; minden grafikon tartalék adatokat használ.",
    sourceCardsTitle: "Elsődleges források",
    sourceLabel: "Forrás",
    chartFullscreenEnter: "Teljes képernyő",
    chartFullscreenExit: "Kilépés",
    freshnessAsOf: "Dátum",
    freshnessDaily: "napi",
    freshnessMonthly: "havi",
    freshnessQuarterly: "negyedéves",
    freshnessAnnual: "éves",
    freshnessLagging: "Késik",
    freshnessStale: "Elavult",
    ytdLabel: "évközi",
    chartLatest: "Legfrissebb",
    noData: "Nincs adat",
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
  return "system";
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

interface MapDateParts {
  year: number;
  dayOfYear: number;
}

function padDayOfYear(dayOfYear: number): string {
  return String(Math.max(1, Math.min(366, dayOfYear))).padStart(3, "0");
}

function buildMapDateParts(dateIso: string | null): MapDateParts {
  const parsed = typeof dateIso === "string" ? Date.parse(`${dateIso}T00:00:00Z`) : Number.NaN;
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  const year = date.getUTCFullYear();
  const dayOfYear = Math.floor((Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  return {
    year,
    dayOfYear,
  };
}

function buildMapDateCandidates(baseDate: MapDateParts): MapDateParts[] {
  const clampedDay = Math.max(1, Math.min(366, baseDate.dayOfYear));
  const baseTimestamp = Date.UTC(baseDate.year, 0, 1) + (clampedDay - 1) * 86_400_000;
  const recentCandidates: MapDateParts[] = [];
  for (let backDays = 0; backDays <= 14; backDays += 1) {
    const date = new Date(baseTimestamp - backDays * 86_400_000);
    const year = date.getUTCFullYear();
    const dayOfYear = Math.floor((Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
    recentCandidates.push({
      year,
      dayOfYear,
    });
  }
  const previousYearSameDay = {
    year: baseDate.year - 1,
    dayOfYear: Math.max(1, Math.min(365, clampedDay)),
  };
  const previousYearPreviousDay = {
    year: baseDate.year - 1,
    dayOfYear: Math.max(1, Math.min(365, clampedDay - 1)),
  };
  const unique = new Map<string, MapDateParts>();
  for (const candidate of [...recentCandidates, previousYearSameDay, previousYearPreviousDay]) {
    if (candidate.year < 1900) continue;
    const key = `${candidate.year}-${candidate.dayOfYear}`;
    unique.set(key, candidate);
  }
  return Array.from(unique.values());
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

function formatMapImageAlt(title: string, mapDateIso: string | null, language: Language): string {
  return mapDateIso ? `${title} (${formatDateLabel(mapDateIso, language)})` : title;
}

function formatAnnualAnomalyTopMeta(year: number, language: Language, isYtd: boolean, ytdLabel: string): string {
  const ytdSuffix = isYtd ? ` (${ytdLabel})` : "";
  if (language === "hu") return `Év: ${year}${ytdSuffix} vs 1850-1900`;
  return `Year: ${year}${ytdSuffix} vs 1850-1900`;
}

function formatProjectionTopMeta(year: number, language: Language): string {
  if (language === "hu") return `Év: ${year} becslés vs 1850-1900`;
  return `Year: ${year} projection vs 1850-1900`;
}

function formatMetricValue(metric: ClimateMetricSeries, language: Language, unavailableText: string): string {
  if (metric.latestValue == null || !Number.isFinite(metric.latestValue)) return unavailableText;
  return new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    minimumFractionDigits: metric.decimals,
    maximumFractionDigits: metric.decimals,
  }).format(metric.latestValue);
}

function metricTitle(metric: ClimateMetricSeries, language: Language): string {
  return language === "hu" ? metric.titleHu : metric.titleEn;
}

function buildMonthLabels(language: Language): string[] {
  if (language === "hu") return ["Jan", "Febr", "Márc", "Ápr", "Máj", "Jún", "Júl", "Aug", "Szept", "Okt", "Nov", "Dec"];
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
}

const ENSO_TARGET_MONTH_LABELS: Record<string, { en: string; hu: string }> = {
  January: { en: "Jan", hu: "Jan" },
  February: { en: "Feb", hu: "Febr" },
  March: { en: "Mar", hu: "Márc" },
  April: { en: "Apr", hu: "Ápr" },
  May: { en: "May", hu: "Máj" },
  June: { en: "Jun", hu: "Jún" },
  July: { en: "Jul", hu: "Júl" },
  August: { en: "Aug", hu: "Aug" },
  September: { en: "Sep", hu: "Szept" },
  October: { en: "Oct", hu: "Okt" },
  November: { en: "Nov", hu: "Nov" },
  December: { en: "Dec", hu: "Dec" },
};
const ENSO_TARGET_SEASON_LABELS: Record<string, { en: string; hu: string }> = {
  DJF: { en: "Dec-Feb", hu: "Dec-Febr" },
  JFM: { en: "Jan-Mar", hu: "Jan-Márc" },
  FMA: { en: "Feb-Apr", hu: "Febr-Ápr" },
  MAM: { en: "Mar-May", hu: "Márc-Máj" },
  AMJ: { en: "Apr-Jun", hu: "Ápr-Jún" },
  MJJ: { en: "May-Jul", hu: "Máj-Júl" },
  JJA: { en: "Jun-Aug", hu: "Jún-Aug" },
  JAS: { en: "Jul-Sep", hu: "Júl-Szept" },
  ASO: { en: "Aug-Oct", hu: "Aug-Okt" },
  SON: { en: "Sep-Nov", hu: "Szept-Nov" },
  OND: { en: "Oct-Dec", hu: "Okt-Dec" },
  NDJ: { en: "Nov-Jan", hu: "Nov-Jan" },
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
  analogCount: number;
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
  const weightedEntries = validAnalogs.map((entry) => ({ value: entry.projectedAnnualMean, weight: entry.weight }));
  const low = weightedQuantile(weightedEntries, 0.15);
  const high = weightedQuantile(weightedEntries, 0.85);
  if (low == null || high == null) return null;

  return {
    year: currentYear,
    value: Math.round(value * 1000) / 1000,
    low: Math.round(low * 1000) / 1000,
    high: Math.round(high * 1000) / 1000,
    analogCount: validAnalogs.length,
    ensoWindow,
  };
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

function buildIndicatorYearColors(currentYear: number, dark: boolean): Record<number, string> {
  const previousYearGradient = dark ? ["#60a5fa", "#7e9cbc", "#94a3b8"] : ["#2563eb", "#4f76a4", "#94a3b8"];
  return {
    [currentYear]: dark ? "#fb923c" : "#f97316",
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

function indicatorYAxisBounds(metricKey: ClimateMetricSeries["key"]): { min?: number; max?: number } {
  switch (metricKey) {
    case "global_surface_temperature":
      return { min: 10, max: 18 };
    case "global_sea_surface_temperature":
      return { min: 19.5, max: 21.5 };
    case "global_mean_sea_level":
      return { min: -40, max: 140 };
    case "ocean_heat_content":
      return { min: -20, max: 70 };
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
    case "global_surface_temperature_anomaly":
    case "global_sea_surface_temperature_anomaly":
      return { min: -2, max: 2 };
    case "daily_global_mean_temperature_anomaly":
      return { min: -2, max: 2 };
    case "global_sea_ice_extent":
      return { min: 10, max: 30 };
    case "arctic_sea_ice_extent":
      return { min: 2, max: 18 };
    case "antarctic_sea_ice_extent":
      return { min: 0, max: 22 };
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
    case "daily_global_mean_temperature_anomaly":
      return language === "hu" ? "Celsius-fok" : "degrees °C";
    case "global_mean_sea_level":
      return language === "hu" ? "milliméter (mm)" : "millimeters (mm)";
    case "ocean_heat_content":
      return language === "hu" ? "10^22 joule" : "10^22 joules";
    case "global_sea_ice_extent":
    case "arctic_sea_ice_extent":
    case "antarctic_sea_ice_extent":
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
    case "atmospheric_aggi":
      return language === "hu" ? "AGGI index (1990=1)" : "AGGI index (1990=1)";
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
    case "atmospheric_aggi":
      return { yMin: 0.7, yMax: 1.8, minYear: 1979 };
    default:
      return {};
  }
}

function cardUnitLabel(metricKey: ClimateMetricSeries["key"], unit: string, language: Language): string {
  if (language !== "hu") return unit;
  if (SEA_ICE_KEYS.has(metricKey)) return "millió km2";
  if (metricKey === "global_mean_sea_level") return "mm";
  if (metricKey === "ocean_heat_content") return "10^22 J";
  if (metricKey === "atmospheric_aggi") return "index";
  if (
    GLOBAL_TEMPERATURE_KEYS.has(metricKey) ||
    REGIONAL_TEMPERATURE_KEYS.has(metricKey) ||
    TEMPERATURE_ANOMALY_KEYS.has(metricKey) ||
    metricKey === DAILY_GLOBAL_MEAN_ANOMALY_KEY
  ) {
    return "Celsius-fok";
  }
  return unit;
}

function topSummaryCategoryClass(metricKey: ClimateMetricSeries["key"]): string {
  if (metricKey === "global_surface_temperature" || metricKey === "global_sea_surface_temperature") {
    return "topcat-temperature";
  }
  if (
    metricKey === "global_surface_temperature_anomaly" ||
    metricKey === "global_sea_surface_temperature_anomaly" ||
    metricKey === "daily_global_mean_temperature_anomaly"
  ) {
    return "topcat-anomaly";
  }
  if (metricKey === "global_sea_ice_extent" || metricKey === "arctic_sea_ice_extent" || metricKey === "antarctic_sea_ice_extent") {
    return "topcat-sea-ice";
  }
  if (metricKey === "atmospheric_co2" || metricKey === "atmospheric_ch4" || metricKey === "atmospheric_aggi") {
    return "topcat-forcing";
  }
  return "topcat-neutral";
}

type FreshnessTone = "fresh" | "warning" | "stale";
type FreshnessCadence = "daily" | "monthly" | "quarterly" | "annual";

interface FreshnessPolicy {
  cadence: FreshnessCadence;
  warningDays: number;
  staleDays: number;
}

function freshnessPolicyForMetric(metricKey: ClimateMetricSeries["key"]): FreshnessPolicy {
  switch (metricKey) {
    case "global_sea_surface_temperature":
    case "global_sea_surface_temperature_anomaly":
    case "north_atlantic_sea_surface_temperature":
      return { cadence: "daily", warningDays: 21, staleDays: 45 };
    case "atmospheric_co2":
      return { cadence: "daily", warningDays: 14, staleDays: 35 };
    case "atmospheric_ch4":
      return { cadence: "monthly", warningDays: 90, staleDays: 180 };
    case "global_mean_sea_level":
      return { cadence: "monthly", warningDays: 120, staleDays: 240 };
    case "ocean_heat_content":
      return { cadence: "quarterly", warningDays: 180, staleDays: 360 };
    case "atmospheric_aggi":
      return { cadence: "annual", warningDays: 550, staleDays: 900 };
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
  const [climateSectionOpen, setClimateSectionOpen] = useState(true);
  const [mapsSectionOpen, setMapsSectionOpen] = useState(true);
  const [forcingSectionOpen, setForcingSectionOpen] = useState(true);
  const [projectionsSectionOpen, setProjectionsSectionOpen] = useState(true);

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
    let active = true;

    loadRuntimeDataSource()
      .then((nextSource) => {
        if (!active) return;
        setDataSource(nextSource);
      });

    return () => {
      active = false;
    };
  }, []);

  const snapshot = useMemo(() => buildDashboardSnapshot(dataSource), [dataSource]);
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
  const footerSources = useMemo(() => {
    const ensoSource = dataSource.ensoOutlook;
    const sources = [...snapshot.indicators, ...snapshot.forcing].map((metric) => ({
      key: `${metric.key}-footer-source`,
      url: metric.source.url,
      label: `${metricTitle(metric, language)} · ${metric.source.shortName}`,
    }));
    if (ensoSource?.sourceUrl) {
      sources.push({
        key: "enso-outlook-footer-source",
        url: ensoSource.sourceUrl,
        label: `${t.ensoOutlookTitle} · ${ensoSource.sourceLabel || "NOAA CPC"}`,
      });
    }
    return sources;
  }, [snapshot.indicators, snapshot.forcing, language, dataSource.ensoOutlook, t]);
  const monthlyLabels = useMemo(() => buildMonthLabels(language), [language]);
  const indicatorLines = useMemo(
    () =>
      snapshot.indicators
        .filter((metric) => !OCEAN_KEYS.has(metric.key))
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
  const seaIceIndicatorLines = useMemo(
    () => indicatorLines.filter(({ metric }) => SEA_ICE_KEYS.has(metric.key)),
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
  const mapCards = useMemo(() => {
    const metricByKey = new Map(snapshot.indicators.map((metric) => [metric.key, metric]));
    const surfaceMetric = metricByKey.get("global_surface_temperature") ?? null;
    const sstMetric = metricByKey.get("global_sea_surface_temperature") ?? null;
    const mapAssets = dataSource.maps ?? {};
    const mapVersion = encodeURIComponent(snapshot.updatedAtIso);
    const generatedDateIso = extractIsoDate(snapshot.updatedAtIso);

    const surfaceMapDateIso = mapAssets.global_2m_temperature?.date ?? null;
    const surfaceAnomalyMapDateIso = mapAssets.global_2m_temperature_anomaly?.date ?? null;
    const sstMapDateIso = mapAssets.global_sst?.date ?? null;
    const sstAnomalyMapDateIso = mapAssets.global_sst_anomaly?.date ?? null;

    const surfaceMapCandidateDateIso = surfaceMapDateIso ?? surfaceMetric?.latestDate ?? generatedDateIso ?? null;
    const sstMapCandidateDateIso = sstMapDateIso ?? sstMetric?.latestDate ?? generatedDateIso ?? null;
    const surfaceMapDisplayDateIso = surfaceMapDateIso ?? null;
    const surfaceAnomalyMapDisplayDateIso = surfaceAnomalyMapDateIso ?? null;
    const sstMapDisplayDateIso = sstMapDateIso ?? null;
    const sstAnomalyMapDisplayDateIso = sstAnomalyMapDateIso ?? null;

    const t2DateCandidates = buildMapDateCandidates(buildMapDateParts(surfaceMapCandidateDateIso));
    const sstDateCandidates = buildMapDateCandidates(buildMapDateParts(sstMapCandidateDateIso));
    const t2MapUrls = t2DateCandidates.map((candidate) => {
      const doy = padDayOfYear(candidate.dayOfYear);
      return {
        t2: `https://cr.acg.maine.edu/clim/t2_daily/maps/t2/world-wt/${candidate.year}/t2_world-wt_${candidate.year}_d${doy}.png`,
        t2Anomaly: `https://cr.acg.maine.edu/clim/t2_daily/maps/t2anom_${MAP_CLIMATOLOGY_PERIOD}/world-wt/${candidate.year}/t2anom_world-wt_${candidate.year}_d${doy}.png`,
      };
    });
    const sstMapUrls = sstDateCandidates.map((candidate) => {
      const doy = padDayOfYear(candidate.dayOfYear);
      return {
        sst: `https://cr.acg.maine.edu/clim/sst_daily/maps/sst/world-wt3/${candidate.year}/sst_world-wt3_${candidate.year}_d${doy}.png`,
        sstAnomaly: `https://cr.acg.maine.edu/clim/sst_daily/maps/sstanom_${MAP_CLIMATOLOGY_PERIOD}/world-wt3/${candidate.year}/sstanom_world-wt3_${candidate.year}_d${doy}.png`,
      };
    });

    const surfaceSubtitle = `${surfaceMetric?.source.shortName ?? "Climate Reanalyzer"} · ${t.mapGlobalSubtitle}`;
    const sstSubtitle = `${sstMetric?.source.shortName ?? "Climate Reanalyzer"} · ${t.mapGlobalSubtitle}`;
    const surfaceFreshness = mapFreshnessBadge(surfaceMapDateIso, language, t);
    const surfaceAnomalyFreshness = mapFreshnessBadge(surfaceAnomalyMapDateIso, language, t);
    const sstFreshness = mapFreshnessBadge(sstMapDateIso, language, t);
    const sstAnomalyFreshness = mapFreshnessBadge(sstAnomalyMapDateIso, language, t);

    return [
      {
        key: "map-2m-temperature",
        title: t.map2mTemperatureTitle,
        subtitle: surfaceSubtitle,
        imageUrl: buildMapAssetUrl(mapAssets.global_2m_temperature?.path, LOCAL_MAP_FILENAMES.global_2m_temperature, mapVersion),
        fallbackImageUrls: uniqueNonEmptyStrings([mapAssets.global_2m_temperature?.sourceUrl, ...t2MapUrls.map((entry) => entry.t2)]),
        imageAlt: formatMapImageAlt(t.map2mTemperatureTitle, surfaceMapDisplayDateIso, language),
        freshness: surfaceFreshness,
      },
      {
        key: "map-2m-temperature-anomaly",
        title: t.map2mTemperatureAnomalyTitle,
        subtitle: surfaceSubtitle,
        imageUrl: buildMapAssetUrl(
          mapAssets.global_2m_temperature_anomaly?.path,
          LOCAL_MAP_FILENAMES.global_2m_temperature_anomaly,
          mapVersion
        ),
        fallbackImageUrls: uniqueNonEmptyStrings([
          mapAssets.global_2m_temperature_anomaly?.sourceUrl,
          ...t2MapUrls.map((entry) => entry.t2Anomaly),
        ]),
        imageAlt: formatMapImageAlt(t.map2mTemperatureAnomalyTitle, surfaceAnomalyMapDisplayDateIso, language),
        freshness: surfaceAnomalyFreshness,
      },
      {
        key: "map-sst",
        title: t.mapSstTitle,
        subtitle: sstSubtitle,
        imageUrl: buildMapAssetUrl(mapAssets.global_sst?.path, LOCAL_MAP_FILENAMES.global_sst, mapVersion),
        fallbackImageUrls: uniqueNonEmptyStrings([mapAssets.global_sst?.sourceUrl, ...sstMapUrls.map((entry) => entry.sst)]),
        imageAlt: formatMapImageAlt(t.mapSstTitle, sstMapDisplayDateIso, language),
        freshness: sstFreshness,
      },
      {
        key: "map-sst-anomaly",
        title: t.mapSstAnomalyTitle,
        subtitle: sstSubtitle,
        imageUrl: buildMapAssetUrl(mapAssets.global_sst_anomaly?.path, LOCAL_MAP_FILENAMES.global_sst_anomaly, mapVersion),
        fallbackImageUrls: uniqueNonEmptyStrings([
          mapAssets.global_sst_anomaly?.sourceUrl,
          ...sstMapUrls.map((entry) => entry.sstAnomaly),
        ]),
        imageAlt: formatMapImageAlt(t.mapSstAnomalyTitle, sstAnomalyMapDisplayDateIso, language),
        freshness: sstAnomalyFreshness,
      },
    ];
  }, [snapshot.indicators, snapshot.updatedAtIso, dataSource.maps, language, t]);

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
        subtitle={metric.source.shortName}
        expandLabel={t.chartFullscreenEnter}
        collapseLabel={t.chartFullscreenExit}
        freshnessLabel={freshness.label}
        freshnessTone={freshness.tone}
        option={buildClimateMonthlyComparisonOption({
          monthLabels: monthlyLabels,
          lines,
          unit: metric.unit,
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
          yearColors: buildIndicatorYearColors(currentYear, resolvedTheme === "dark"),
          labels: {
            noData: t.noData,
          },
        })}
      />
    );
  };

  const renderOceanPanel = (metric: ClimateMetricSeries) => {
    const bounds = indicatorYAxisBounds(metric.key);
    const yAxisLabel = indicatorYAxisUnitLabel(metric.key, language);
    const freshness = metricFreshnessBadge(metric, language, t);

    return (
      <EChartsPanel
        key={metric.key}
        title={metricTitle(metric, language)}
        subtitle={metric.source.shortName}
        expandLabel={t.chartFullscreenEnter}
        collapseLabel={t.chartFullscreenExit}
        freshnessLabel={freshness.label}
        freshnessTone={freshness.tone}
        option={buildClimateTrendOption({
          points: metric.points,
          seriesName: metricTitle(metric, language),
          unit: metric.unit,
          decimals: metric.decimals,
          lineWidth: 2.1,
          yAxisMin: bounds.min,
          yAxisMax: bounds.max,
          yAxisUnitLabel: yAxisLabel,
          xAxisYearLabelStep: 10,
          disableDataZoom: true,
          forceMappedYearLabels: true,
          showLegend: false,
          compact,
          dark: resolvedTheme === "dark",
          color: resolvedTheme === "dark" ? "#38bdf8" : "#0284c7",
          labels: {
            noData: t.noData,
            latest: t.chartLatest,
          },
        })}
      />
    );
  };

  const sourceModeLabel =
    snapshot.sourceMode === "live"
      ? t.sourceLive
      : snapshot.sourceMode === "mixed"
        ? t.sourceMixed
        : t.sourceBundled;
  const ensoOutlookFreshness = ensoFreshnessBadge(ensoOutlook, language, t);
  const dailyGlobalMeanAnomalyFreshness = dailyGlobalMeanAnomalyMetric
    ? metricFreshnessBadge(dailyGlobalMeanAnomalyMetric, language, t)
    : null;
  const projectionFreshness = ensoOutlookFreshness ?? dailyGlobalMeanAnomalyFreshness;
  const projectionNumberFormat = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
    minimumFractionDigits: dailyGlobalMeanAnomalyMetric?.decimals ?? 2,
    maximumFractionDigits: dailyGlobalMeanAnomalyMetric?.decimals ?? 2,
  });
  const projectionSignalSummary = projectedAnnualGlobalMeanAnomaly?.ensoWindow
    ? `${t.projectionSignalLabel}: ${formatEnsoTargetLabel(projectedAnnualGlobalMeanAnomaly.ensoWindow.targetLabel, language)} · ${formatEnsoConditionLabel(projectedAnnualGlobalMeanAnomaly.ensoWindow.condition, t)} · ${projectedAnnualGlobalMeanAnomaly.ensoWindow.probability ?? "-"}%`
    : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img className="topbar-logo" src={EARTH_LOGO_URL} alt="" aria-hidden="true" />
          <div>
            <h1>{t.appTitle}</h1>
            <p className="subtitle">{t.appSubtitle}</p>
          </div>
        </div>

        <div className="controls">
          <div className="control-group">
            <label htmlFor="lang-select">{t.language}</label>
            <select id="lang-select" value={language} onChange={(event) => setLanguage(safeLanguage(event.target.value))}>
              <option value="en">English</option>
              <option value="hu">Magyar</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="theme-select">{t.theme}</label>
            <select id="theme-select" value={themeMode} onChange={(event) => setThemeMode(safeTheme(event.target.value))}>
              <option value="system">{t.themeSystem}</option>
              <option value="light">{t.themeLight}</option>
              <option value="dark">{t.themeDark}</option>
            </select>
          </div>

        </div>
      </header>

      <section className="alerts-grid" aria-label={t.latestSignalsAria}>
        {latestAnnualGlobalMeanAnomaly ? (
          <article className="alert-card summary summary-top topcat-anomaly" key="annual-global-temperature-anomaly-summary">
            <h2>{t.annualGlobalTemperatureAnomalyTitle}</h2>
            <p className="alert-emphasis">
              {new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", {
                minimumFractionDigits: dailyGlobalMeanAnomalyMetric?.decimals ?? 2,
                maximumFractionDigits: dailyGlobalMeanAnomalyMetric?.decimals ?? 2,
              }).format(latestAnnualGlobalMeanAnomaly.value)}{" "}
              {cardUnitLabel(
                DAILY_GLOBAL_MEAN_ANOMALY_KEY,
                dailyGlobalMeanAnomalyMetric?.unit ?? "deg C",
                language
              )}
            </p>
            <p className="summary-meta">
              {formatAnnualAnomalyTopMeta(latestAnnualGlobalMeanAnomaly.year, language, annualGlobalMeanAnomalyIsYtd, t.ytdLabel)}
            </p>
            {dailyGlobalMeanAnomalyFreshness ? (
              <span className={`freshness-chip ${dailyGlobalMeanAnomalyFreshness.tone}`}>{dailyGlobalMeanAnomalyFreshness.label}</span>
            ) : null}
          </article>
        ) : null}
        {headlineMetrics.map((metric) => {
          const freshness = metricFreshnessBadge(metric, language, t);
          return (
            <Fragment key={metric.key}>
              {metric.key === "atmospheric_co2" && ensoOutlook?.nextSixMonths ? (
                <article className="alert-card summary summary-top topcat-enso" key="enso-outlook-summary">
                  <h2>{t.ensoOutlookTitle}</h2>
                  <p className="alert-emphasis">{formatEnsoConditionLabel(ensoOutlook.nextSixMonths.condition, t)}</p>
                  <p className="summary-meta">
                    {t.ensoNextSixMonths} · {formatEnsoTargetLabel(ensoOutlook.nextSixMonths.targetLabel, language)} ·{" "}
                    {ensoOutlook.nextSixMonths.probability ?? "-"}%
                  </p>
                  {ensoOutlookFreshness ? (
                    <span className={`freshness-chip ${ensoOutlookFreshness.tone}`}>{ensoOutlookFreshness.label}</span>
                  ) : null}
                </article>
              ) : null}
              <article className={`alert-card summary summary-top ${topSummaryCategoryClass(metric.key)}`}>
                <h2>{metricTitle(metric, language)}</h2>
                <p className="alert-emphasis">
                  {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
                </p>
                <p className="summary-meta">
                  {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                </p>
                <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span>
              </article>
            </Fragment>
          );
        })}
      </section>

      <section className="collapsible-section">
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
            <div className="climate-subsection">
              <div className="climate-subsection-header">
                <h3>{t.globalTemperaturesSectionTitle}</h3>
                <p>{t.globalTemperaturesSectionNote}</p>
              </div>
              <div className="charts-grid climate-grid">
                {globalTemperatureLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
              </div>
            </div>

            <div className="climate-subsection">
              <div className="climate-subsection-header">
                <h3>{t.temperatureAnomalySectionTitle}</h3>
                <p>{t.temperatureAnomalySectionNote}</p>
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
                      unit: dailyGlobalMeanAnomalyMetric.unit,
                      decimals: dailyGlobalMeanAnomalyMetric.decimals,
                      lineWidth: 2,
                      yAxisMin: indicatorYAxisBounds(dailyGlobalMeanAnomalyMetric.key).min,
                      yAxisMax: indicatorYAxisBounds(dailyGlobalMeanAnomalyMetric.key).max,
                      yAxisUnitLabel: indicatorYAxisUnitLabel(dailyGlobalMeanAnomalyMetric.key, language),
                      xAxisYearLabelStep: 10,
                      disableDataZoom: true,
                      forceMappedYearLabels: true,
                      showLegend: false,
                      compact,
                      dark: resolvedTheme === "dark",
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
                      unit: dailyGlobalMeanAnomalyMetric.unit,
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
                      color: resolvedTheme === "dark" ? "#38bdf8" : "#0284c7",
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
            </div>

            <div className="climate-subsection">
              <div className="climate-subsection-header">
                <h3>{t.regionalTemperaturesSectionTitle}</h3>
                <p>{t.regionalTemperaturesSectionNote}</p>
              </div>
              <div className="summary-cards-section">
                <div className="regional-summary-grid projection-summary-grid">
                  {regionalSummaryMetrics.map((metric) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className="alert-card summary" key={`${metric.key}-regional-summary`}>
                        <span className="alert-kicker">{t.latestLabel}</span>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">
                          {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
                        </p>
                        <p>
                          {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                        </p>
                        <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span>
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{metric.source.shortName}</span>
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
            </div>

            <div className="climate-subsection">
              <div className="climate-subsection-header">
                <h3>{t.oceansSectionTitle}</h3>
                <p>{t.oceansSectionNote}</p>
              </div>
              <div className="summary-cards-section">
                <div className="regional-summary-grid">
                  {oceanMetrics.map((metric) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className="alert-card summary" key={`${metric.key}-ocean-summary`}>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">
                          {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
                        </p>
                        <p>
                          {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                        </p>
                        <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span>
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{metric.source.shortName}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="charts-grid climate-grid">
                {oceanMetrics.map((metric) => renderOceanPanel(metric))}
              </div>
            </div>

            <div className="climate-subsection">
              <div className="climate-subsection-header">
                <h3>{t.seaIceSectionTitle}</h3>
                <p>{t.seaIceSectionNote}</p>
              </div>
              <div className="summary-cards-section">
                <div className="regional-summary-grid">
                  {seaIceSummaryMetrics.map((metric) => {
                    const freshness = metricFreshnessBadge(metric, language, t);
                    return (
                      <article className="alert-card summary" key={`${metric.key}-sea-ice-summary`}>
                        <span className="alert-kicker">{t.latestLabel}</span>
                        <h2>{metricTitle(metric, language)}</h2>
                        <p className="alert-emphasis">
                          {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
                        </p>
                        <p>
                          {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                        </p>
                        <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span>
                        <div className="alert-meta">
                          <span className="alert-meta-chip confidence-medium">{metric.source.shortName}</span>
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
            </div>
          </div>
        ) : null}
      </section>

      <section className="collapsible-section">
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

      <section className="collapsible-section">
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
                    <article className="alert-card summary" key={`${metric.key}-forcing-summary`}>
                      <span className="alert-kicker">{t.latestLabel}</span>
                      <h2>{metricTitle(metric, language)}</h2>
                      <p className="alert-emphasis">
                        {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
                      </p>
                      <p>
                        {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                      </p>
                      <span className={`freshness-chip ${freshness.tone}`}>{freshness.label}</span>
                      <div className="alert-meta">
                        <span className="alert-meta-chip confidence-medium">{metric.source.shortName}</span>
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
                        color: resolvedTheme === "dark" ? "#fb923c" : "#f97316",
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
                        labels: {
                          noData: t.noData,
                          latest: t.chartLatest,
                        },
                      });
                return (
                  <EChartsPanel
                    key={metric.key}
                    title={title}
                    subtitle={metric.source.shortName}
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

      {projectedAnnualGlobalMeanAnomaly ? (
        <section className="collapsible-section">
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
              <div className="summary-cards-section">
                <div className="regional-summary-grid projection-summary-grid">
                  <article className="alert-card summary projection-summary-card">
                    <h2>{t.projectedAnnualTemperatureAnomalyTitle}</h2>
                    <p className="alert-emphasis">
                      {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.value)}{" "}
                      {cardUnitLabel(
                        DAILY_GLOBAL_MEAN_ANOMALY_KEY,
                        dailyGlobalMeanAnomalyMetric?.unit ?? "deg C",
                        language
                      )}
                    </p>
                    <p className="summary-meta">{formatProjectionTopMeta(projectedAnnualGlobalMeanAnomaly.year, language)}</p>
                    <p className="summary-meta">
                      {t.projectionExperimentalLabel} · {t.projectionRangeLabel}:{" "}
                      {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.low)}-
                      {projectionNumberFormat.format(projectedAnnualGlobalMeanAnomaly.high)}{" "}
                      {cardUnitLabel(
                        DAILY_GLOBAL_MEAN_ANOMALY_KEY,
                        dailyGlobalMeanAnomalyMetric?.unit ?? "deg C",
                        language
                      )}
                    </p>
                    <p className="summary-meta">{t.projectionMethodLabel}</p>
                    {projectionSignalSummary ? <p className="summary-meta">{projectionSignalSummary}</p> : null}
                    {projectionFreshness ? (
                      <span className={`freshness-chip ${projectionFreshness.tone}`}>{projectionFreshness.label}</span>
                    ) : null}
                  </article>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="dashboard-footer">
        <div className="footer-strip">
          <span className={`footer-chip compact source ${snapshot.sourceMode === "live" ? "live" : "sample"}`}>
            {t.sourceTitle}: {sourceModeLabel}
          </span>
          <span className="footer-chip">
            {t.footerUpdated}: {formatDateTimeLabel(snapshot.updatedAtIso, language)}
          </span>
        </div>
        <div className="footer-sources">
          <strong className="footer-sources-title">{t.sourceCardsTitle}</strong>
          <div className="footer-sources-links">
            {footerSources.map((source) => (
              <a key={source.key} href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            ))}
          </div>
        </div>
        <p className="footer-credit">{t.footerCredit}</p>
      </footer>
    </div>
  );
}
