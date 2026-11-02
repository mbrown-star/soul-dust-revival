import React from "react";

export function ProgressBar({ completed, total }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div style={{ width: "100%", background: "var(--surface-fill)", borderRadius: "var(--radius-full)", height: 8 }}>
      <div style={{ width: `${pct}%`, background: "var(--surface-inverted)", height: 8, borderRadius: "var(--radius-full)", transition: "width .2s ease" }} />
    </div>
  );
}
