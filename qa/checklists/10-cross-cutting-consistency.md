# 10. Cross-cutting consistency — "is the information shown actually true"

**Status note (2026-11-11):** the study-title-vs-product-title mismatch this checklist
flags below (My Library, `/studies/[slug]`) is **fixed** as of that build
(`lib/study/displayTitle.ts`) — see `qa/findings/FINDINGS_2026-11-07.md` #2 for the
authoritative fixed/unfixed status of every numbered finding before treating anything else
below as still open.

**Roles covered:** guest, user, leader, admin
**Fixtures used:** all
**Related automated spec:** none dedicated — several specs in other files assert individual facts
from this list; this file is the master checklist tying them together as a single pass.

This is the direct answer to "all the information on the screen is consistent and makes sense and
is true." Each item below names two (or more) places the same fact is shown or derived, and what
it would mean for them to disagree. Run this after any build item that touches progress, titles,
counts, or status — these are the places most likely to drift because the same fact is computed or
displayed in more than one spot.

## Walkthrough / checks

1. **Study/devotional title, 4+ places.** A study's title appears in: the public `/books/[slug]`
   storefront page (via its linked product's title), `/studies/[slug]`'s own `<h1>`/tab title
   (`study.title` directly), the Study reader's breadcrumb (`deriveBookLabel()` off `study.title`),
   My Library's card, and the admin studies list. → **Expect:** all of these show the *same* title
   to a human. **Known, still-live bug:** the real Psalms devotional's `studies.title` column is a
   literal raw import filename (`Soul_Dust_Revival_A_365_Day_Devotional_Through_the_Psalms_...`,
   underscores and a trailing space) — CLAUDE.md's 2026-11-10 entry documents this, says
   `DevotionalAppView`'s header was fixed to read the **linked product's** title instead, but
   explicitly left `/studies/[slug]`'s own heading/tab title (`app/(study-app)/studies/[slug]/page.tsx`
   lines ~32 and ~87) using the raw `study.title` directly, calling it "out of scope." **Confirmed
   still true by reading current source during this QA build-out** — re-verify this is still
   present (or has since been fixed) rather than assuming either way, and if still present, it's a
   real, reportable, already-known gap, not a new finding.
2. **My Library progress bucket vs. real lesson_progress rows.** For the QA Devotional — In
   Progress fixture (qa-user: Day 1 completed, Day 2 in_progress, Days 3-5 not_started), does My
   Library's "Continue" bucket correctly include it, and does whatever percent/fraction it may show
   (if any) match 1-of-5 or 2-of-5 depending on how "in progress" is counted — check the real
   library query's definition of "started" vs. "completed" rather than assuming.
3. **Study reader per-tab progress ring.** `useTabProgress`'s `percent` is `done.size / 5 * 100`,
   localStorage-only, per lesson. After marking 2 of 5 tabs done and reloading the page, does the
   ring still show 40%, and does the Week Picker sheet's per-week percent (`readTabProgressPercent`)
   for that same lesson match exactly? These read the same localStorage key
   (`sdr-study-tabs-<lessonId>`) by two different code paths — a divergence here would mean one of
   them is stale or keyed wrong.
4. **Week count.** `WeekPickerSheet` shows `{bookLabel} · {weeks.length} Weeks`. Does `weeks.length`
   match the real number of *published* lessons for that study (not counting unpublished drafts,
   unless the picker is deliberately showing all lessons regardless of publish state — check which
   the real query does)?
5. **Featured counter vs. real homepage content.** Admin Products list shows "N/8 featured on the
   homepage" from a live `WHERE featured = true` count. Does the homepage's "Featured content"
   section actually show exactly those N products (not more, not fewer, not a cached stale set)?
   Using the QA fixtures, `QA Digital Study — Not Started` and `QA Bundle — Both Formats` are both
   seeded `featured: true` — confirm both (and only those, among QA fixtures) appear on `/`.
6. **Order status: Account page vs. admin Sales report.** The QA fixture `paid` order and `pending`
   order for qa-user — do both the Account page's order history and the admin Sales report show the
   *same* status string for each (not one saying "Paid" and the other "paid"/"complete" or some
   other inconsistent label)?
7. **"Both"-format product: two independent purchases shown consistently.** `QA Bundle — Both
   Formats` has an independent physical price and digital price. Does the storefront detail page,
   the cart, the checkout line items, and (once purchased) the Account order history all show the
   *same two prices* without ever collapsing them into one combined number anywhere, since
   CLAUDE.md documents real past bugs here (line items merging incorrectly, a non-null assertion
   on `digitalPriceCents`)?
8. **Inactive product never resurfaces.** `QA Inactive Product` (`active: false`) — confirm it's
   absent from `/`, `/books`, the homepage featured section (even if it were marked featured), and
   that its direct `/books/qa-inactive-product` URL doesn't quietly render a buyable page. It
   SHOULD still appear in the admin products list (admins manage inactive products too) — confirm
   that asymmetry is real and intentional by checking the actual admin list query's WHERE clause.
9. **Greek station match count.** The QA Digital Study fixture has 3 Work the Word stations, 2 with
   an inline Passage-tab match and 1 without. Does the Passage tab show exactly 2 inline underlined
   words and exactly 1 fallback button — not 3 and 0, not 1 and 2? (CLAUDE.md's 2026-11-11 entry
   says the real Colossians data's own 5 stations "all happen to match inline already," so this
   fallback path has apparently never been exercised against real production data before — this QA
   fixture is deliberately the first thing that does.)
10. **Devotional Journal vs. actual saved responses.** The Journal tab should show exactly the
    fixture's one real saved answer (Day 1), and nothing for Day 2 (in_progress, no answer) or Days
    4-5 (no backfilled question block at all). Confirm it doesn't show a blank/broken entry for
    those days instead of correctly omitting them, and doesn't show a stale/cached answer if the
    underlying `responses` row were edited.
11. **Admin "Kind" badge vs. actual reader rendered.** The admin studies list shows a Kind badge
    (study/devotional) per CLAUDE.md's 2026-11-09 entry. Does a study's Kind badge actually match
    which reader (5-tab Study UI vs. 4-tab Devotional UI) renders for it on the public side? A
    mismatch here would mean an admin is misinformed about what a customer actually sees.
12. **Users list role accuracy.** qa-user/qa-leader/qa-admin's roles as shown in `/admin/users`
    must match `users.role` exactly, and must match what each of their own sessions can actually
    reach (cross-check against `admin-access-control.spec.ts`'s results — a role display bug and an
    actual authorization bug are two different kinds of problems, and this item is specifically
    about the display matching the enforced reality).
13. **Breadcrumb trail integrity.** Per CLAUDE.md's 2026-11-09/2026-11-10 fixes, the Study reader's
    breadcrumb reads "Soul Dust Revival · {book} · Week {n} ▾" with `{book}` derived from
    `deriveBookLabel()` stripping a "Soul Dust Revival" prefix off the study's own title. For the
    QA fixture study (title "QA Colossians-Shaped Study", no "Soul Dust Revival" prefix), confirm
    `deriveBookLabel()` degrades sensibly (shows the full title, doesn't mangle it) rather than
    assuming every real study always has that exact prefix to strip.

## Known accepted trade-offs

- Item 1's devotional-title bug is pre-existing, documented, and explicitly deferred in
  CLAUDE.md (2026-11-09/2026-11-10 entries) — report it as "confirmed still present" or "confirmed
  fixed," not as a new discovery either way.
- Per-tab/per-part/per-practice Study and Devotional progress is localStorage-only by design
  (CLAUDE.md, multiple entries) — it will legitimately read 0% on a different device/browser. This
  is a documented trade-off, not an inconsistency to report, as long as it's internally consistent
  within one browser (items 2-3 above).
