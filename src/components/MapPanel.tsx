import { useEffect, useRef, useState } from "react";

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
}: MapPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFallbackExpanded, setIsFallbackExpanded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const expandText = expandLabel ?? "Full screen";
  const collapseText = collapseLabel ?? "Exit full screen";
  const expanded = isFullscreen || isFallbackExpanded;
  const missingImageText = noImageLabel ?? "Map unavailable";
  const imageCandidates = [imageUrl, ...(fallbackImageUrls ?? [])].filter(
    (candidate, index, list) => candidate.trim().length > 0 && list.indexOf(candidate) === index
  );
  const activeImageUrl = imageCandidates[Math.min(activeImageIndex, Math.max(0, imageCandidates.length - 1))] ?? "";

  useEffect(() => {
    setHasError(false);
    setActiveImageIndex(0);
  }, [imageUrl, fallbackImageUrls]);

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
    <article className={`panel map-panel ${isFallbackExpanded ? "panel-expanded" : ""}`} ref={panelRef}>
      <header className="panel-header">
        <div className="panel-header-main">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="panel-header-actions">
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
      <div className="map-panel-image-wrap">
        {hasError ? (
          <div className="map-panel-empty">{missingImageText}</div>
        ) : (
          <img
            className="map-panel-image"
            src={activeImageUrl}
            alt={imageAlt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              if (activeImageIndex + 1 < imageCandidates.length) {
                setActiveImageIndex((currentIndex) => currentIndex + 1);
                return;
              }
              setHasError(true);
            }}
          />
        )}
      </div>
      {freshnessLabel ? (
        <div className="panel-chart-footer">
          <span className={`panel-freshness-chip ${freshnessTone}`}>{freshnessLabel}</span>
        </div>
      ) : null}
    </article>
  );
}
