/**
 * A sensible starting alt text for a cover image, auto-filled once a cover
 * PDF upload completes (the admin can still edit it freely afterward --
 * callers only apply this when the relevant alt field is still empty, so a
 * later re-upload never silently overwrites something the admin already
 * typed). Falls back to just "{side} cover" if the title hasn't been filled
 * in yet, rather than producing a stray leading separator.
 */
export function defaultCoverAltText(title: string, side: "Front" | "Back"): string {
  const trimmedTitle = title.trim();
  return trimmedTitle ? `${trimmedTitle} — ${side} cover` : `${side} cover`;
}
