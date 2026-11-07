# 07. Admin console

**Roles covered:** guest, user, leader, admin
**Fixtures used:** all QA products/studies/blog/leader-resource/order/user fixtures (see `qa/CONVENTIONS.md`'s inventory table)
**Related automated spec:** `qa/e2e/specs/admin-access-control.spec.ts`, `admin-products.spec.ts`, `admin-studies.spec.ts`, `admin-blog.spec.ts`, `admin-leader-resources.spec.ts`, `admin-users.spec.ts`, `admin-reports.spec.ts`

The automated specs above already cover role gating and core CRUD/data-correctness mechanically.
This checklist is for the judgment calls a script can't make: does this look right, is a
destructive action appropriately guarded, is anything visually inconsistent.

## Walkthrough

1. Log in as qa-admin, land on `/admin/products`. → **Expect:** the admin header matches the
   public site's header exactly in height/color/logo placement (both render through
   `SiteHeaderShell`) — no visual seam between the two nav bars' styling.
2. Click through all 8 admin nav links (Products, Studies, Leader Resources, Blog, Social, Users,
   Reports, Settings) in order. → **Expect:** every one loads without a visible layout shift,
   console error, or flash of unstyled content.
3. While on `/admin/studies`, look at the nav bar. → **Expect (real gap, see below):** **no
   section is visually marked as "active"** — `components/admin/AdminNav.tsx` renders all 8 links
   identically regardless of the current route (no `aria-current`, no active-state class). An
   admin navigating by nav link alone has no way to tell which section they're in from the nav
   itself (only the page's own `<h1>` says so). This is a real, unflagged UX gap — not something
   CLAUDE.md documents as an accepted trade-off.
4. Open the QA Digital Study — Not Started product's edit page, click "Delete product", then
   **cancel** the confirm dialog. → **Expect:** the product still exists afterward (confirmed by
   the automated spec); the dialog's wording clearly names what will be deleted and that it can't
   be undone.
5. Open the QA Colossians-Shaped Study, then its "Week 1: Grace and Truth" lesson. → **Expect (real
   gap, see below):** the editor shows only the lesson's 3 question content blocks (Work the Word
   stations) — there is no way to see or edit the week's subtitle, passage text, prayer, practices,
   benediction, or closing verse (the `studyContent` JSON that the real 5-tab Study reader actually
   renders). Confirmed by reading `app/admin/studies/[id]/lessons/[lessonId]/page.tsx`: it only ever
   renders `LessonBlockEditor` against `content_blocks`, with zero reference to `studyContent`
   anywhere. **For every real Colossians week currently live in production, this means there is
   literally no admin-UI path to fix a typo in the passage text, adjust a practice, or edit the
   prayer — only a one-off backfill script can write that data.** This is worth prioritizing: it's
   a real content-maintenance gap, not just a nice-to-have.
6. On the Studies list (`/admin/studies`), look at each row. → **Expect (real gap, see below):**
   no indicator of a study's `kind` (devotional vs. study) anywhere on the list — only title, slug,
   and draft status. An admin managing both kinds has to open each study individually to tell them
   apart. Low-cost fix: a small badge next to the title, same pattern as the "Featured" badge on
   the Products list.
7. Open Users & Roles as qa-admin. → **Expect:** the page's own copy states the self-role-change
   rule in plain language; qa-admin's own row has no role dropdown; the other two roles'
   dropdowns work.
8. Open each Settings/Social/Reports sub-page with no real data seeded there (QA fixtures don't
   populate `integration_connections`/`social_posts`/`login_events`-with-volume). → **Expect:** a
   clear, intentional empty state (not a blank page, not a raw "0 results" with no context) for
   each. Note any screen that renders awkwardly empty rather than guiding the admin toward the
   next action (e.g. "Connect your first platform").
9. Resize the browser to ~768px (the documented breakpoint where the admin nav's horizontal
   scroll is "genuine," per the code comment in `AdminNav.tsx`). → **Expect:** the nav scrolls
   horizontally without visually clipping "Log out"; confirm there's some visual affordance (e.g.
   a partially-cut-off link) hinting that more items exist off-screen, since the scrollbar itself
   is deliberately hidden (`no-scrollbar`) — a user unaware they can scroll the nav may not
   discover Social/Users/Reports/Settings at all on a narrow screen.

## Information-consistency checks

- Products list: the "N/8 featured" counter must equal the number of rows actually showing the
  "Featured" badge on that same list (count them by eye). Mismatch would mean the counter query
  and the per-row badge are reading different things.
- A "both"-format product's list row shows two prices (`$X.XX / $Y.YY digital`) — confirm these
  match exactly what's saved in its edit form's two fieldsets, not stale or swapped.
- Sales report: the order total shown must equal the sum of its real line items' prices × quantity
  — for the QA fixture paid order (QA Digital Study — Not Started, qty 1, $19.00), the report's
  total column should read exactly $19.00, not the bundle's or another fixture's price.
- Users list role labels must match what was actually seeded/last saved — if you change qa-leader's
  role to `user` and back during this walkthrough, confirm the list reflects each change
  immediately (no stale cache).
- The "Imported from ..." banner on a study's edit page should only appear for a study with a real
  `sourceFileName` — none of the QA fixtures were imported, so none of them should show this banner;
  confirm none do (a stray banner here would mean the condition is inverted or always-true).

## Known accepted trade-offs

- Admin content column width (`max-w-5xl`) and the admin nav bar's color/sizing matching the
  public site exactly are deliberate, already-fixed decisions — see CLAUDE.md's 2026-11-05/07
  entries ("standardized every admin form to one consistent width," "gave the admin nav bar a
  logo... factored nav chrome into a shared `SiteHeaderShell`"). Do not re-flag these as
  inconsistencies.
- Save/Delete button styling (bordered, parchment-background `Button` component, `danger` variant
  for Delete) was intentionally ported from the design system — see CLAUDE.md's 2026-11-07 "closed
  the real gap behind the Save/Delete button mismatch" entry. Current styling is correct as-is.
- The admin lists' row caps (100 for products/studies/leader-resources, 1000 for blog) are
  documented as "a safety cap, not real pagination" directly in each page's own source comment —
  not a bug, a known scaling limit to revisit later.
- The nav's `overflow-x-auto` horizontal scroll at narrow widths is itself a deliberate, already
  explained design choice (see the comment in `AdminNav.tsx` and CLAUDE.md's 2026-11-05 scrollbar
  entries) — only the *discoverability* of that scroll (item 9 above) is a new observation, not the
  scroll behavior itself.

## New findings surfaced by this checklist (not previously documented anywhere)

All three below are **[FIXED]** as of the 2026-11-11 (later) build — see
`qa/findings/FINDINGS_2026-11-07.md` #8/#9/#10 and CLAUDE.md's same-dated entry.

1. ~~No active-section indicator in the admin nav~~ — `AdminNav.tsx` now marks the current
   section with `aria-current="page"` and a visible underline, including for sub-routes.
2. ~~No admin UI path to edit a lesson's structured `studyContent`~~ — new
   `components/admin/StudyContentEditor.tsx`/`StudyContentEditorGate.tsx` give admins a
   full editor, including creating structured content from scratch for a lesson that
   doesn't have it yet.
3. ~~No kind (devotional/study) indicator on the Studies list~~ — `app/admin/studies/page.tsx`
   now shows a Kind badge on every row.
