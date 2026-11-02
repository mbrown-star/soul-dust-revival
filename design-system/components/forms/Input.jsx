import React from "react";

const fieldBase = {
  width: "100%", boxSizing: "border-box", border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)", padding: "12px", fontSize: "var(--text-base)",
  fontFamily: "var(--font-sans)", color: "var(--text-primary)", background: "var(--surface-page)",
};

export function Input({ label, id, required, type = "text", value, onChange, placeholder, error, hint }) {
  return (
    <div>
      {label && <label htmlFor={id} style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", marginBottom: 4 }}>{label}{required && <span style={{ color: "var(--state-error)" }} aria-hidden="true"> *</span>}</label>}
      <input
        id={id} type={type} required={required} value={value} placeholder={placeholder}
        onChange={onChange} aria-invalid={!!error}
        style={{ ...fieldBase, ...(error ? { borderColor: "var(--state-error)" } : {}) }}
        onFocus={(e) => { e.target.style.outline = "2px solid var(--focus-ring)"; e.target.style.outlineOffset = "2px"; }}
        onBlur={(e) => { e.target.style.outline = "none"; }}
      />
      {hint && !error && <p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", marginTop: 4 }}>{hint}</p>}
      {error && <p role="alert" style={{ fontSize: "var(--text-sm)", color: "var(--state-error)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}

export function Textarea({ label, id, required, rows = 4, value, onChange, placeholder }) {
  return (
    <div>
      {label && <label htmlFor={id} style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", marginBottom: 4 }}>{label}</label>}
      <textarea
        id={id} required={required} rows={rows} value={value} placeholder={placeholder} onChange={onChange}
        style={{ ...fieldBase, resize: "vertical", fontFamily: "var(--font-sans)" }}
        onFocus={(e) => { e.target.style.outline = "2px solid var(--focus-ring)"; e.target.style.outlineOffset = "2px"; }}
        onBlur={(e) => { e.target.style.outline = "none"; }}
      />
    </div>
  );
}
