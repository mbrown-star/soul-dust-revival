export type LessonStatus = "not_started" | "in_progress" | "completed";

/**
 * Returns whether the save actually succeeded. `fetch` only rejects on a
 * genuine network failure -- a non-2xx response (401 from a stale session,
 * 403 from an entitlement check, a validation error) resolves normally, so
 * checking only for a thrown exception would let a real server-side failure
 * look identical to success: a caller could optimistically update its own
 * display state while the write silently never happened.
 */
export async function postLessonProgress(lessonId: string, status: LessonStatus): Promise<boolean> {
  try {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * A lesson page's "mark in progress" ping (fired once on first mount) and a
 * later real-completion write (a "mark complete" button, a devotional's
 * WalkedToggle, a Study week's Lift Up tab) are independent requests with no
 * inherent ordering between two separate component instances -- if the ping
 * happens to resolve *after* the completion write reaches the server, it
 * would silently overwrite "completed" back to "in_progress". Tracking the
 * in-flight ping here (module scope, since the components involved don't
 * share React state) lets a completion write wait for it first, so the two
 * can never land out of order. See CLAUDE.md's 2026-11-09 entry for the real
 * duplicate-row incident this already caused once.
 */
export const pendingLessonProgressPings = new Map<string, Promise<boolean>>();
