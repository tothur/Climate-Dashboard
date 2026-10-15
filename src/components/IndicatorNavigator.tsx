import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Climate system page navigation: one table of contents (topics → sections →
 * charts, each chart with its latest value) shown two ways:
 * - IndicatorRail: a sticky side rail on wide screens
 * - IndicatorLocator: a sticky "where am I" bar that opens a jump sheet on
 *   narrower screens
 * useIndicatorScrollSpy tracks which section and chart are in view for both.
 */

export interface IndicatorNavChart {
  /** Element id of the chart card on the page. */
  id: string;
  title: string;
  value?: string;
}

export interface IndicatorNavSection {
  /** Element id of the section on the page. */
  id: string;
  title: string;
  charts: IndicatorNavChart[];
}

export interface IndicatorNavTopic {
  key: string;
  label: string;
  /** Group heading the topic sits under (state of the climate, drivers, natural variability). */
  group?: string;
  sections: IndicatorNavSection[];
}

interface NavCopy {
  navLabel: string;
  topicsLabel: string;
  openSheet: string;
  closeSheet: string;
}

const COPY: Record<"en" | "hu", NavCopy> = {
  en: { navLabel: "Indicators contents", topicsLabel: "Topics", openSheet: "Jump to a chart", closeSheet: "Close" },
  hu: { navLabel: "Mutatók tartalomjegyzéke", topicsLabel: "Témák", openSheet: "Ugrás egy grafikonhoz", closeSheet: "Bezárás" },
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Offset below which content counts as "in view": the sticky header plus breathing room. */
function viewportTopOffset(): number {
  const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-header-height")) || 0;
  return header + 96;
}

/**
 * The section and chart currently at the top of the viewport for the active
 * topic. Recomputed on scroll (throttled to animation frames) and whenever
 * the topic's anchors change.
 */
export function useIndicatorScrollSpy(topic: IndicatorNavTopic | undefined): { sectionId: string | null; chartId: string | null } {
  const [active, setActive] = useState<{ sectionId: string | null; chartId: string | null }>({ sectionId: null, chartId: null });
  const anchors = useMemo(
    () =>
      (topic?.sections ?? []).flatMap((section) => [
        { id: section.id, sectionId: section.id, chartId: null as string | null },
        ...section.charts.map((chart) => ({ id: chart.id, sectionId: section.id, chartId: chart.id as string | null })),
      ]),
    [topic]
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const limit = viewportTopOffset();
      let current = anchors[0] ?? null;
      for (const anchor of anchors) {
        const element = document.getElementById(anchor.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= limit) current = anchor;
        else break;
      }
      // At the very bottom, the last chart may never reach the top; treat it as current.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && anchors.length) {
        current = anchors[anchors.length - 1];
      }
      setActive((previous) =>
        previous.sectionId === (current?.sectionId ?? null) && previous.chartId === (current?.chartId ?? null)
          ? previous
          : { sectionId: current?.sectionId ?? null, chartId: current?.chartId ?? null }
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [anchors]);

  return active;
}

/**
 * Jumping to a chart in another topic has to wait for that topic to render.
 * Returns a jump function and runs pending jumps once their target exists.
 */
export function useIndicatorJump(activeTopic: string, selectTopic: (key: string) => void) {
  const pending = useRef<string | null>(null);

  const scrollTo = (id: string, behavior: ScrollBehavior) => {
    const element = document.getElementById(id);
    if (!element) return false;
    element.scrollIntoView({ behavior, block: "start" });
    return true;
  };

  // A jump into another topic lands once that topic has committed. It is
  // instant: the new topic's charts change the page height as they mount,
  // which would cut a smooth scroll short. One correction follows once they
  // have settled.
  useEffect(() => {
    const id = pending.current;
    if (!id || !scrollTo(id, "auto")) return;
    pending.current = null;
    const timer = window.setTimeout(() => scrollTo(id, "auto"), 300);
    return () => window.clearTimeout(timer);
  }, [activeTopic]);

  return (topicKey: string, id: string) => {
    if (topicKey !== activeTopic) {
      pending.current = id;
      selectTopic(topicKey);
      return;
    }
    scrollTo(id, prefersReducedMotion() ? "auto" : "smooth");
  };
}

interface NavigatorProps {
  topics: IndicatorNavTopic[];
  activeTopic: string;
  active: { sectionId: string | null; chartId: string | null };
  ready: boolean;
  language: "en" | "hu";
  onSelectTopic: (key: string) => void;
  onJump: (topicKey: string, id: string) => void;
}

function TopicContents({
  topic,
  active,
  ready,
  onJump,
}: {
  topic: IndicatorNavTopic;
  active: NavigatorProps["active"];
  ready: boolean;
  onJump: (id: string) => void;
}) {
  return (
    <>
      {topic.sections.map((section) => (
        <li key={section.id} className={`indicator-nav-section${active.sectionId === section.id ? " is-current" : ""}`}>
          <button type="button" className="indicator-nav-section-title" onClick={() => onJump(section.id)}>
            {section.title}
          </button>
          <ul>
            {section.charts.map((chart) => (
              <li key={chart.id}>
                <button
                  type="button"
                  className={`indicator-nav-chart${active.chartId === chart.id ? " is-current" : ""}`}
                  aria-current={active.chartId === chart.id ? "location" : undefined}
                  title={chart.title}
                  onClick={() => onJump(chart.id)}
                >
                  <span className="indicator-nav-chart-title">{chart.title}</span>
                  {ready && chart.value ? <span className="indicator-nav-chart-value">{chart.value}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </>
  );
}

export function IndicatorRail({ topics, activeTopic, active, ready, language, onSelectTopic, onJump }: NavigatorProps) {
  const copy = COPY[language];
  return (
    <nav className="indicator-rail" aria-label={copy.navLabel}>
      <ul className="indicator-nav-topics">
        {topics.map((topic, index) => {
          const isActive = topic.key === activeTopic;
          const startsGroup = topic.group && topic.group !== topics[index - 1]?.group;
          return (
            <li
              key={topic.key}
              className={`indicator-nav-topic topic-${topic.key}${isActive ? " is-active" : ""}${startsGroup ? " starts-group" : ""}`}
            >
              {startsGroup ? <p className="indicator-nav-group">{topic.group}</p> : null}
              <button type="button" className="indicator-nav-topic-button" aria-expanded={isActive} onClick={() => onSelectTopic(topic.key)}>
                <span className="indicator-nav-topic-dot" aria-hidden="true" />
                <span>{topic.label}</span>
                <span className="indicator-nav-topic-count">{topic.sections.reduce((count, section) => count + section.charts.length, 0)}</span>
              </button>
              {isActive ? (
                <ul className="indicator-nav-sections">
                  <TopicContents topic={topic} active={active} ready={ready} onJump={(id) => onJump(topic.key, id)} />
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function IndicatorLocator({ topics, activeTopic, active, ready, language, onJump }: NavigatorProps) {
  const copy = COPY[language];
  const [open, setOpen] = useState(false);
  const [sheetTopic, setSheetTopic] = useState(activeTopic);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const topic = topics.find((entry) => entry.key === activeTopic);
  const section = topic?.sections.find((entry) => entry.id === active.sectionId) ?? topic?.sections[0];
  const shownTopic = topics.find((entry) => entry.key === sheetTopic) ?? topic;

  useEffect(() => {
    if (!open) return;
    setSheetTopic(activeTopic);
    // Lock page scroll on <html>: locking <body> would make it a scroll
    // container and unstick the site header while the sheet is open.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() =>
      sheetRef.current?.querySelector<HTMLElement>(".indicator-nav-chart.is-current, .indicator-nav-chart")?.focus({ preventScroll: true })
    );
    return () => {
      root.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
    // Runs only when the sheet opens or closes; the sheet starts on the active topic.
  }, [open]);

  const close = () => {
    setOpen(false);
    // preventScroll: focusing must not cancel the smooth scroll of a jump.
    window.requestAnimationFrame(() => toggleRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div className={`indicator-locator topic-${activeTopic}`}>
      <button
        ref={toggleRef}
        type="button"
        className="indicator-locator-bar"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={copy.openSheet}
        onClick={() => setOpen(true)}
      >
        <span className="indicator-nav-topic-dot" aria-hidden="true" />
        <span className="indicator-locator-text">
          <strong>{topic?.label}</strong>
          {section ? (
            <>
              <span aria-hidden="true"> › </span>
              {section.title}
            </>
          ) : null}
        </span>
        <span className="indicator-locator-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <>
          <div className="indicator-sheet-backdrop" onClick={close} aria-hidden="true" />
          <div ref={sheetRef} className="indicator-sheet" role="dialog" aria-modal="true" aria-label={copy.navLabel}>
            <div className="indicator-sheet-header">
              <div className="indicator-sheet-topics" role="group" aria-label={copy.topicsLabel}>
                {topics.map((entry, index) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`topic-${entry.key}${entry.group && entry.group !== topics[index - 1]?.group && index > 0 ? " starts-group" : ""}`}
                    aria-pressed={entry.key === shownTopic?.key}
                    onClick={() => setSheetTopic(entry.key)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <button type="button" className="indicator-sheet-close" aria-label={copy.closeSheet} onClick={close}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {shownTopic ? (
              <ul className="indicator-nav-sections">
                <TopicContents
                  topic={shownTopic}
                  active={shownTopic.key === activeTopic ? active : { sectionId: null, chartId: null }}
                  ready={ready}
                  onJump={(id) => {
                    close();
                    // Scroll once the sheet has closed and the page scroll lock is lifted.
                    window.requestAnimationFrame(() => onJump(shownTopic.key, id));
                  }}
                />
              </ul>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
