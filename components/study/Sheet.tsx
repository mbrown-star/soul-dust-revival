"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { keepTabInside } from "@/lib/ui/focusTrap";

/**
 * Shared bottom-sheet/modal chrome (backdrop, dialog, close button) used by
 * both GreekSheet and WeekPickerSheet, so the two don't duplicate the same
 * fixed-position/backdrop/close-button markup. Behaves as a modal dialog
 * for the keyboard: focus moves to its close button when it opens, Tab stays
 * inside it, Escape closes it, and focus goes back to whatever opened it.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else keepTabInside(e, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50" tabIndex={-1} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // REAL FIX (qa/findings/FINDINGS_2026-11-07.md, device-format
        // section): on mobile this sheet is anchored to the bottom edge
        // (items-end above) with no accommodation for a real phone's home-
        // indicator/gesture-nav safe area, which sits in that same strip of
        // screen -- the last action button could end up flush against (or
        // obscured by) it. pb-6 stays the baseline on larger screens where
        // the sheet is centered, not edge-anchored.
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-3"
      >
        <button
          ref={closeRef}
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
