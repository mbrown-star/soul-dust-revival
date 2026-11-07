/**
 * Validates a user-supplied `next` redirect target is a same-origin,
 * relative path before it's ever passed to next/navigation's `redirect()`.
 *
 * Found and fixed during the 2026-11-11 build (not in the original audit):
 * login/page.tsx and signup/page.tsx started calling `redirect(nextHref)`
 * directly with an attacker-controlled `?next=` query param when adding the
 * already-authenticated-visitor redirect (qa/findings/FINDINGS_2026-11-07.md
 * #7) -- unlike app/auth/callback/route.ts's existing, safe
 * `NextResponse.redirect(`${origin}${next}`)` pattern (string-concatenated
 * with the real origin first, so even a protocol-relative "//evil.com"
 * resolves as a same-origin path), a raw `redirect("https://evil.com")` is
 * honored by Next.js verbatim -- a genuine open redirect, letting a crafted
 * link silently send an already-logged-in visitor to an attacker's site
 * from what looks like this app's own domain.
 *
 * Only a leading single "/" (not "//", not "/\" -- both of which some
 * browsers still treat as protocol-relative) with no "://" anywhere in the
 * value is accepted; anything else falls back to the given default.
 */
export function safeRedirectPath(next: string | undefined, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.includes("://")) return fallback;
  return next;
}
