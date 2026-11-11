# 04. My Library and entitlements

**Roles covered:** guest, user, leader (admin has no special My Library behavior — not covered separately)
**Fixtures used:** `qa-digital-study-not-started`, `qa-devotional-in-progress`, `qa-study-completed`, `qa-bundle-both-formats`/`qa-bundle-study` (see `qa/CONVENTIONS.md`)
**Related automated spec:** `qa/e2e/specs/library-entitlements.spec.ts`

## Walkthrough

1. As a guest, visit `/library` directly. → **Expect:** redirected to `/login?next=/library`.
2. As a guest, visit `/studies` directly. → **Expect:** redirected to `/library`, then (still logged out) on to `/login`.
3. Log in as qa-user, visit `/library`. → **Expect:** three sections render — "Continue", "Not started", "Completed" — each only shown if it has at least one entry (an empty section renders nothing, not an empty heading).
4. Look at "Not started": QA Digital Study — Not Started appears, progress reads **0/2**, button says **Start**. → **Expect:** cover image is either the real cover or the title's first-letter placeholder tile — never a broken image icon.
5. Look at "Continue": QA Devotional — In Progress appears, progress reads **1/5**, button says **Continue**. → **Expect:** clicking the card/button lands on Day 2 (the first not-fully-completed day), not back at Day 1.
6. Look at "Completed": QA Study — Completed appears, progress reads **1/1**, button says **Review**, and a **Start over** button/action is present. → **Expect:** Start over is present *only* in this section — confirm it does not also appear on the Continue or Not-started cards.
7. Click **Start over** on the Completed study, confirm the confirmation step, follow through. → **Expect:** the study moves out of "Completed" and into "Not started" (progress resets to 0/1); its previously saved `responses` answers (if this fixture study had any) are explicitly **not** erased — re-open the lesson and confirm any saved answer text is still there. (If this fixture doesn't have a saved answer to check, note that this step needs a fixture with both a completed lesson *and* a saved response to verify fully — flag as a coverage gap if so.)
8. As qa-user, visit `/studies/qa-bundle-study` directly (a real, published study qa-user is **not** entitled to yet). → **Expect:** redirected straight to `/store/qa-bundle-both-formats` (the linked product's purchase page) — never a generic "Forbidden"/403 page, and never the study's own slug leaking into the URL or page title before the redirect.
9. Log out, log in as qa-leader (a role with zero entitlements seeded). Visit `/library`. → **Expect:** the empty state ("You don't have any studies or devotionals yet.") — being a `leader` must not itself unlock any study content.
10. As qa-leader, visit `/studies/qa-study-not-started` and `/studies/qa-study-not-started/<any-lesson-id>` directly. → **Expect:** both redirect to `/store/qa-digital-study-not-started`, same as step 8 — the gate runs before the lesson is even looked up.

## Information-consistency checks

- The progress fraction shown on a My Library card (`completed/total`) must exactly match the lesson list's own fraction when you open that study directly (`/studies/<slug>` shows the identical `N/M lessons` figure) — these are two separate queries computing the same thing; a drift here would mean a real bug, not just cosmetic.
- The bucket a study lands in (Continue / Not started / Completed) must be *derivable* from the fraction shown on its own card — e.g. a card reading "1/5" should never appear in "Not started", and a card reading "2/2" should never appear anywhere but "Completed".
- The "Continue" resume link must always point at the first lesson that is not `completed` — if every lesson is `completed` the study belongs in "Completed", not "Continue", so this should never produce a dead or redundant resume link.
- A study's **kind** badge (Study vs. Devotional, shown both on the My Library card and the study's own listing page) must agree between the two screens for the same study.
- The redirect target for an unentitled gated study must point at the *actual* linked product's real slug — not the study's own slug (they are different fields on different rows and are not guaranteed to match) and not a 404.

## Known accepted trade-offs

- None specific to My Library/entitlements itself are documented in CLAUDE.md as of 2026-11-11 — the library/entitlement logic has been comparatively stable since the 2026-11-05 rebuild (see that dated entry) and later bug fixes were about progress-write races (lesson_progress unique constraint, 2026-11-09), not the library listing logic itself.
- "Admins cannot change their own role or delete themselves when they are the last admin" and other role-escalation safeguards are admin-console concerns, covered in `07-admin-console.md`, not here.
