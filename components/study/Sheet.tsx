"use client";

import type { ReactNode } from "react";

/**
 * Shared bottom-sheet/modal chrome (backdrop, dialog, close button) used by
 * both GreekSheet and WeekPickerSheet, so the two don't duplicate the same
 * fixed-position/backdrop/close-button markup.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto p-6 space-y-3"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center text-moss text-lg"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
