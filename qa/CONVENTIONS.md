# QA suite conventions

Shared rules for every spec and checklist in `qa/`. Read this before adding to either.

## Safety rule (non-negotiable)

This suite **never** touches `DATABASE_URL` (the real, shared-with-staging Supabase project —
see CLAUDE.md's 2026-11-05 data-leak entries for why that distinction exists). It only runs
against:
- The QA dev server (`npm run qa:dev`), which forces `DATABASE_URL` to `TEST_DATABASE_URL`
  (the same isolated local Postgres `npm test` uses) — serving on `http://localhost:3100`.
- Supabase Auth identities named `qa-user@soul-dust-revival.test` /
  `qa-leader@soul-dust-revival.test` / `qa-admin@soul-dust-revival.test` — these necessarily
  live in the one real Supabase project (there's no separate staging Supabase project yet), but
  are clearly-tagged fixtures, never a real account.

If a spec or checklist step would need to touch the real Supabase project or real Stripe test
mode in a way `qa:seed`/the QA dev server can't cover (e.g. verifying the actual Stripe webhook
against a deployed Worker), say so explicitly and mark it a **manual-only, staging-only** step —
don't try to automate it against local dev.

## Running the suite

```bash
npm run qa:seed       # (re)seed QA fixtures into the local test Postgres -- idempotent
npm run qa:dev         # start next dev on :3100, pointed at the local test Postgres
npm run test:e2e       # run the Playwright suite (reads qa/e2e/specs/**)
npm run test:e2e:ui    # interactive runner
npm run test:e2e:report
npm run qa:cleanup     # remove the 3 QA Supabase Auth identities when done
```

Re-run `npm run qa:seed` after any build item that changes the schema or seed-relevant logic,
and whenever fixture data might have drifted (a spec mutated it, e.g. checkout or admin CRUD).

## Logging in as a role in a spec

`qa/e2e/global-setup.ts` builds one storage-state file per role before the suite runs:
`qa/.auth/user.json`, `qa/.auth/leader.json`, `qa/.auth/admin.json`. A logged-out ("guest") test
needs no storageState at all — it's the default.

```ts
import { test, expect } from "@playwright/test";

test.describe("as qa-user", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  test("can see My Library", async ({ page }) => {
    await page.goto("/library");
    // ...
  });
});
```

Never write a UI login flow (typing an email into `/login` and waiting for a real magic-link
email) inside a spec — there's no way to receive that email in CI/local automation. The
storageState fixture exists specifically so specs start already authenticated. The **manual**
login/magic-link checklist (`02-auth-and-account.md`) is where the real email-based flow itself
gets checked, by a human.

## QA fixture inventory

Seeded by `qa/scripts/seed-qa.ts` — read that file for the exact shape if a test needs more detail
than this table. Everything here is idempotent and safe to assume present once `npm run qa:seed`
has run.

| Fixture | Slug / identifier | Notes |
|---|---|---|
| QA Digital Study — Not Started | `qa-digital-study-not-started` (product), study `qa-study-not-started` | qa-user is entitled, zero progress → My Library "Not started". 2 lessons: one with full `studyContent` (3 Work the Word stations, **one with no inline Greek match** — exercises the fallback button), one plain content-block lesson (no `studyContent` — exercises the fallback reading view). |
| QA Devotional — In Progress | `qa-devotional-in-progress` (product), study `qa-devotional-fixture` | kind=`devotional`, 5 days (Jan 1–5). qa-user entitled; Day 1 completed + has a saved Journal answer, Day 2 in_progress (no answer yet), Days 3–5 not started. Days 4–5 have **no backfilled question block** — exercises the plain-text fallback in `DevotionalDayView`. |
| QA Study — Completed | `qa-study-completed` (product + study, same slug) | qa-user entitled, single lesson already `completed` → My Library "Completed" bucket, "Start over" should appear. |
| QA Physical Book — Amazon + Stripe | `qa-physical-amazon-and-stripe` | `format: physical`, both `amazonUrl` and `sellOnStripe: true` set — both buy buttons should render. |
| QA Physical Book — Amazon Only | `qa-physical-amazon-only` | `sellOnStripe: false` — only the Amazon button should render; must not be addable to the Stripe cart. |
| QA Sample Devotional | `qa-sample-devotional` (product, **inactive**), study `qa-sample-devotional` | kind=`devotional`, 5 days (Jan 1–5), owned by nobody. Days 1–3 are the free sample (`lessons.isSample`), Days 4–5 locked — so every QA account sees it as a "Sneak peek" in My Library. `sneak-peek.spec.ts` reads it as qa-leader. |
| QA Bundle — Both Formats | `qa-bundle-both-formats` | `format: both`. Physical price + digital price are independent; qa-user is **not** entitled yet — this is the fixture the checkout spec purchases fresh. Its digital side links study `qa-bundle-study`. |
| QA Inactive Product | `qa-inactive-product` | `active: false` — must never appear on `/store`, `/`, or be purchasable by slug. |
| QA Fixture: Published Post / Draft Post | `qa-fixture-published-post` / `qa-fixture-draft-post` | Draft must 404/redirect for every role except admin's editor. |
| QA Fixture: Published / Draft Leader Resource | title match | Draft must not appear on the public leader listing for a `leader`-role viewer. |
| Orders | n/a | qa-user has one `paid` order (for the Not-Started study) and one `pending` order (for the Amazon+Stripe book) — exercises Account/Reports showing mixed statuses. |
| Users | `qa-user@soul-dust-revival.test` (role `user`), `qa-leader@...` (role `leader`), `qa-admin@...` (role `admin`) | — |

## Spec file conventions

- One file per feature area under `qa/e2e/specs/`, named `kebab-case.spec.ts` matching the
  matching checklist's topic.
- Group by role with `test.describe` + `test.use({ storageState })`, as in the smoke spec
  (`qa/e2e/specs/_smoke.spec.ts` — read it for the working pattern).
- Prefer asserting on **real rendered content from the fixture table above** (a specific title,
  price, status label) over just "the page didn't 500" — the whole point of this suite is
  catching wrong/inconsistent information, not just crashes.
- Where a flow would mutate fixture data in a way that breaks another spec's assumptions (e.g.
  completing a lesson, changing a product), either reset the specific row at the end of the test
  or scope the mutation to a dedicated fixture row nothing else depends on (see the `qa-bundle-*`
  fixtures, reserved for the checkout spec to purchase).
- Specs are **not** a substitute for judgment calls (does this copy read well, is this the right
  UX) — leave those to the matching checklist.

## Testing for race conditions

Added 2026-11-11, after a real bug (an answer typed into a question block could be lost if the
reader navigated away immediately after typing, worse on mobile) reached production without the
original 195-spec suite ever catching it. Worth understanding why, since it shapes the rule below:
on a local dev server, a save completes in single-digit milliseconds — no realistic "navigate
immediately after typing" gives a real browser's request-cancellation behavior any actual window
to act in. The bug was only provable by *removing* that unrealistic speed advantage on purpose.

**The standing rule:** any component that auto-saves on blur/change and sits on a page a reader
can navigate away from (a `<Link>`, not just a full `page.goto()`) needs a dedicated test in
`qa/e2e/specs/race-conditions/` that:

1. Uses `qa/e2e/fixtures/networkThrottle.ts`'s `simulateSlowNetwork()` to add realistic latency to
   the save request — don't wait for a "Saved" indicator before navigating; the whole point is to
   leave a save in flight on purpose.
2. Reloads afterward (or navigates back) and asserts the data actually persisted, not just that
   the UI didn't show an error.
3. Runs on the `mobile-webkit` project (see `playwright.config.ts`) in addition to the normal
   desktop/mobile-chromium ones — **not a formality**. `mobile-chromium` is Chromium with a
   phone-sized viewport, same network stack and request-cancellation behavior as desktop Chromium;
   it cannot reproduce a Safari-specific timing quirk no matter how small the screen is. Real
   WebKit is required to test anything claiming to fix "worse on mobile" behavior around
   navigation. `mobile-webkit` is scoped via `testMatch` to only this folder, not the whole suite
   — it exists to catch timing bugs, not to triple-run ordinary functional coverage.

**Known environment limitation (2026-11-11):** `mobile-webkit` is correctly configured and should
run normally on a real dev machine or CI runner, but in *this* project's current sandboxed agent
session, WebKit's requests to the local dev server are being silently upgraded to HTTPS by
something at the system/sandbox network layer (confirmed: every asset request fails with "A TLS
error caused the secure connection to fail," reproduces against both `localhost` and `127.0.0.1`,
and attempting to start an unrelated plain HTTP server to isolate the cause was itself blocked by
the sandbox's own network-exposure permission check) — Chromium is unaffected because it uses its
own network stack rather than the OS's. This is an environment quirk, not a bug in this project's
code or test design; re-verify `mobile-webkit` actually runs the next time this suite is run
somewhere other than this exact sandboxed session before relying on it.

**When `keepalive: true` isn't enough.** The fix for the bug above was `fetch(..., { keepalive:
true })`, which is the right-sized fix for a small, fire-and-forget save — it has no bearing on
whether anything in the app actually *confirms* the save landed, only that the browser won't
cancel it mid-flight. If a future autosave has a larger payload (near or over keepalive's ~64KB
budget) or genuinely needs to know a save completed before doing something else, reach for
`lib/hooks/pendingSaveRegistry.ts` instead (or alongside): a small registry a save registers
itself in, and a navigation (or anything else) can explicitly await. It generalizes the pattern
`components/study/LessonNavigation.tsx` already built for its own two `lesson_progress` writes.
Deliberately not wired into every `<Link>` in the app as a blanket fix for the bug above — that
would mean touching every navigation trigger on every page with an autosave field, real surface
area for new bugs, for a guarantee `keepalive` doesn't actually need for a small text payload.

## Checklist file conventions

Each `qa/checklists/NN-topic.md` file covers one area for a human (or an agent driving the
browser) to actually look at, not just script. Structure:

```markdown
# NN. Topic name

**Roles covered:** guest / user / leader / admin (name which apply)
**Fixtures used:** (reference the table above by slug)
**Related automated spec:** qa/e2e/specs/topic.spec.ts (or "none — judgment-only")

## Walkthrough

1. Step... → **Expect:** ...
2. Step... → **Expect:** ...

## Information-consistency checks
(Does every number/label/status shown on this screen match what's actually true elsewhere —
e.g. does My Library's progress % match the lessons actually completed, does a breadcrumb match
the real study title, does an admin counter match the real row count.)

## Known accepted trade-offs
(Cite the CLAUDE.md entry if this area has a documented, deliberate limitation — so a checklist
run doesn't re-flag something already decided. Leave empty if none apply.)
```

Keep checklist steps concrete and falsifiable ("the progress ring reads exactly N%", not "progress
looks right") so a finding written against it is unambiguous.

## Findings

A findings report from an actual run goes in `qa/findings/FINDINGS_<date>.md`, organized by
severity, each citing the exact checklist step or spec that caught it. See
`qa/findings/FINDINGS_2026-11-07.md` for the format.
