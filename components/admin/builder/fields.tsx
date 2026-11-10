"use client";

import { useId } from "react";

export const inputClass =
  "w-full border border-moss/20 rounded-lg p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink aria-[invalid=true]:border-error";

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-moss uppercase tracking-wide mb-1">
      {label}
      {required && (
        <>
          <span aria-hidden="true" className="text-error">
            {" "}
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-error mt-1">
      {message}
    </p>
  );
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  required,
  error,
  multiline = false,
  rows = 3,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  required?: boolean;
  error?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  type?: "text" | "url";
  hint?: string;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  const shared = {
    id,
    value,
    placeholder,
    onBlur,
    "aria-invalid": !!error,
    "aria-describedby": describedBy,
    className: inputClass,
  };
  return (
    <div>
      <FieldLabel htmlFor={id} label={label} required={required} />
      {multiline ? (
        <textarea {...shared} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...shared} type={type} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-moss mt-1">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} label={label} />
      <input
        id={id}
        type="number"
        min={1}
        className={inputClass}
        value={value}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: readonly V[];
  onChange: (value: V) => void;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} label={label} />
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
