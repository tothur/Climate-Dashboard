import { useEffect, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { init, use, type EChartsType } from "echarts/core";
import { LineChart, BarChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, MarkLineComponent, MarkAreaComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

use([LineChart, BarChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

interface EChartsPanelProps {
  title: string;
  subtitle?: string;
  option: EChartsOption;
  expandLabel?: string;
  collapseLabel?: string;
}

export function EChartsPanel({ title, subtitle, option, expandLabel, collapseLabel }: EChartsPanelProps) {
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

  return (
    <article className={`panel ${isFallbackExpanded ? "panel-expanded" : ""}`} ref={panelRef}>
      <header className="panel-header">
        <div className="panel-header-main">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button
          type="button"
          className="panel-expand-btn"
          onClick={() => {
            void toggleExpanded();
          }}
          aria-label={expanded ? collapseText : expandText}
          title={expanded ? collapseText : expandText}
        >
          {expanded ? collapseText : expandText}
        </button>
      </header>
      <div className="panel-chart" ref={containerRef} />
    </article>
  );
}
