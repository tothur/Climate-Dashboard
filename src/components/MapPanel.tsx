import { useEffect, useRef, useState } from "react";
import { ClimateMapImage } from "./ClimateMapImage";
import { PanelExpandButton } from "./PanelExpandButton";

type FreshnessTone = "fresh" | "warning" | "stale";

interface MapPanelProps {
  title: string;
  subtitle?: string;
  imageUrl: string;
  fallbackImageUrls?: string[];
  imageAlt: string;
  noImageLabel?: string;
  expandLabel?: string;
  collapseLabel?: string;
  freshnessLabel?: string;
  freshnessTone?: FreshnessTone;
  scaleStartLabel?: string;
  scaleEndLabel?: string;
  scaleTicks?: string[];
  loading?: boolean;
}

export function MapPanel({
  title,
  subtitle,
  imageUrl,
  fallbackImageUrls,
  imageAlt,
  noImageLabel,
  expandLabel,
  collapseLabel,
  freshnessLabel,
  freshnessTone = "fresh",
  scaleStartLabel,
  scaleEndLabel,
  scaleTicks,
  loading,
}: MapPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFallbackExpanded, setIsFallbackExpanded] = useState(false);
  const expandText = expandLabel ?? "Full screen";
  const collapseText = collapseLabel ?? "Exit full screen";
  const expanded = isFullscreen || isFallbackExpanded;
  const missingImageText = noImageLabel ?? "Map unavailable";
  const imageCandidates = [imageUrl, ...(fallbackImageUrls ?? [])];

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleFullscreenChange = () => {
      const panel = panelRef.current;
      const active = panel != null && document.fullscreenElement === panel;
      setIsFullscreen(active);
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFallbackExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("panel-expanded-lock");
      document.removeEventListener("keydown", handleKeyDown);
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
    <article className={`panel map-panel ${isFallbackExpanded ? "panel-expanded" : ""}`} ref={panelRef}>
      <header className="panel-header">
        <div className="panel-header-main">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
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
      </header>
      <div className="map-panel-image-wrap">
        <ClimateMapImage
          imageUrls={imageCandidates}
          loading={loading}
          alt={imageAlt}
          noImageLabel={missingImageText}
          scaleStartLabel={scaleStartLabel}
          scaleEndLabel={scaleEndLabel}
          scaleTicks={scaleTicks}
        />
      </div>
      {freshnessLabel ? (
        <div className="panel-chart-footer">
          <span className={`panel-freshness-chip ${freshnessTone}`}>{freshnessLabel}</span>
        </div>
      ) : null}
    </article>
  );
}
