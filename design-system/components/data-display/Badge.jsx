import React from "react";

export function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { color: "var(--text-tertiary)" },
    success: { color: "var(--state-success)" },
    warning: { color: "var(--state-warning)" },
    error: { color: "var(--state-error)" },
  };
  return <span style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)", ...tones[tone] }}>{children}</span>;
}
