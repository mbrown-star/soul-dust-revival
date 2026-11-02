import React from "react";

export function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="color" value={value || "#fef3c7"} onChange={(e) => onChange(e.target.value)} aria-label="Background color swatch" style={{ width: 40, height: 40, border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", cursor: "pointer", padding: 0 }} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#fef3c7" aria-label="Background color hex value" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: "var(--text-sm)", width: 112, fontFamily: "var(--font-mono)" }} />
    </div>
  );
}
