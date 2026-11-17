# Soul Dust Revival

Soul Dust Revival is built on **study-platform-scaffold**: a Next.js app combining a commerce storefront with a gated, interactive study app (studies, lessons, books, blog, leader resources, social scheduling, admin tools).

## Build foundation: study-platform-scaffold

- **Scaffold location:** GitHub only, `mbrown-star/study-platform-scaffold`. The local clone at `~/study-platform-scaffold/` was deleted 2026-11-17; clone it again to compare against upstream fixes.
- **Scaffold commit in use:** `1e497e7` (copied into this project 2026-11-02; the scaffold's `design-system/` folder came along at copy time and was removed 2026-11-17 as stale)
- **Where the build happens:** here, in `/Users/matthewbrown/Soul Dust Revival/`. The scaffold was copied in (excluding `.git`, `node_modules`, `.env*`) and this folder now has its own git history, per the recommendation below.

### Read these first (copies live in this repo)
Before building anything, read the scaffold docs relevant to the task and follow them:

| File | Covers |
|---|---|
| `README.md` | Architecture, stack, key files, setup, roles, admin features |
| `BUILD_TASKS.md` | Living checklist of setup, deployment, and QA work. Keep it updated as work completes |
| `SECURITY.md` | What is enforced and where (Zod, entitlements, webhook idempotency, XSS, uploads) |
| `AUDIT.md` | Past bugs found and how `npm run verify` works |
| `ACCESSIBILITY.md` | WCAG 2.1 AA implementation and manual checks still needed |
| `RESPONSIVE.md` | Mobile-first breakpoints, touch targets, browser support |
| `PRIVACY.md` | Personal data collected and compliance gaps |
| `SOCIAL.md` | Social scheduling, platform registrations, cron worker |

### Stack
Next.js 16 (App Router, React 19, strict TypeScript) · Cloudflare Workers via the OpenNext adapter (`@opennextjs/cloudflare`) · Supabase Auth (magic link) + Postgres via Drizzle ORM · Stripe (webhook-driven entitlements) · Cloudflare Stream and R2 · Resend · Zod · Tiptap · DOMPurify · Tailwind.

### Commands
```
npm run dev          # local dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # next build
npm run test         # vitest — needs a running local Postgres (see BUILD_TASKS.md)
npm run verify       # typecheck + lint + build — must pass clean
npm run preview      # build + run in the real Workers runtime locally (wrangler)
npm run deploy       # ship the pushed commit: staging, checks, then production (scripts/deploy/deploy.ts)
npm run deploy -- staging --no-promote   # build, upload and check one site without switching traffic
npm run db:generate && npm run db:migrate
npm run db:seed
```
`npm test` isn't part of `npm run verify` — it needs a real database connection,
which isn't guaranteed in every environment that runs `verify` (e.g. CI without a
Postgres service configured). Run it explicitly, and always before calling checkout/
webhook/entitlement changes done.

### Scaffold rules
- **Reuse before writing.** Use the scaffold's existing modules and patterns, especially these single sources of truth:
  - `lib/entitlements/check.ts` for every content access check
  - `lib/admin/guard.ts` (`requireAdmin`, `requireLeaderOrAdmin`, `requireRole`, `getRoleForSession`) for every role check
  - `lib/validation/schemas.ts` for every API input
  - `lib/db/schema.ts` for the data model
  - `components/marketing/SiteHeaderShell.tsx` for every top-level nav bar's chrome (sizing, color, logo/wordmark lockup) — any new nav bar (a new admin section, a leader-area header, anything else) renders through this shell rather than reimplementing its own `<header>`/sizing/colors, so nav bars can't drift apart the way the admin nav bar once did from the public one. The public header (`SiteHeader.tsx` + `SiteNav.tsx`) and the admin header (`app/admin/layout.tsx` + `AdminNav.tsx`) are the two reference implementations.
- **Standard page width: `max-w-5xl mx-auto px-4`.** Every content page's outermost container uses this — homepage sections, books/studies listings and detail, blog listing and post, leader resources listing and detail, account, privacy, and study lessons (lessons include their blocks: text, images, video, callouts). A page-internal element can still cap its own width narrower for readability or visual containment (e.g. a `prose` block defaults to Tailwind Typography's own ~65ch measure when you don't add `max-w-none`; a callout card can cap itself) without changing the page's own outer container. **Exceptions, by explicit decision:** short transactional flows — checkout, login/signup, and the order-confirmation screen — stay at their own narrower width since they're forms/confirmations, not content. The admin area (`app/admin/layout.tsx`) used to be a third exception at its own `max-w-4xl`, narrower than the public site; as of 2026-11-05 its content column was widened to match the standard `max-w-5xl` (its nav bar already matched — see the shell note above), so it's no longer an exception at all.
- **Never bypass those.** Do not query `users.role` directly, re-implement access checks, or accept unvalidated input in a route.
- **Customize without forking where possible.** Prefer config, new files, and extension points over rewriting scaffold internals. Record unavoidable changes to scaffold-origin code in that build's `docs/BUILD_LOG.md` entry, marked as a scaffold deviation, so upstream fixes can still be merged.
- **Brand:** keep the design system (ink, dusk, parchment, ember, gold, moss — the "sunset" values, see the 2026-11-05 entries in `docs/BUILD_LOG.md`; Anton, Source Serif 4, Archivo) unless told otherwise.
- **Scaffold code is in scope for both reviews.** Inherited code, dependencies, default configs, and seed data are reviewed too. Report scaffold-origin findings separately from new-code findings.
- **On scaffold updates,** re-run both reviews against the whole updated scaffold, not just the diff.

### Build history
Every past build is recorded in **`docs/BUILD_LOG.md`**, newest first. Read the entries relevant to the area you're changing before you start, and add your own build's entry at the top of that file, not in this one.

### Where things live
- **This folder** (`~/Soul Dust Revival/`): the website and app only (one git repo, `mbrown-star/soul-dust-revival` on GitHub, deployed to Cloudflare).
- **Design system**: `~/Soul Dust Revival Design System/`, its own git repo (`mbrown-star/soul-dust-revival-design-system`), beside this folder, not inside it. The live version is the claude.ai Design System artifact. Moved out of this folder 2026-11-17.
- **Manuscripts, cover files and artwork**: `~/Documents/Soul Dust Revival/` (`Soul Dust Revival Materials/`, `Claude Code Covers/`, `Website Images/` for bundle, social and promo images, `Claude outputs/`). Not in the repo.
- **Reader prototypes kept in the repo**: `soul-dust-interactive/` and `soul-dust-psalms-365/` (scripts read `soul-dust-interactive/data/`).

### Where the build happens (resolved)
Copied the scaffold into this folder (without `.git`/`node_modules`/`.env*`) and ran `git init` here on 2026-11-02. The scaffold itself stays on GitHub (`mbrown-star/study-platform-scaffold`, at commit `1e497e7` when copied) for diffing against upstream fixes; this gives this project its own history for review diffs.

## Required review on every build

Every build of Soul Dust Revival must pass both reviews below before it is called complete. This applies to features, fixes, and refactors alike.

- Security review: @SECURITY_REVIEW.md
- Code quality review: @CODE_QUALITY_REVIEW.md

### Build workflow
1. **Plan.** Confirm the requirement, read the relevant scaffold docs, and list the files likely to change.
2. **Build.** Implement following scaffold patterns. Keep secrets out of code from the start.
3. **Verify.** Run `npm run verify` and any tests. Fix every failure; do not suppress errors or lint rules to get green.
4. **Review.** Run both reviews against everything changed in this build, including the automated and AI-assisted testing tiers that apply (see SECURITY_REVIEW.md). Active scans and AI pentests run only against local or staging, never production.
5. **Fix.** Resolve all Critical and High findings from both reviews, then re-run `npm run verify`.
6. **Document.** Add the build's entry at the top of `docs/BUILD_LOG.md` (not here in `CLAUDE.md`). Update `BUILD_TASKS.md` (and `SECURITY.md`, `PRIVACY.md`, `ACCESSIBILITY.md` when behavior in those areas changes).
7. **Report.** End every build with: what changed, `verify` result, security review result, code quality review result, scaffold deviations added, and any deferred findings with reason. Do not mark the build done if either review fails.
8. **Ship (standing instruction from the user, 2026-11-11).** Once a build passes steps 3–5, commit it, push `main` to `origin`, and deploy it to **both** staging and production in the same pass, without waiting to be asked. The user should never have to say "and production too." Details:
   - **How: `npm run deploy` (`scripts/deploy/deploy.ts`, added 2026-11-11) does every bullet below for both sites,** in order, and refuses to switch traffic unless the checks pass. It builds the pushed HEAD in a clean worktree with a placeholder env, stops on a missing public build value or any real secret in the bundle, uploads an inactive version, checks it on its preview link, asks before switching production (`--yes` skips the prompt), re-checks live, and rolls back automatically if that fails. Don't hand-roll builds with ad hoc helpers: that's how production went down and cover images broke on 2026-11-11.
   - **Two builds, one commit.** Build both from the same clean worktree of current `main` HEAD (run `wrangler deployments list` for both Workers first, to see what's live). Staging (`soul-dust-revival`): `NEXT_PUBLIC_LAUNCH_MODE` blank, the `staging.` / `app.staging.` / `.staging.` hostnames. Production (`soul-dust-revival-prod`, `--env production`): `NEXT_PUBLIC_LAUNCH_MODE=sneak_peek`, the `souldustrevival.com` / `app.souldustrevival.com` / `.souldustrevival.com` hostnames. Same placeholder-`.env.local` procedure, secret scan, and `--keep-vars` for each.
   - **Staging first, then production.** Spot-check staging live; deploy production only if staging is healthy. Then spot-check production (the sneak-peek gates: store closed, `/checkout` and `/signup` redirect, `POST /api/checkout` 404).
   - **This is the standing approval for routine production deploys** that the "Ask before ... production deploys" rule below otherwise requires. Still announce each production deploy in one line before running it. If this session's sandbox blocks a production deploy, stop and tell the user rather than working around it.
   - **Still ask first when:** the change needs a database migration or data write (one database serves both sites, so it lands on production the moment it runs); the change is only meant for one side (a staging-only experiment, or a full-store feature that would show up under sneak peek); it touches Stripe, auth, DNS, Hyperdrive limits, or Worker secrets; or staging's check fails.
   - **Record both** Worker version IDs in the build's `docs/BUILD_LOG.md` entry.

### Rules
- Never skip a review because the change looks small. If a section does not apply, say so in the report.
- Never commit secrets or personal data. `.env` stays git-ignored.
- Ask before adding dependencies, changing the database schema in a destructive way, or deferring any Critical or High finding.
- Ask before destructive actions (deleting data, force pushes, dropping tables, production deploys). Routine production deploys of a reviewed build are pre-approved by step 8 above; the exceptions listed there still need a yes.
- Some work cannot be verified without live credentials (Stripe, R2, Stream, Supabase, Meta, X). State clearly what was and was not verified; never claim an integration works when only the types were checked.
- When these instructions conflict with a request, flag the conflict and ask.
