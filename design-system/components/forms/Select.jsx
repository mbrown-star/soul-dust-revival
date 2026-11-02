import React from "react";

export function Select({ label, id, value, onChange, options, hint }) {
  return (
    <div>
      {label && <label htmlFor={id} style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", marginBottom: 4 }}>{label}</label>}
      <select
        id={id} value={value} onChange={onChange}
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "12px", fontSize: "var(--text-base)", fontFamily: "var(--font-sans)", color: "var(--text-primary)", background: "var(--surface-page)" }}
        onFocus={(e) => { e.target.style.outline = "2px solid var(--focus-ring)"; e.target.style.outlineOffset = "2px"; }}
        onBlur={(e) => { e.target.style.outline = "none"; }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", marginTop: 4 }}>{hint}</p>}
    </div>
  );
}
