interface PanelExpandButtonProps {
  expanded: boolean;
  expandLabel: string;
  collapseLabel: string;
  onToggle: () => void;
}

/** Full-screen toggle shared by chart and map panels: quiet icon at rest, label on hover/focus, clear exit state. */
export function PanelExpandButton({ expanded, expandLabel, collapseLabel, onToggle }: PanelExpandButtonProps) {
  const label = expanded ? collapseLabel : expandLabel;
  return (
    <button
      type="button"
      className={`panel-expand-control${expanded ? " is-expanded" : ""}`}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={expanded}
      title={expanded ? `${collapseLabel} (Esc)` : expandLabel}
    >
      <svg className="panel-expand-icon" viewBox="0 0 24 24" aria-hidden="true">
        {expanded ? (
          <path d="M4 14h6v6M20 10h-6V4M14 10l6.5-6.5M3.5 20.5 10 14" />
        ) : (
          <path d="M15 3.5h5.5V9M9 20.5H3.5V15M20.5 3.5 14 10M3.5 20.5 10 14" />
        )}
      </svg>
      <span className="panel-expand-label">{label}</span>
      {expanded ? <kbd className="panel-expand-kbd">Esc</kbd> : null}
    </button>
  );
}
