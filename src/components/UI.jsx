import React, { useEffect } from "react";

/* ---------------- Icons (inline SVG, stroke-based) ---------------- */
const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };

export const Icon = {
  Dashboard: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="1.5" />
      <rect x="13" y="10.5" width="7.5" height="10" rx="1.5" />
      <rect x="3.5" y="13.5" width="7.5" height="7" rx="1.5" />
    </svg>
  ),
  Checklist: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4 6l1.3 1.3L7.5 5" />
      <path d="M4 12l1.3 1.3L7.5 11" />
      <path d="M4 18l1.3 1.3L7.5 16" />
    </svg>
  ),
  Progress: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-6" />
    </svg>
  ),
  Inspection: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <path d="M4 21v-4.6L15.6 4.8a1.8 1.8 0 0 1 2.6 0l1 1a1.8 1.8 0 0 1 0 2.6L7.6 20H4Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  ),
  Ncr: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17" r="0.15" fill="currentColor" />
    </svg>
  ),
  Building: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9 7.5h1.4M13.6 7.5H15M9 11.5h1.4M13.6 11.5H15M9 15.5h1.4M13.6 15.5H15" />
      <path d="M10.5 21v-3h3v3" />
    </svg>
  ),
  Cube: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" />
      <path d="M4 8l8 4.5L20 8" />
      <path d="M12 12.5V21" />
    </svg>
  ),
  Door: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <path d="M14.3 12h.01" />
      <path d="M6 21h12" />
    </svg>
  ),
  Shield: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <path d="M12 3.5 19 6.5v5.2c0 4.4-3 7.6-7 8.8-4-1.2-7-4.4-7-8.8V6.5L12 3.5Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Worker: (p) => (
    <svg className="icon" {...iconProps} {...p}>
      <path d="M4 14.5a8 8 0 0 1 16 0Z" />
      <path d="M3 14.5h18" />
      <path d="M9.5 5.5a2.5 2.5 0 0 1 5 0" />
    </svg>
  ),
  Close: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Camera: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1-1.6A1 1 0 0 1 9.6 5h4.8a1 1 0 0 1 .9.6L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  ),
  Pin: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 13l4.5 4.5L19 8" />
    </svg>
  ),
  ChevronRight: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  Bell: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.4 5.4 1.4 5.4H4.6S6 14 6 10Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </svg>
  ),
  Trash: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5L19 7" />
    </svg>
  ),
  Download: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  ),
  Drag: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  ),
  Empty: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="34" height="34" {...p}>
      <path d="M4 19V7.5L12 3l8 4.5V19" />
      <path d="M9 19v-6h6v6" />
    </svg>
  ),
};

/* ---------------- Status badge ---------------- */
export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

/* ---------------- Category tag ---------------- */
export function CategoryTag({ category }) {
  if (!category) return null;
  return (
    <span className="cat-tag" style={{ background: category.color + "1c", color: category.color }}>
      <span className="cat-dot" style={{ background: category.color }} />
      {category.shortName}
    </span>
  );
}

/* ---------------- Stamp (approve/reject visual) ---------------- */
export function Stamp({ type }) {
  // type: 'pass' | 'fail'
  return (
    <div className="stamp-wrap">
      <div className={`stamp ${type}`}>
        {type === "pass" ? <Icon.Check width="18" height="18" /> : <Icon.Close width="16" height="16" />}
        {type === "pass" ? "승 인" : "반 려"}
      </div>
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ title, onClose, children, width }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-head">
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            <Icon.Close width="15" height="15" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ message }) {
  return (
    <div className="empty-state">
      <div className="icon">
        <Icon.Empty />
      </div>
      <div className="msg">{message}</div>
    </div>
  );
}

/* ---------------- Toast ---------------- */
export function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  if (!message) return null;
  return (
    <div className="toast">
      <Icon.Bell width="15" height="15" />
      {message}
    </div>
  );
}
