import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EChartsOption } from "echarts";
import { init, use, type EChartsType } from "echarts/core";
import { LineChart, BarChart, ScatterChart, CustomChart, GaugeChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, MarkLineComponent, MarkAreaComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { PanelExpandButton } from "./PanelExpandButton";

use([LineChart, BarChart, ScatterChart, CustomChart, GaugeChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

type FreshnessTone = "fresh" | "warning" | "stale";

interface EChartsPanelProps {
  title: string;
  subtitle?: string;
  /** Replaces the subtitle line with custom content, e.g. a dated status line. */
  meta?: ReactNode;
  showExpand?: boolean;
  option: EChartsOption;
  expandLabel?: string;
  collapseLabel?: string;
  freshnessLabel?: string;
  freshnessTone?: FreshnessTone;
}

export function EChartsPanel({
  title,
  subtitle,
  meta,
  showExpand = true,
  option,
  expandLabel,
  collapseLabel,
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
  const expanded = isFullscreen || isFallbackExpanded;

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFallbackExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
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

  return (
    <article className={`panel ${isFallbackExpanded ? "panel-expanded" : ""}`} ref={panelRef}>
      <header className="panel-header">
        <div className="panel-header-main">
          <h2>{title}</h2>
          {meta ?? (subtitle ? <p>{subtitle}</p> : null)}
        </div>
        {showExpand ? (
          <div className="panel-header-actions">
            <PanelExpandButton
              expanded={expanded}
              expandLabel={expandText}
              collapseLabel={collapseText}
              onToggle={() => {
                void toggleExpanded();
              }}
            />
          </div>
        ) : null}
      </header>
      <div className="panel-chart-wrap">
        <div className="panel-chart" ref={containerRef} />
      </div>
      {freshnessLabel ? (
        <div className="panel-chart-footer">
          <span className={`panel-freshness-chip ${freshnessTone}`}>{freshnessLabel}</span>
        </div>
      ) : null}
    </article>
  );
}
