# Build Task List

**This file is maintained continuously — updated every time this project changes,**
not written once and left stale. Point Claude Code at this file to work through
systematically. Checked items are done in the codebase already; unchecked items are
what's left, roughly in the order they need doing.

---

## 1. Accounts & services to set up
- [ ] Cloudflare account (hosting, Stream, R2)
- [ ] Supabase project (Auth + Postgres — one project covers both)
- [ ] Stripe account
- [ ] Resend account
- [ ] Meta Developer app (Facebook Login + Instagram Graph API products)
- [ ] X Developer Portal app (OAuth 2.0 enabled; confirm your access tier can post — see SOCIAL.md)

## 2. Environment configuration
- [ ] `cp .env.example .env` and fill in every value
- [ ] Find `SUPABASE_SERVICE_ROLE_KEY` in Supabase Project Settings → API (used only
      for account self-deletion — never exposed to the client)
- [ ] Generate `TOKEN_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- [ ] Generate `CRON_SECRET`: any long random string
- [ ] Register OAuth redirect URIs with X and Meta once you know your real domain:
  - `https://yourdomain.com/api/admin/connections/x/callback`
  - `https://yourdomain.com/api/admin/connections/facebook/callback`

## 3. Database
- [ ] `npm install`
- [ ] `npm run db:generate && npm run db:migrate`
- [ ] `npm run db:seed` (loads one sample study + lesson + blog post)
- [ ] Promote your own account to admin after signing up once:
  ```sql
  update users set role = 'admin' where email = 'you@example.com';
  ```

> These three steps are verified *mechanically* against a throwaway local
> Postgres (Homebrew `postgresql@16`, installed only for this local
> smoke-test, not a project dependency) — still unchecked above because
> that's not the real Supabase project. See "Recently completed" below for
> what full local dev setup looks like once you have one: `brew install
> postgresql@16`, `brew services start postgresql@16` (run `initdb` first
> if it's a fresh install), `createdb <name>`, point `DATABASE_URL` in
> `.env.local` at it, then the three commands above.

## 4. Deployment
- [ ] Deploy the Next.js app to Cloudflare Pages
- [ ] Set every `.env` value in the Cloudflare Pages environment variables dashboard
- [ ] Configure the Stripe webhook endpoint (`/api/webhooks/stripe`) in the Stripe
      dashboard, pointed at the deployed domain, and copy the signing secret into
      `STRIPE_WEBHOOK_SECRET`
- [ ] Deploy the companion Cloudflare Worker for cron (see SOCIAL.md for the
      `wrangler.toml` + worker script) — hits `/api/cron/social-publish` every
      5-15 min and `/api/cron/social-metrics` daily, both with the `CRON_SECRET`
      bearer token

## 5. Platform-specific approval steps (these take real calendar time — start early)
- [ ] Submit Meta App Review for `pages_manage_posts` and `instagram_content_publish`
      (required before these work for any account other than your own
      developers/testers on the app)
- [ ] Confirm your X API access tier actually permits posting (the free tier
      generally doesn't — see SOCIAL.md)

## 6. End-to-end testing checklist
Manual QA pass — walk through each of these against a real (ideally staging/test)
deployment before treating any of it as launch-ready:

**Auth & accounts**
- [ ] Signup creates an account and a `login_events` row
- [ ] Login with an unrecognized email is rejected with a link to sign up instead
- [ ] Session persists correctly across the study app and leader section

**Commerce**
- [ ] Guest checkout completes for a physical-only cart; confirmation email arrives
- [ ] Digital purchase requires login; entitlement is granted after the Stripe webhook fires
- [ ] Country is required and stored on every order, guest and logged-in alike
- [ ] A Stripe promo code applies correctly and the order total reflects the discount

**Content authoring**
- [ ] Create a product; image upload requires alt text before saving
- [ ] Create a study with lessons and at least one of every content block type
      (text, image, video, audio, question, callout)
- [ ] Import a `.docx` and a `.pdf` and confirm lessons are created and reviewable
- [ ] Video block requires a captions file before being treated as complete

**Roles & leader section**
- [ ] Promote a user to `leader`; confirm `/leader` access and that a regular
      `user` sees the "ask an admin" message, not a login bounce
- [ ] Confirm an admin cannot change their own role via `/admin/users`

**Account & privacy**
- [ ] Download a data export from `/account` and confirm it includes real orders,
      responses, and login history
- [ ] Delete a non-admin test account; confirm login is no longer possible and that
      the account's orders still exist but with anonymized personal fields
- [ ] Confirm the only admin account is blocked from self-deleting
- [ ] Connect a Facebook account that manages 2+ Pages and confirm the picker screen
      appears and connects the chosen Page (test with a single-Page account too, to
      confirm the no-picker auto-connect path still works)
- [ ] Try to print a lesson page — confirm only the explanatory notice prints, not
      the actual study content; confirm an order confirmation prints normally

**Social media**
- [ ] Connect Claude, X, and Facebook in Settings → Connections
- [ ] Confirm Instagram auto-connects if the Facebook Page has a linked IG business account
- [ ] Get AI suggestions for a social post, accept one, schedule it (once/daily/weekly)
      for each platform
- [ ] Confirm the cron worker actually fires `/api/cron/social-publish` and the post
      appears live on each platform
- [ ] Confirm `/api/cron/social-metrics` populates `social_post_metrics` and the
      analytics report shows real numbers
- [ ] Let an X connection sit past its token expiry and confirm the scheduled post
      still fires (tests the refresh-token logic actually works, not just compiles)

**Blog**
- [ ] Get AI suggestions for a blog post, accept one, publish it, confirm it's live
      at `/blog/[slug]`
- [ ] Confirm markdown renders correctly and is sanitized

**Reporting**
- [ ] Sales, engagement, and social analytics reports all show real data, not just
      empty states

**Accessibility & responsive**
- [ ] Run axe DevTools or Lighthouse against storefront, checkout, a lesson page,
      and the admin authoring flow
- [ ] Full keyboard-only pass through checkout and lesson authoring
- [ ] Test on at least one real phone and one real tablet, not just DevTools' device toolbar

**Security**
- [ ] Configure Cloudflare Rate Limiting Rules for `/api/checkout`, `/api/responses`,
      `/api/progress`, `/login` (see SECURITY.md — not built into the app itself)

## 7. Known gaps worth deciding on, not yet built
- [ ] Decide a retention window for `login_events` and implement pruning
- [ ] Have counsel review `/privacy` for legal sufficiency in your actual jurisdictions
      (the content is real and accurate, just not attorney-reviewed yet)

---

## Recently completed (most recent first)
- Bumped `resend` 4 -> 6 to close the last production `npm audit` finding
  (deepmerge prototype-poisoning advisory, GHSA-gcqx-w48m-w2h4, reached via
  `html-to-text` -> `@react-email/render` -> `resend`). Checked `resend`
  v6.37.0's `.d.mts` before bumping: the `Resend` constructor and
  `emails.send()` payload shape are unchanged from v4, and
  `lib/email/send.ts` only calls that one method with a plain HTML string
  it builds itself (no React Email templates), so no code changes were
  needed. `npm audit --omit=dev` now reports **0 vulnerabilities**. The 22
  remaining moderate findings (`eslint-plugin-react`/minimatch,
  `@tailwindcss/typography`/postcss-selector-parser, `drizzle-kit`/esbuild
  dev-server) are devDependency-only — never shipped to production, and
  their automated fixes would force absurd downgrades (e.g. `eslint@4.0.0`)
  that npm's resolver is proposing incorrectly, so left alone.
- Reviewed OAuth authorize/callback flows (X and Facebook — PKCE, CSRF
  `state` validation via httpOnly cookies), token encryption wiring in
  `lib/social/connections.ts` (AES-256-GCM encrypt/decrypt on every
  write/read path, proper nulling on disconnect), and accessibility beyond
  lint: confirmed in a real browser that the skip-link appears on first Tab
  press with a visible focus style, that the nav's focus ring resolves to
  an actual 2px box-shadow via computed styles, and that
  `prefers-reduced-motion` is handled globally in `app/globals.css` as
  `ACCESSIBILITY.md` documents. No issues found — no code changes.
- Fixed a real moderate XSS finding surfaced by `npm audit` review: bumped
  Tiptap v2 -> v3 (GHSA-cp6q-959q-f8rh, `mergeAttributes()` prototype
  pollution). This mattered specifically because the admin `.docx`/`.pdf`
  study-import feature feeds hostile document content into this exact
  editor for review — a path the DOMPurify sanitize-on-write/render
  pattern elsewhere doesn't cover. Removed the now-redundant
  `@tiptap/extension-link` package (StarterKit bundles Link as of v3) and
  added `shouldRerenderOnTransaction: true` to prevent a real regression in
  the toolbar's live active-state highlighting, which v3 would otherwise
  have silently broken. Verified beyond typecheck/build by building a
  temporary, uncommitted test route to exercise the editor in a browser
  (the real component is admin-gated, no real auth exists yet) — confirmed
  Bold/Heading active-state highlighting and the Link command both still
  work correctly. `npm audit` now 52 -> 26 vulnerabilities, still 0
  critical/high. This also closes out the review of every remaining `npm
  audit` finding from this build's dependency work: everything left is
  either a devDependency with no production attack surface (`eslint`,
  `drizzle-kit`, their plugin ecosystems) or a low-severity finding in
  `resend` needing its own major-version review later.
- Code quality review against CODE_QUALITY_REVIEW.md, continuing the build's
  mandated reviews (security review above covers that half). Found and
  fixed three real issues: (1) `/api/cron/social-publish` claimed to
  prevent double-publishing on an overlapping cron run but used a plain
  `UPDATE...WHERE id=` with no status guard — fixed with the same atomic
  claim pattern the Stripe webhook handler already uses correctly; (2)
  `getOrCreateStripePrice` had the same read-then-write race on a brand-new
  product's `stripePriceId`, fixed the same way; (3) the public
  `SiteHeader` nav wrapped mid-label ("Books &" / "Studies", "Log" / "in")
  at mobile widths — caught by actually testing at 375px in a browser, not
  just reading code — fixed with the same `overflow-x-auto
  whitespace-nowrap` pattern RESPONSIVE.md already documents for the admin
  nav. No unwired-column bugs found (the historical `imageAlt`/
  `coverImageAlt` pattern AUDIT.md warns about) — all alt-text columns are
  fully wired through validation, API, and `alt=` rendering. No debug
  console.log/TODO/suppressed-lint leftovers found.
- Full security review against the scaffold-specific checklist in
  SECURITY_REVIEW.md (not just this session's diff — per CLAUDE.md,
  scaffold code is always in scope). Three real findings, all fixed: (1)
  High — `/api/progress` checked authentication but not entitlement,
  letting any logged-in user write progress for lessons they never
  purchased (named verbatim in SECURITY_REVIEW.md's test list); (2) Medium
  — `/checkout/success?orderId=` rendered any order's items/total/shipping
  address with no ownership check, an IDOR exposing PII to anyone holding
  the link; (3) Low — the cron secret was compared with plain `===`
  instead of a constant-time comparison. Also fixed one code-quality item:
  `app/leader/layout.tsx` re-implemented the leader/admin role check
  instead of calling `requireLeaderOrAdmin()`. The `/api/progress` fix's
  authorization logic was verified directly against real local Postgres
  rows (not just that it compiles); the other two rest on code review since
  they need a real logged-in session to exercise end-to-end. `SECURITY.md`
  updated to reflect all three. See git log for full detail per finding.
- First real local run-through: installed Postgres 16 via Homebrew, ran
  `db:migrate` + `db:seed` against it, started `next dev`, and clicked
  through the homepage, `/books`, `/blog`, `/login`, a product detail page,
  and added an item to cart in a real browser — all pages 200, no console
  errors. Fixed `drizzle.config.ts` to load `.env.local` itself (via
  Node's built-in `process.loadEnvFile()`, no new dependency), since
  `drizzle-kit` is a separate CLI that doesn't get this from Next.js the
  way `next dev`/`next build` do. Added `.claude/launch.json` so the dev
  server can be started/previewed directly going forward.
- Scaffold imported into the Soul Dust Revival project folder as the build
  base (study-platform-scaffold @ `1e497e7`), with its own git history
  started here. `npm install` and `npm run verify` (typecheck/lint/build)
  pass clean with placeholder env values in a local-only `.env.local`.
  `.env.example` added (wasn't present in the scaffold) covering every var
  `lib/env.ts` validates. `eslint.config.mjs` now excludes the separate
  "Soul Dust Revival Design System" brand-assets repo that lives inside this
  folder. `npm audit` flagged 2 critical / 12 high findings in dependencies
  (`next`, `dompurify` via `isomorphic-dompurify`, and others); `npm audit
  fix` (non-breaking) resolved all critical findings and 9 of 12 high ones,
  down to 54 total (3 high: `drizzle-orm`, `next`'s bundled `postcss`,
  `zod`), each requiring a `--force` semver-major bump — deferred pending
  deliberate review of breaking changes to the ORM, framework, and
  validation layer.
- Reviewed and applied the `zod` v3 -> v4 bump (3.25.76 -> 4.6.7) after
  checking every usage in `lib/validation/schemas.ts`/`lib/env.ts` against
  the breaking-changes list — none of the removed v4 APIs are used here.
  Runtime-verified `checkoutSchema` behavior is unchanged. `npm audit` down
  to 53 (2 high remaining: `drizzle-orm`, `next`'s bundled `postcss` —
  still deferred, each needs its own major-bump review).
- Reviewed and applied the `drizzle-orm` bump (0.36.4 -> 0.45.4) after
  reading the full changelog across that range against this codebase's
  usage — no `$onUpdate`, `sql.identifier()`/`sql.as()`, vector/array
  columns, explicit `.prepare()`, or `db.transaction()` calls exist here,
  and the relational `db.query.*` API in use is the untouched RQBv1 (the
  breaking RQBv2 changes are 1.0.0-rc only). `npx drizzle-kit generate` ran
  as a compatibility check and produced the first real migration,
  `drizzle/0000_spotty_barracuda.sql` (17 tables, correct `gen_random_uuid()`
  defaults and FKs) — not yet applied to any database. `npm audit` down to
  52 (1 high remaining: `next`'s bundled `postcss`, needs a Next 15->16
  bump, still deferred).
- Reviewed and applied the Next.js bump (15.5.28 -> 16.4.4) after reading
  the official upgrade guide in full against this codebase: no middleware,
  no `revalidateTag`, no parallel routes, already-async
  cookies()/headers()/draftMode(), no custom image quality/local images
  with query strings, no custom webpack config, Node/TypeScript already
  above the new minimums. Two things the bump itself required: rewrote
  `eslint.config.mjs` for `eslint-config-next@16`'s new native flat-config
  export (no more `@eslint/eslintrc` FlatCompat bridge), and rewrote
  `lib/cart/CartContext.tsx`'s localStorage hydration from
  `useEffect`+`setState` to `useSyncExternalStore` — the new
  `react-hooks/set-state-in-effect` rule correctly flagged a real latent
  hydration-mismatch risk, not just style. Now builds with Turbopack.
  `npm audit`: **0 critical, 0 high** remaining (52 total, all
  moderate/low).
- Closed all three previously-flagged gaps: (1) print stylesheet added, with
  study/lesson content deliberately excluded from printing since the physical book is
  a separately sold product — CSS-based, not DRM, honestly documented as such;
  (2) Facebook multi-Page picker for accounts managing more than one Page; (3) a real
  `/privacy` policy page plus self-service data export and account deletion
  (`/account`), including anonymize-not-delete handling for orders and a
  last-admin-can't-delete-themselves guard
- AI suggestions for both social posts and blog posts now draw from real lesson
  text content (not just study titles/descriptions), via a shared
  `lib/ai/projectContext.ts`; blog gets its own admin authoring UI (list/new/edit)
  with the same AI-suggest-with-refresh-and-accept pattern as social
- Full social media scheduling: connections (Claude/X/Facebook/Instagram), composer
  with live per-platform character limits, cron-driven publish + metrics fetch,
  X token refresh, social analytics report
- Role-based access control (admin/leader/user), login/session access reporting,
  leader resource section, country capture at checkout, sales reporting
- Homepage, `/books` catalog, `/blog`, full brand design system
- Full accessibility (WCAG 2.1 AA), responsive/cross-browser, and security hardening
  passes, each verified by an actual `tsc`/`eslint`/`next build` run, not just written
