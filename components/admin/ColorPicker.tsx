"use client";

import { useId } from "react";

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const swatchId = useId();
  const hexId = useId();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={swatchId} className="sr-only">Background color swatch</label>
      <input
        id={swatchId}
        type="color"
        value={value || "#fef3c7"}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 border rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-ink"
      />
      <label htmlFor={hexId} className="sr-only">Background color hex value</label>
      <input
        id={hexId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#fef3c7"
        className="border rounded-lg p-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-ink"
      />
    </div>
  );
}
