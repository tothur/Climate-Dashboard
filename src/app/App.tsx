import { useEffect, useMemo, useState } from "react";
import { buildDashboardSnapshot, createBundledDataSource } from "../data/adapter";
import type { DashboardDataSource, Language, ResolvedTheme, ThemeMode, ClimateMetricSeries, DailyPoint } from "../domain/model";
import { loadRuntimeDataSource } from "../data/runtime-source";
import { buildClimateMonthlyComparisonOption } from "../charts/iliTrend";
import { buildForcingTrendOption } from "../charts/historicalTrend";
import { EChartsPanel } from "../components/EChartsPanel";

const STORAGE_LANG_KEY = "climate-dashboard-lang";
const STORAGE_THEME_KEY = "climate-dashboard-theme";
const REFERENCE_LEAP_YEAR = 2024;
const REFERENCE_LEAP_YEAR_START_UTC = Date.UTC(REFERENCE_LEAP_YEAR, 0, 1);
const EARTH_LOGO_URL = `${import.meta.env.BASE_URL}earth-logo.svg`;

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
    latestSignalsAria: "Latest climate indicators",
    climateIndicatorsTitle: "Climate Indicators",
    climateIndicatorsNote:
      "Monthly Jan-Dec view with daily points: current year plus the previous three years for global surface temperature, sea surface temperature, and total sea ice extent.",
    forcingTitle: "Forcing",
    forcingNote: "Atmospheric forcing signal from daily Mauna Loa CO2 observations.",
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
    latestSignalsAria: "Legfrissebb klíma indikátorok",
    climateIndicatorsTitle: "Éghajlati Indikátorok",
    climateIndicatorsNote:
      "Havi Jan-Dec nézet napi pontokkal: az aktuális év és az azt megelőző három év a globális felszíni hőmérséklethez, tengerfelszíni hőmérséklethez és teljes tengeri jégkiterjedéshez.",
    forcingTitle: "Forcing",
    forcingNote: "Légköri forcing jel a Mauna Loa napi CO2 méréseiből.",
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
  const keyMetrics = useMemo(() => [...snapshot.indicators, ...snapshot.forcing], [snapshot.indicators, snapshot.forcing]);
  const monthlyLabels = useMemo(() => buildMonthLabels(language), [language]);
  const indicatorLines = useMemo(
    () =>
      snapshot.indicators.map((metric) => {
        const years = pickComparisonYears(metric.points);
        const currentYear = years[years.length - 1];
        return {
          metric,
          currentYear,
          lines: buildMonthlyYearLines(metric.points, years),
        };
      }),
    [snapshot.indicators]
  );

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
        {keyMetrics.map((metric) => (
          <article className="alert-card summary" key={metric.key}>
            <span className="alert-kicker">{t.latestLabel}</span>
            <h2>{metricTitle(metric, language)}</h2>
            <p className="alert-emphasis">
              {formatMetricValue(metric, language, t.valueUnavailable)} {metric.unit}
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
            <div className="charts-grid climate-grid">
              {indicatorLines.map(({ metric, lines, currentYear }) => (
                <EChartsPanel
                  key={metric.key}
                  title={metricTitle(metric, language)}
                  subtitle={metric.source.shortName}
                  option={buildClimateMonthlyComparisonOption({
                    monthLabels: monthlyLabels,
                    lines,
                    unit: metric.unit,
                    decimals: metric.decimals,
                    yAxisMin:
                      metric.key === "global_surface_temperature"
                        ? 10
                        : metric.key === "global_sea_surface_temperature"
                          ? 19.5
                          : metric.key === "global_sea_ice_extent"
                            ? 10
                            : undefined,
                    yAxisMax:
                      metric.key === "global_surface_temperature"
                        ? 18
                        : metric.key === "global_sea_surface_temperature"
                          ? 21.5
                          : metric.key === "global_sea_ice_extent"
                            ? 30
                            : undefined,
                    compact,
                    dark: resolvedTheme === "dark",
                    yearColors: buildIndicatorYearColors(currentYear, resolvedTheme === "dark"),
                    labels: {
                      noData: t.noData,
                    },
                  })}
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
            <div className="charts-grid forcing-grid">
              {snapshot.forcing.map((metric) => (
                <EChartsPanel
                  key={metric.key}
                  title={metricTitle(metric, language)}
                  subtitle={metric.source.shortName}
                  option={buildForcingTrendOption({
                    points: metric.points,
                    title: metricTitle(metric, language),
                    unit: metric.unit,
                    decimals: metric.decimals,
                    compact,
                    dark: resolvedTheme === "dark",
                    labels: {
                      noData: t.noData,
                      latest: t.chartLatest,
                    },
                  })}
                />
              ))}
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
            {keyMetrics.map((metric) => (
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
