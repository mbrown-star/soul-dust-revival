import React from "react";

export function Checkbox({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-primary)", cursor: "pointer" }}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} style={{ width: 16, height: 16, accentColor: "var(--surface-inverted)" }} />
      <span>{label}</span>
    </label>
  );
}
