import React from "react";

export function Button({ children, variant = "primary", size = "md", disabled = false, onClick, type = "button" }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontFamily: "var(--font-sans)", fontWeight: "var(--weight-medium)", cursor: disabled ? "default" : "pointer",
    borderRadius: "var(--radius-md)", border: "1px solid transparent", transition: "opacity .15s ease",
    opacity: disabled ? 0.5 : 1,
  };
  const sizes = {
    md: { padding: "12px 24px", fontSize: "var(--text-base)" },
    sm: { padding: "8px 16px", fontSize: "var(--text-sm)" },
  };
  const variants = {
    primary: { background: "var(--surface-inverted)", color: "var(--text-inverted)" },
    secondary: { background: "var(--surface-page)", color: "var(--text-primary)", borderColor: "var(--border-default)" },
    ghost: { background: "transparent", color: "var(--text-secondary)" },
    danger: { background: "var(--surface-page)", color: "var(--state-error)", borderColor: "var(--border-default)" },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...sizes[size], ...variants[variant] }}
      onFocus={(e) => { e.target.style.outline = `var(--focus-ring-width) solid var(--focus-ring)`; e.target.style.outlineOffset = "var(--focus-ring-offset)"; }}
      onBlur={(e) => { e.target.style.outline = "none"; }}
    >
      {children}
    </button>
  );
}
