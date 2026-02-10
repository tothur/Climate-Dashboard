import { useEffect, useMemo, useState } from "react";
import { buildDashboardSnapshot, createBundledDataSource } from "../data/adapter";
import type { DashboardDataSource, Language, ResolvedTheme, ThemeMode, ClimateMetricSeries, DailyPoint } from "../domain/model";
import { loadRuntimeDataSource } from "../data/runtime-source";
import { buildClimateMonthlyComparisonOption, buildClimateTrendOption } from "../charts/iliTrend";
import { buildForcingTrendOption } from "../charts/historicalTrend";
import { EChartsPanel } from "../components/EChartsPanel";

const STORAGE_LANG_KEY = "climate-dashboard-lang";
const STORAGE_THEME_KEY = "climate-dashboard-theme";
const REFERENCE_LEAP_YEAR = 2024;
const REFERENCE_LEAP_YEAR_START_UTC = Date.UTC(REFERENCE_LEAP_YEAR, 0, 1);
const CLIMATOLOGY_BASELINE_START_YEAR = 1991;
const CLIMATOLOGY_BASELINE_END_YEAR = 2020;
const EARTH_LOGO_URL = `${import.meta.env.BASE_URL}earthicon.png`;
const SEA_ICE_KEYS = new Set(["global_sea_ice_extent", "arctic_sea_ice_extent", "antarctic_sea_ice_extent"]);
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
      "Monthly Jan-Dec view with daily points: current year plus the previous three years for global, regional, and sea-ice indicators.",
    globalTemperaturesSectionTitle: "Global Temperatures",
    globalTemperaturesSectionNote: "Global surface and sea surface temperatures in a Jan-Dec daily comparison view.",
    temperatureAnomalySectionTitle: "Temperature Anomalies",
    temperatureAnomalySectionNote:
      "Global and sea-surface anomaly cards use a 1991-2020 climatology; daily and annual global-mean anomaly charts use an ERA5 preindustrial (1850-1900) estimate.",
    dailyGlobalTemperatureAnomalyTitle: "Daily Global Mean Temperature Anomaly",
    dailyGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, estimated 1850-1900 baseline)",
    annualGlobalTemperatureAnomalyTitle: "Annual Global Temperature Anomaly",
    annualGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, estimated 1850-1900 baseline)",
    annualGlobalTemperatureAnomalyMethod: "Mean of available daily anomalies (year-to-date for the current year).",
    yearLabel: "Year",
    regionalTemperaturesSectionTitle: "Regional Temperatures",
    regionalTemperaturesSectionNote:
      "Daily Jan-Dec comparison for Northern Hemisphere, Arctic, North Atlantic SST, Southern Hemisphere, and Antarctic temperatures.",
    climatologyMeanLabel: "1991-2020 mean",
    seaIceSectionTitle: "Sea Ice",
    seaIceSectionNote:
      "Global, Arctic, and Antarctic extent shown with daily points in a Jan-Dec comparison view.",
    forcingTitle: "Forcing",
    forcingNote: "Atmospheric forcing signals from Mauna Loa CO2 and global CH4 observations.",
    sourceTitle: "Data source mode",
    sourceLive: "Live feeds",
    sourceMixed: "Mixed live + fallback",
    sourceBundled: "Bundled fallback",
    sourceLiveNote: "All series loaded from remote source feeds.",
    sourceMixedNote: "One or more live feeds failed; fallback data fills gaps.",
    sourceBundledNote: "All live feeds failed; bundled fallback drives every chart.",
    sourceCardsTitle: "Primary sources",
    sourceLabel: "Source",
    chartLatest: "Latest",
    noData: "No data",
    valueUnavailable: "No value",
    footerMode: "Mode",
    footerUpdated: "Updated",
  },
  hu: {
    appTitle: "Klíma Dashboard",
    appSubtitle: "Globális klímaindikátorok és forcing tényezők",
    language: "Nyelv",
    theme: "Téma",
    themeSystem: "Rendszer",
    themeDark: "Sötét",
    themeLight: "Világos",
    sectionExpand: "Kinyitás",
    sectionCollapse: "Összecsukás",
    latestLabel: "Legfrissebb",
    latestAnnualLabel: "Legfrissebb éves érték",
    latestSignalsAria: "Legfrissebb klíma indikátorok",
    climateIndicatorsTitle: "Éghajlati Indikátorok",
    climateIndicatorsNote:
      "Havi Jan-Dec nézet napi pontokkal: az aktuális év és az azt megelőző három év a globális, regionális és tengeri-jég indikátorokhoz.",
    globalTemperaturesSectionTitle: "Globális Hőmérsékletek",
    globalTemperaturesSectionNote: "Globális felszíni és tengerfelszíni hőmérsékletek Jan-Dec napi összehasonlító nézetben.",
    temperatureAnomalySectionTitle: "Hőmérsékleti Anomáliák",
    temperatureAnomalySectionNote:
      "A globális és tengerfelszíni anomáliakártyák 1991-2020-as klimatológiát használnak; a napi és éves globális átlag anomália grafikonok ERA5-alapú, becsült 1850-1900-as bázist.",
    dailyGlobalTemperatureAnomalyTitle: "Napi globális átlaghőmérséklet-anomália",
    dailyGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, becsült 1850-1900 bázis)",
    annualGlobalTemperatureAnomalyTitle: "Éves globális hőmérsékleti anomália",
    annualGlobalTemperatureAnomalySubtitle: "ECMWF Climate Pulse (ERA5, becsült 1850-1900 bázis)",
    annualGlobalTemperatureAnomalyMethod: "Az elérhető napi anomáliák átlaga (az aktuális évben évközi átlag).",
    yearLabel: "Év",
    regionalTemperaturesSectionTitle: "Regionális Hőmérsékletek",
    regionalTemperaturesSectionNote:
      "Napi Jan-Dec összehasonlítás az északi félteke, Arktisz, észak-atlanti SST, déli félteke és Antarktisz hőmérsékleteivel.",
    climatologyMeanLabel: "1991-2020 átlag",
    seaIceSectionTitle: "Tengeri Jég",
    seaIceSectionNote:
      "Globális, arktiszi és antarktiszi jégkiterjedés napi pontokkal Jan-Dec összehasonlító nézetben.",
    forcingTitle: "Forcing",
    forcingNote: "Légköri forcing jelek a Mauna Loa CO2 és globális CH4 megfigyelésekből.",
    sourceTitle: "Adatforrás mód",
    sourceLive: "Élő feed",
    sourceMixed: "Vegyes élő + tartalék",
    sourceBundled: "Beépített tartalék",
    sourceLiveNote: "Minden sor távoli élő feedből töltődött be.",
    sourceMixedNote: "Egy vagy több élő feed hibás; a hiányt tartalék adatok fedik.",
    sourceBundledNote: "Minden élő feed hibás; minden grafikon tartalék adatot használ.",
    sourceCardsTitle: "Elsődleges források",
    sourceLabel: "Forrás",
    chartLatest: "Legfrissebb",
    noData: "Nincs adat",
    valueUnavailable: "Nincs érték",
    footerMode: "Mód",
    footerUpdated: "Frissítve",
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
    default:
      return {};
  }
}

function cardUnitLabel(metricKey: ClimateMetricSeries["key"], unit: string, language: Language): string {
  if (language !== "hu") return unit;
  if (SEA_ICE_KEYS.has(metricKey)) return "millió km2";
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
  const [forcingSectionOpen, setForcingSectionOpen] = useState(true);

  const t = STRINGS[language];

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
  const footerMetrics = useMemo(() => [...snapshot.indicators, ...snapshot.forcing], [snapshot.indicators, snapshot.forcing]);
  const monthlyLabels = useMemo(() => buildMonthLabels(language), [language]);
  const indicatorLines = useMemo(
    () =>
      snapshot.indicators.map((metric) => {
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

  const renderIndicatorPanel = (
    metric: ClimateMetricSeries,
    lines: Array<{ year: number; points: Array<[number, number]> }>,
    currentYear: number,
    climatology: DailyClimatologyEnvelope | null
  ) => {
    const bounds = indicatorYAxisBounds(metric.key);
    const yAxisLabel = indicatorYAxisUnitLabel(metric.key, language);

    return (
      <EChartsPanel
        key={metric.key}
        title={metricTitle(metric, language)}
        subtitle={metric.source.shortName}
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

  const sourceModeLabel =
    snapshot.sourceMode === "live"
      ? t.sourceLive
      : snapshot.sourceMode === "mixed"
        ? t.sourceMixed
        : t.sourceBundled;

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
          <article className="alert-card summary" key="annual-global-temperature-anomaly-summary">
            <span className="alert-kicker">{t.latestAnnualLabel}</span>
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
            <p>
              {t.yearLabel}: {latestAnnualGlobalMeanAnomaly.year}
            </p>
            <p>{t.annualGlobalTemperatureAnomalyMethod}</p>
            <div className="alert-meta">
              <span className="alert-meta-chip confidence-medium">
                {dailyGlobalMeanAnomalyMetric?.source.shortName ?? "ECMWF ERA5 Climate Pulse"}
              </span>
            </div>
          </article>
        ) : null}
        {headlineMetrics.map((metric) => (
          <article className="alert-card summary" key={metric.key}>
            <span className="alert-kicker">{t.latestLabel}</span>
            <h2>{metricTitle(metric, language)}</h2>
            <p className="alert-emphasis">
              {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
            </p>
            <p>
              {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
            </p>
            <div className="alert-meta">
              <span className="alert-meta-chip confidence-medium">{metric.source.shortName}</span>
            </div>
          </article>
        ))}
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
                    subtitle={t.annualGlobalTemperatureAnomalySubtitle}
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
              <div className="regional-summary-grid">
                {regionalSummaryMetrics.map((metric) => (
                  <article className="alert-card summary" key={`${metric.key}-regional-summary`}>
                    <span className="alert-kicker">{t.latestLabel}</span>
                    <h2>{metricTitle(metric, language)}</h2>
                    <p className="alert-emphasis">
                      {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
                    </p>
                    <p>
                      {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                    </p>
                    <div className="alert-meta">
                      <span className="alert-meta-chip confidence-medium">{metric.source.shortName}</span>
                    </div>
                  </article>
                ))}
              </div>
              <div className="charts-grid climate-grid">
                {regionalTemperatureLines.map(({ metric, lines, currentYear, climatology }) =>
                  renderIndicatorPanel(metric, lines, currentYear, climatology)
                )}
              </div>
            </div>

            <div className="climate-subsection">
              <div className="climate-subsection-header">
                <h3>{t.seaIceSectionTitle}</h3>
                <p>{t.seaIceSectionNote}</p>
              </div>
              <div className="regional-summary-grid">
                {seaIceSummaryMetrics.map((metric) => (
                  <article className="alert-card summary" key={`${metric.key}-sea-ice-summary`}>
                    <span className="alert-kicker">{t.latestLabel}</span>
                    <h2>{metricTitle(metric, language)}</h2>
                    <p className="alert-emphasis">
                      {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
                    </p>
                    <p>
                      {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                    </p>
                    <div className="alert-meta">
                      <span className="alert-meta-chip confidence-medium">{metric.source.shortName}</span>
                    </div>
                  </article>
                ))}
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
            <div className="regional-summary-grid">
              {snapshot.forcing.map((metric) => (
                <article className="alert-card summary" key={`${metric.key}-forcing-summary`}>
                  <span className="alert-kicker">{t.latestLabel}</span>
                  <h2>{metricTitle(metric, language)}</h2>
                  <p className="alert-emphasis">
                    {formatMetricValue(metric, language, t.valueUnavailable)} {cardUnitLabel(metric.key, metric.unit, language)}
                  </p>
                  <p>
                    {t.chartLatest}: {formatDateLabel(metric.latestDate, language)}
                  </p>
                  <div className="alert-meta">
                    <span className="alert-meta-chip confidence-medium">{metric.source.shortName}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className={`charts-grid forcing-grid ${snapshot.forcing.length === 1 ? "forcing-grid-single" : ""}`}>
              {snapshot.forcing.map((metric) => {
                const axisBounds = forcingAxisBounds(metric.key);
                return (
                  <EChartsPanel
                    key={metric.key}
                    title={metricTitle(metric, language)}
                    subtitle={metric.source.shortName}
                    option={buildForcingTrendOption({
                      points: metric.points,
                      title: metricTitle(metric, language),
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
                    })}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

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
            {footerMetrics.map((metric) => (
              <a key={`${metric.key}-footer-source`} href={metric.source.url} target="_blank" rel="noreferrer">
                {metricTitle(metric, language)} · {metric.source.shortName}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
