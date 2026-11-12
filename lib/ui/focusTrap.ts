/**
 * Keeps Tab and Shift+Tab inside an open modal dialog: from its last
 * focusable element Tab goes back to the first, and from the first
 * Shift+Tab goes to the last. Call from the dialog's keydown handler.
 * Returns true when it moved focus.
 */
export function keepTabInside(e: KeyboardEvent, container: HTMLElement | null): boolean {
  if (e.key !== "Tab" || !container) return false;
  const items = [
    ...container.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])"),
  ].filter((el) => !el.hasAttribute("disabled") && el.getAttribute("tabindex") !== "-1" && el.getClientRects().length > 0);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return false;
  const active = document.activeElement;
  // Focus outside the dialog (e.g. the page behind it) comes back in.
  if (!container.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return true;
  }
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
