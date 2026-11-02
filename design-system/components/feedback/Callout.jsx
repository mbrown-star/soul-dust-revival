import React from "react";

export function Callout({ title, color = "#fef3c7", children }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", padding: 20, background: color }}>
      {title && <p style={{ fontWeight: "var(--weight-semibold)", marginBottom: 8, marginTop: 0, fontFamily: "var(--font-sans)", color: "var(--text-primary)" }}>{title}</p>}
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", lineHeight: "var(--leading-base)", color: "var(--text-primary)" }}>{children}</div>
    </div>
  );
}
