import React from "react";

export function StatusMessage({ children, tone = "muted" }) {
  const colors = { muted: "var(--text-secondary)", error: "var(--state-error)", success: "var(--state-success)", warning: "var(--state-warning)" };
  return (
    <p role="status" aria-live="polite" style={{ fontSize: "var(--text-sm)", color: colors[tone], height: 20, margin: 0, fontFamily: "var(--font-sans)" }}>
      {children}
    </p>
  );
}
