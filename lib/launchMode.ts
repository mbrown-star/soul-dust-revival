import { redirect } from "next/navigation";

/**
 * The pre-launch "sneak peek" site: the homepage invites visitors to try a
 * free sample of a study and a devotional, and the store (product pages,
 * cart, checkout) is closed until the full launch. Everything else -- blog,
 * login, the reader for sample lessons -- works normally.
 *
 * Set by NEXT_PUBLIC_LAUNCH_MODE=sneak_peek at BUILD time (Next inlines
 * NEXT_PUBLIC_* values into the bundle), so the production and staging
 * Workers differ by build, not by anything a request can influence. Unset
 * means the full site. lib/env.ts validates the value at boot.
 */
const SNEAK_PEEK = process.env.NEXT_PUBLIC_LAUNCH_MODE === "sneak_peek";

export function isSneakPeek(): boolean {
  return SNEAK_PEEK;
}

/**
 * For a page or layout that doesn't exist on the sneak-peek site: sends the
 * visitor home. Server-side, so a closed page can't be reached by typing its
 * URL even though nothing links to it.
 */
export function closedInSneakPeek(): void {
  if (SNEAK_PEEK) redirect("/");
}
