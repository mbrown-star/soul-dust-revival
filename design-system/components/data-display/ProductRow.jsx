import React from "react";

export function ProductRow({ imageUrl, title, meta, href, onClick }) {
  const Wrap = href ? "a" : "div";
  return (
    <Wrap href={href} onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, textDecoration: "none", color: "inherit", fontFamily: "var(--font-sans)", cursor: href || onClick ? "pointer" : "default" }}
      onMouseEnter={(e) => { if (href || onClick) e.currentTarget.style.background = "var(--surface-sunken)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
      ) : (
        <div style={{ width: 48, height: 48, background: "var(--surface-fill)", borderRadius: "var(--radius-sm)" }} />
      )}
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: "var(--weight-medium)", fontSize: "var(--text-base)", color: "var(--text-primary)" }}>{title}</p>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{meta}</p>
      </div>
    </Wrap>
  );
}
