/**
 * A tiny module-level registry of in-flight save promises, keyed by an
 * arbitrary id, so something about to navigate (or write to the same
 * resource) can explicitly wait for a save already underway instead of
 * racing it -- a stronger guarantee than `fetch(..., { keepalive: true })`
 * alone, which only promises the *browser* won't cancel the request, not
 * that anything in the app actually waits to confirm it landed.
 *
 * Generalizes the pattern components/study/LessonNavigation.tsx already
 * built for its own two lesson_progress writes (`inFlightPings`, module-
 * scoped since its "mark in progress" and "mark complete" instances don't
 * share React state) into something any future autosave component can reuse
 * without re-inventing it.
 *
 * Deliberately NOT wired into every navigation trigger in this app as part
 * of the 2026-11-11 fix for QuestionBlock.tsx's save-on-navigate bug --
 * `keepalive: true` is the right-sized fix for THAT bug specifically (a
 * small text payload, always well under keepalive's size/time budget,
 * where "the browser keeps sending it after navigation" is a complete
 * guarantee). Reaching for an explicit "wait for every pending save before
 * every navigation" architecture across the whole app would mean touching
 * every <Link> that could navigate away from a page containing an autosave
 * field (devotional day navigation, lesson-to-lesson navigation, and
 * whatever's added later) -- real surface area for new bugs, for a
 * guarantee keepalive doesn't actually need here. Use this instead of (or
 * alongside) keepalive when a future autosave genuinely can't rely on
 * keepalive alone -- a payload that could exceed its ~64KB/browser-specific
 * time budget, or a save whose caller needs to *know* it landed before
 * doing something else (not just "the browser will still try").
 */
const pendingSaves = new Map<string, Promise<unknown>>();

/** Registers a save as in-flight under `key`; auto-removes itself once it settles. */
export function trackPendingSave(key: string, promise: Promise<unknown>): void {
  pendingSaves.set(key, promise);
  // .catch() after .finally() -- .finally() re-throws the original
  // rejection by design (it's bookkeeping only, not meant to swallow
  // anything), which would otherwise surface as an unhandled rejection
  // here even though the real caller already handles it via
  // awaitPendingSave's own .catch().
  promise
    .finally(() => {
      if (pendingSaves.get(key) === promise) pendingSaves.delete(key);
    })
    .catch(() => {});
}

/** Resolves once any save currently tracked under `key` has settled (success or failure). */
export async function awaitPendingSave(key: string): Promise<void> {
  const pending = pendingSaves.get(key);
  if (pending) await pending.catch(() => {});
}
