"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/**
 * A "+ Add X" button that opens a small dropdown of creation links, used
 * where the admin products/studies list pages now offer "New bundle"
 * alongside their existing plain create link. Same WAI-ARIA menu-button
 * semantics as AddBlockButton.tsx (aria-haspopup/aria-expanded,
 * role="menu"/"menuitem", Escape closes and returns focus to the trigger) —
 * these are navigation links, not in-place actions, so each item is a real
 * `<Link>` rather than a button with an onClick.
 */
export function CreateMenu({
  label,
  items,
}: {
  label: string;
  items: { label: string; href: string }[];
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="inline-flex items-center gap-1.5 bg-ink text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2"
      >
        {label}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 z-10 mt-1 w-48 bg-white border rounded-lg shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block w-full text-left px-4 py-2 hover:bg-moss/5 focus:outline-none focus:bg-moss/5 focus:ring-2 focus:ring-inset focus:ring-ink"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
