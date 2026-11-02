import React from "react";

export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border-default)", fontFamily: "var(--font-sans)" }}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          style={{
            padding: "8px 16px", background: "none", cursor: "pointer",
            border: "none", borderBottom: `2px solid ${active === t.value ? "var(--surface-inverted)" : "transparent"}`,
            fontWeight: active === t.value ? "var(--weight-medium)" : "var(--weight-normal)",
            color: active === t.value ? "var(--text-primary)" : "var(--text-tertiary)",
            fontSize: "var(--text-base)", marginBottom: -1,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
