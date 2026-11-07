# QA regression suite

A reusable test library for Soul Dust Revival: automated Playwright E2E specs plus
structured manual checklists, organized by area, meant to be run **after every build
item** — not just once. This is the "does everything we've built still work, and does
every screen show true, consistent information" layer that sits alongside `npm test`
(unit/integration) and `npm run verify` (typecheck/lint/build).

It answers questions those other tools can't: does the information on a given screen
actually match reality (a progress percentage, a breadcrumb, a featured count), does
every role see what it should and nothing it shouldn't, and does a flow actually read
and feel right for a real person clicking through it.

## What's here

```
qa/
  README.md            — this file
  CONVENTIONS.md        — how specs/checklists are structured, the fixture data reference
  scripts/
    seed-qa.ts           — (re)seeds a comprehensive fixture set into the local test Postgres
    cleanup-qa.ts        — removes the 3 QA Supabase Auth test identities when done
    qa-dev-server.mjs    — starts `next dev` on :3100, forced onto the isolated local DB
  e2e/
    global-setup.ts       — logs in as each QA role once, saves storageState for specs to reuse
    fixtures/auth.ts       — the magic-link-without-email login helper (see "How login works")
    specs/*.spec.ts         — automated Playwright tests, one file per area
  checklists/*.md         — manual, judgment-level QA scripts, one file per area
  findings/FINDINGS_<date>.md — the output of an actual run: issues/gaps/UX anomalies/ideas
```

## Setup (one-time per machine)

Same local Postgres `npm test` already requires — see the root `BUILD_TASKS.md` "3. Database"
section if it isn't set up yet. Then:

```bash
npx playwright install chromium webkit   # local Chromium + WebKit builds for Playwright
```

WebKit is used specifically by the `mobile-webkit` project (real Safari engine, for the
timing/race-condition tests in `qa/e2e/specs/race-conditions/` — see
`qa/CONVENTIONS.md`'s "Testing for race conditions"), not the main functional suite.

## Running a QA pass

```bash
npm run qa:seed      # 1. (re)seed fixtures -- safe to re-run any time, fully idempotent
npm run qa:dev        # 2. start the QA dev server on :3100 (separate terminal/background)
npm run test:e2e      # 3. run the desktop (chromium) suite
npm run qa:seed && npm run test:e2e:mobile   # 4. re-seed, then run the mobile suite
npm run test:e2e:race   # 5. the race-condition tests, on real WebKit (reseeds automatically)
npm run test:e2e:report   # open the HTML report for the last run
```

**Re-seed between desktop and mobile runs** (`test:e2e:mobile` does this for you). The
suite shares one mutable local Postgres across every spec file and project, with no
per-test transaction rollback — some real app behavior is itself stateful across views
(opening a lesson pings `lesson_progress` to "in_progress", a genuine, correct app
behavior), so a spec that legitimately opens a fixture's lesson (`study-reader.spec.ts`)
can leave that fixture no longer "pristine" for a later spec that asserts its untouched
state (`library-entitlements.spec.ts`). Within one `playwright test` invocation this is
handled by running strictly sequentially (`fullyParallel: false`, `workers: 1`,
alphabetical file order keeps `library-entitlements` ahead of `study-reader`) — but
running chromium and mobile-chromium back-to-back in a single invocation without an
intermediate reseed reintroduces the same collision across the project boundary. Always
reseed immediately before each project's run rather than relying on one seed to cover a
combined multi-project invocation.

Then work through the relevant `qa/checklists/*.md` files by hand (or have an agent drive
the browser against `http://localhost:3100` using the same fixtures) for the judgment-level
items automated specs can't catch.

When done with a QA pass:
```bash
npm run qa:cleanup   # removes the 3 QA Supabase Auth identities from the real project
```

## Why a separate `:3100` dev server

`next dev`'s default `DATABASE_URL` points at the **real, shared-with-staging Supabase
project** (deliberately, so a developer's local dev shows the same data as the deployed
site — see CLAUDE.md's 2026-11-05 entries). That's exactly backwards for an automated
test suite: two separate real-data leaks already happened this project's history because
a test run touched that database. `npm run qa:dev` forces `DATABASE_URL` to
`TEST_DATABASE_URL` (the same isolated local Postgres `npm test` already uses) the same
way `vitest.setup.ts` does for `npm test` — so this suite can run as aggressively as it
wants (creating orders, completing lessons, editing products) with zero risk to real data.

**The one thing that isn't isolated:** there's no separate staging Supabase *Auth*
project yet (SECURITY_REVIEW.md recommends one). The three QA login identities
(`qa-user@`, `qa-leader@`, `qa-admin@soul-dust-revival.test`) necessarily live in the one
real Supabase Auth project — they're just clearly-tagged test fixtures, the same
convention this project has already used for ad hoc test accounts. `npm run qa:cleanup`
removes them when a pass is done.

## How login works without a real email

This app is magic-link only — there's no password to script a login form with, and no
inbox to receive a real email in CI/local automation. `qa/e2e/fixtures/auth.ts` uses the
Supabase Admin API to generate a real magic-link OTP server-side, then exchanges it for a
real session using the exact same `@supabase/ssr` cookie-writing code path
`lib/supabase/server.ts` uses — so the resulting session cookies are indistinguishable
from a real "clicked the email" login, with no dependency on the Supabase project's
configured redirect-URL allowlist. `qa/e2e/global-setup.ts` runs this once per role before
the suite starts and saves the result as a Playwright storage state
(`qa/.auth/{user,leader,admin}.json`); individual specs just declare
`test.use({ storageState: "qa/.auth/<role>.json" })` to start already logged in.

This is test infrastructure only — it doesn't touch or weaken the app's own auth code.

## What's automated vs. manual, and why both

Automated Playwright specs are reliable and fast for: navigation, role-based access
control, form submission, API status codes, and asserting that specific real fixture data
renders correctly. They're weak at: "does this look right," "is this copy clear," "is
this the expected UX for a confirmation dialog," "is the contrast actually readable" — the
kinds of things only a human (or an agent actually looking at rendered pixels/text) can
judge. The checklists exist for exactly that gap, and are written to be concrete and
falsifiable (an exact expected value, not "looks right") so a finding against them is
unambiguous.

A few flows are **manual/staging-only by design** and intentionally not automated against
local dev — most notably actually completing a real Stripe test-mode payment and
confirming the deployed Cloudflare Worker's webhook grants an entitlement end-to-end.
Each checklist says explicitly where this applies.

## Keeping this current

Re-run `npm run qa:seed` after any schema change or build item that touches seed-relevant
logic. When a build item adds a new screen, role, or flow, add to the relevant spec/
checklist file (or a new one, following `CONVENTIONS.md`) rather than letting coverage
quietly fall behind — this suite is only useful if it's run and extended every build, the
same discipline CLAUDE.md already asks for with the two required reviews.
