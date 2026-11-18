"use client";

import { useEffect, useRef } from "react";

// The keyboard focus target for each role="menuitem" in the menu. Most items
// are the link/button itself; one (SiteNav's Cart row) is a wrapper around
// its own <CartLink>, so focus goes to the link inside it.
function menuItemTargets(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .map((item) => (item.matches("a, button") ? item : item.querySelector<HTMLElement>("a, button")))
    .filter((el): el is HTMLElement => el !== null && !el.matches(":disabled"));
}

/**
 * Behavior for a nav menu button + its role="menu" panel, rendered inside
 * the element this returns a ref for. Shared by the public nav (SiteNav's
 * Profile dropdown and phone menu) and the admin nav's phone menu.
 *
 * - Closes on an outside click, or when focus moves out of it (Tab past the
 *   last item).
 * - Escape closes it, returning focus to the menu button if focus was inside.
 * - WAI-ARIA menu-button keys: on the button, ArrowDown/ArrowUp open the menu
 *   on its first/last item; inside, ArrowDown/ArrowUp move between items
 *   (wrapping), Home/End jump to the first/last. Opening by tap or click
 *   doesn't move focus, so a touch user doesn't see a focus-gold item that
 *   reads like the current section.
 *
 * Takes the state setter directly (not a generic callback) so it can sit in
 * the effects' deps safely: a useState setter is stable across renders.
 */
export function useDismissibleMenu(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  // Which item to focus once the menu has rendered after a keyboard open.
  const focusOnOpen = useRef<"first" | "last" | null>(null);

  useEffect(() => {
    if (!open) return;
    const container = ref.current;

    if (container && focusOnOpen.current) {
      const items = menuItemTargets(container);
      (focusOnOpen.current === "first" ? items[0] : items[items.length - 1])?.focus();
      focusOnOpen.current = null;
    }

    function handlePointerDown(e: PointerEvent) {
      if (container && !container.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (container?.contains(document.activeElement)) {
        container.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
      }
      setOpen(false);
    }
    function handleFocusOut(e: FocusEvent) {
      // relatedTarget is null when focus goes nowhere in particular (e.g. a
      // tap on plain page text) -- the pointerdown handler covers that.
      const next = e.relatedTarget as Node | null;
      if (next && container && !container.contains(next)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    container?.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      container?.removeEventListener("focusout", handleFocusOut);
    };
  }, [open, setOpen]);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    function handleArrowKeys(e: KeyboardEvent) {
      if (!container || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const onButton = (e.target as HTMLElement).matches('[aria-haspopup="menu"]');

      if (!open) {
        if (onButton && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          focusOnOpen.current = e.key === "ArrowDown" ? "first" : "last";
          setOpen(true);
        }
        return;
      }

      const items = menuItemTargets(container);
      if (items.length === 0) return;
      e.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      let next: number;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else if (e.key === "ArrowDown") next = current === -1 ? 0 : (current + 1) % items.length;
      else next = current === -1 ? items.length - 1 : (current - 1 + items.length) % items.length;
      items[next]?.focus();
    }

    container.addEventListener("keydown", handleArrowKeys);
    return () => container.removeEventListener("keydown", handleArrowKeys);
  }, [open, setOpen]);

  return ref;
}
