# 06. Devotional reader (4 tabs)

**Roles covered:** user (only role that reads devotional content)
**Fixtures used:** `qa-devotional-fixture` (study), 5 days Jan 1–5 — Day 1 completed + real saved answer, Day 2 in_progress, Days 3–5 not started, Days 4–5 have no backfilled question block
**Related automated spec:** `qa/e2e/specs/devotional-reader.spec.ts`

## Walkthrough

1. Open the study's own listing page `/studies/qa-devotional-fixture` (not a specific day) as qa-user. → **Expect:** the "Devotional" kind eyebrow, a progress bar reading "1/5 lessons", and per-day status badges: Day 1 "Completed", Day 2 "In progress", Days 3–5 show no badge at all (not "Not started" text — confirm the real UI omits a badge rather than showing an empty one).
2. Open Day 1. → **Expect:** the 4-tab shell header shows the real product title ("QA Devotional — In Progress"), not the study's own raw title, and the days-walked ring reads "1" / "OF 5".
3. On Day 1's **Today** tab: confirm the key verse card with its memorization slider, "Lift Up Your Eyes" as the ember-accented callout, and "A Question to Sit With" as a real text field pre-filled with the saved answer. → **Expect:** the "I walked today" toggle shows as already walked ("✓ Walked", moss-colored), not inviting the reader to walk it again.
4. Toggle Day 1's walked state off, then back on. → **Expect:** the ring on *every other day's page* (not just Day 1's) immediately reflects the change after reloading — confirm by reloading Day 2 and checking the ring.
5. Navigate to Day 2. → **Expect:** the question field is empty (no saved answer yet) and "I walked today" (not yet walked) is shown, not "✓ Walked".
6. Navigate to Day 4. → **Expect:** "A Question to Sit With" still renders with the real question text, but as a plain paragraph plus the sentence "saving isn't available for this day yet" instead of a real input — confirm there's no broken/empty box where the input would be.
7. Open **The Year** tab from any day. → **Expect:** three stat tiles ("days walked", "of 150 psalms", "answers written") read 1 / 1 / 1 respectively for this fixture; the January grid shows Day 1 filled solid (walked) with a small dot marker (answer written), Day 2 outlined but not filled, with no answer-written dot, and no day outlined in ember as "today" (none of Jan 1–5 is the real current calendar date, except by coincidence).
8. Search "3" in the Year tab's search box. → **Expect:** only Day 3 (Psalm 3) is listed; typing a non-numeric fragment of a title should fall back to matching by title/date text instead of psalm number.
9. Open **Journal**. → **Expect:** exactly one entry (Day 1), showing the real question and the real saved answer text verbatim, newest-first ordering (irrelevant with only one entry, but check this once a fixture has 2+ saved answers). Days 2, 4, 5 must not appear.
10. Open **Six Faces of the Dust**. → **Expect:** all seven sections (six faces + the Christ-centered lens) render with their real body text and the Psalm 119:25 (NKJV) quote in the intro — this content never changes per-study, so confirm it's not accidentally scoped to or missing for a *different* devotional study if more than one exists.
11. Switch Today → Year → Journal → Today again. → **Expect:** a half-typed Year search query is preserved when you switch away and back (panels stay mounted, not torn down).

## Information-consistency checks

- The days-walked ring's "N OF M" must equal the Year tab's own "days walked" stat tile and the study listing page's "N/M lessons" fraction — three separate renderings of the same underlying count; any disagreement between them is a real bug, not a display quirk.
- A day marked "walked" (moss-filled) in the Year grid must correspond exactly to a "Completed" badge on the study listing page for that same day, and to a "✓ Walked" toggle state when you open that day directly — three places showing the same boolean.
- A day with an "answer written" dot in the Year grid must have a corresponding entry in the Journal tab, and vice versa — no day should show one without the other.
- The "today" calendar highlight (ember outline) should only appear on a real matching day if the current date actually matches one of the devotional's real day labels — since this fixture only covers Jan 1–5, expect no "today" highlight on almost any real test run, which is correct, not a bug (see trade-offs below).
- The app-shell header's title must come from the **linked product's** title, not the study's own raw `title` column — confirm this by checking the study's own `/studies/qa-devotional-fixture` page heading (which uses `study.title` directly) differs from the lesson page's header (`displayStudyTitle`, from the product) if the two were ever allowed to diverge; for this fixture they happen to be named similarly, so this is really only testable with a study whose raw title is messier (the real Psalms devotional's title is a literal source filename — see CLAUDE.md 2026-11-10 "even later" entry — worth re-checking directly against that real data in a manual staging pass).

## Known accepted trade-offs

- **No cross-device sync existed for devotional progress before the 2026-11-10 rebuild; it does now** via real `lesson_progress`/`responses` — so there should be *no* localStorage-only devotional state left to find. If you do find any, it's a regression, not an accepted gap.
- **Leap-year Feb 29 has no matching real day** in this non-leap-structured 365-day book, so "today" highlighting simply never lights up on Feb 29 — a documented, accepted low-severity edge case, not a bug (CLAUDE.md, 2026-11-10 "newest" entry).
- **No "Read Psalm N" full-passage bottom sheet** — the Today tab's existing short key-verse/reading content is the deliberate scope; this would need all 150 psalms' WEB text embedded, a real new data decision deferred on purpose (CLAUDE.md, 2026-11-10 "newest" entry).
- **The real Psalms devotional's own study title is a raw, messy source filename** ("Soul_Dust_Revival_A_365_Day_Devotional_Through_the_Psalms_Universal_Edition ", underscores and trailing space) — flagged as a pre-existing data-entry issue, not fixed, and known to leak into the plain `/studies/[slug]` page's heading and browser tab title (CLAUDE.md, 2026-11-10 "newest" entry). Re-confirm this specific real-data issue in a manual pass against staging, since this QA fixture's own title was written cleanly and won't reproduce it.
