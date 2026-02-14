import { useEffect, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { init, use, type EChartsType } from "echarts/core";
import { LineChart, BarChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, MarkLineComponent, MarkAreaComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

use([LineChart, BarChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

type FreshnessTone = "fresh" | "warning" | "stale";

interface EChartsPanelProps {
  title: string;
  subtitle?: string;
  option: EChartsOption;
  expandLabel?: string;
  collapseLabel?: string;
  exportPngLabel?: string;
  exportCsvLabel?: string;
  freshnessLabel?: string;
  freshnessTone?: FreshnessTone;
}

function safeFileBase(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length ? normalized : "chart";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function buildCsvFromOption(option: EChartsOption): string {
  const seriesRaw = (option as { series?: unknown }).series;
  const seriesList = Array.isArray(seriesRaw) ? seriesRaw : seriesRaw ? [seriesRaw] : [];
  const xAxisRaw = (option as { xAxis?: unknown }).xAxis;
  const xAxisFirst = Array.isArray(xAxisRaw) ? xAxisRaw[0] : xAxisRaw;
  const xAxisData =
    xAxisFirst && typeof xAxisFirst === "object" && Array.isArray((xAxisFirst as { data?: unknown[] }).data)
      ? ((xAxisFirst as { data: unknown[] }).data ?? [])
      : [];

  const rows: string[] = ["series,x,y"];

  for (let seriesIndex = 0; seriesIndex < seriesList.length; seriesIndex += 1) {
    const series = seriesList[seriesIndex] as { name?: unknown; data?: unknown };
    const name = typeof series.name === "string" && series.name.trim().length ? series.name : `Series ${seriesIndex + 1}`;
    if (!Array.isArray(series.data)) continue;

    for (let dataIndex = 0; dataIndex < series.data.length; dataIndex += 1) {
      const point = series.data[dataIndex] as unknown;
      let xValue: unknown = xAxisData[dataIndex] ?? dataIndex;
      let yValue: unknown = "";

      if (Array.isArray(point)) {
        if (point.length >= 2) {
          xValue = point[0];
          yValue = point[1];
        } else if (point.length === 1) {
          yValue = point[0];
        }
      } else if (point && typeof point === "object") {
        const value = (point as { value?: unknown }).value;
        if (Array.isArray(value)) {
          xValue = value[0];
          yValue = value[1];
        } else {
          yValue = value ?? (point as { y?: unknown }).y ?? "";
          xValue = (point as { x?: unknown }).x ?? xValue;
        }
      } else {
        yValue = point;
      }

      if (yValue == null || (typeof yValue === "string" && yValue.trim() === "")) {
        continue;
      }

      rows.push([csvEscape(name), csvEscape(xValue), csvEscape(yValue)].join(","));
    }
  }

  return rows.join("\n");
}

export function EChartsPanel({
  title,
  subtitle,
  option,
  expandLabel,
  collapseLabel,
  exportPngLabel,
  exportCsvLabel,
  freshnessLabel,
  freshnessTone = "fresh",
}: EChartsPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFallbackExpanded, setIsFallbackExpanded] = useState(false);

  const expandText = expandLabel ?? "Full screen";
  const collapseText = collapseLabel ?? "Exit full screen";
  const exportPngText = exportPngLabel ?? "Export PNG";
  const exportCsvText = exportCsvLabel ?? "Export CSV";
  const expanded = isFullscreen || isFallbackExpanded;
  const fileBase = `${safeFileBase(title)}-${new Date().toISOString().slice(0, 10)}`;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    if (!chartRef.current) {
      chartRef.current = init(node, undefined, { renderer: "canvas" });
    }

    chartRef.current.setOption(option, { notMerge: true, lazyUpdate: true });
    chartRef.current.resize();

    const resize = () => chartRef.current?.resize();
    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => resize());
      observer.observe(node);
    } else {
      window.addEventListener("resize", resize);
    }

    return () => {
      if (observer) {
        observer.disconnect();
        return;
      }
      window.removeEventListener("resize", resize);
    };
  }, [option]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleFullscreenChange = () => {
      const panel = panelRef.current;
      const active = panel != null && document.fullscreenElement === panel;
      setIsFullscreen(active);
      chartRef.current?.resize();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isFallbackExpanded) {
      document.body.classList.remove("panel-expanded-lock");
      return;
    }

    document.body.classList.add("panel-expanded-lock");
    chartRef.current?.resize();
    return () => {
      document.body.classList.remove("panel-expanded-lock");
    };
  }, [isFallbackExpanded]);

  const toggleExpanded = async () => {
    const panel = panelRef.current;
    if (!panel || typeof document === "undefined") return;

    const fullscreenActive = document.fullscreenElement === panel;
    if (fullscreenActive) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
      return;
    }

    const canUseFullscreen = typeof panel.requestFullscreen === "function" && document.fullscreenEnabled;
    if (canUseFullscreen) {
      try {
        await panel.requestFullscreen();
        return;
      } catch {
        // Fall back to fixed-position expanded mode if fullscreen is blocked.
      }
    }

    setIsFallbackExpanded((open) => !open);
  };

  const exportPng = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const dataUrl = chart.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
    downloadDataUrl(dataUrl, `${fileBase}.png`);
  };

  const exportCsv = () => {
    const csv = buildCsvFromOption(option);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `${fileBase}.csv`);
  };

  return (
    <article className={`panel ${isFallbackExpanded ? "panel-expanded" : ""}`} ref={panelRef}>
      <header className="panel-header">
        <div className="panel-header-main">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="panel-header-actions">
          {freshnessLabel ? <span className={`panel-freshness-chip ${freshnessTone}`}>{freshnessLabel}</span> : null}
          <button type="button" className="panel-action-btn" aria-label={exportPngText} title={exportPngText} onClick={exportPng}>
            <svg className="panel-action-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 17v2h14v-2" />
            </svg>
          </button>
          <button type="button" className="panel-action-btn" aria-label={exportCsvText} title={exportCsvText} onClick={exportCsv}>
            <svg className="panel-action-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16M8 4v16M16 4v16" />
            </svg>
          </button>
          <button
            type="button"
            className="panel-action-btn panel-expand-btn"
            onClick={() => {
              void toggleExpanded();
            }}
            aria-label={expanded ? collapseText : expandText}
            title={expanded ? collapseText : expandText}
          >
            {expanded ? (
              <svg className="panel-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 4v6H4M14 4v6h6M20 14h-6v6M4 14h6v6" />
              </svg>
            ) : (
              <svg className="panel-action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 10V4h6M14 4h6v6M20 14v6h-6M10 20H4v-6" />
              </svg>
            )}
          </button>
        </div>
      </header>
      <div className="panel-chart" ref={containerRef} />
    </article>
  );
}
