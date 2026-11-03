# Soul Dust Revival

Soul Dust Revival is built on **study-platform-scaffold**: a Next.js app combining a commerce storefront with a gated, interactive study app (studies, lessons, books, blog, leader resources, social scheduling, admin tools).

## Build foundation: study-platform-scaffold

- **Scaffold location:** `/Users/matthewbrown/study-platform-scaffold/` (its own git repo)
- **Scaffold commit in use:** `1e497e7` (copied into this project 2026-11-02; scaffold also had an untracked `design-system/` directory at copy time, included)
- **Where the build happens:** here, in `/Users/matthewbrown/Soul Dust Revival/`. The scaffold was copied in (excluding `.git`, `node_modules`, `.env*`) and this folder now has its own git history, per the recommendation below.

### Read these first (they live in the scaffold)
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
npm run cf:deploy    # build + deploy to Cloudflare
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
  - `lib/admin/guard.ts` (`requireAdmin`, `requireLeaderOrAdmin`, `requireRole`) for every role check
  - `lib/validation/schemas.ts` for every API input
  - `lib/db/schema.ts` for the data model
- **Never bypass those.** Do not query `users.role` directly, re-implement access checks, or accept unvalidated input in a route.
- **Customize without forking where possible.** Prefer config, new files, and extension points over rewriting scaffold internals. List unavoidable changes to scaffold-origin code under "Scaffold deviations" so upstream fixes can still be merged.
- **Brand:** keep the design system (ink, dusk, parchment, ember, gold, moss; Fraunces, Source Serif 4, Archivo) unless told otherwise.
- **Scaffold code is in scope for both reviews.** Inherited code, dependencies, default configs, and seed data are reviewed too. Report scaffold-origin findings separately from new-code findings.
- **On scaffold updates,** re-run both reviews against the whole updated scaffold, not just the diff.

### Scaffold deviations
_None yet._

### Where the build happens (resolved)
Copied the scaffold into this folder (without `.git`/`node_modules`/`.env*`) and ran `git init` here on 2026-11-02. That keeps the scaffold pristine at `/Users/matthewbrown/study-platform-scaffold/` for future diffing against upstream fixes, and gives this project its own history for review diffs.

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
6. **Document.** Update `BUILD_TASKS.md` (and `SECURITY.md`, `PRIVACY.md`, `ACCESSIBILITY.md` when behavior in those areas changes).
7. **Report.** End every build with: what changed, `verify` result, security review result, code quality review result, scaffold deviations added, and any deferred findings with reason. Do not mark the build done if either review fails.

### Rules
- Never skip a review because the change looks small. If a section does not apply, say so in the report.
- Never commit secrets or personal data. `.env` stays git-ignored.
- Ask before adding dependencies, changing the database schema in a destructive way, or deferring any Critical or High finding.
- Ask before destructive actions (deleting data, force pushes, dropping tables, production deploys).
- Some work cannot be verified without live credentials (Stripe, R2, Stream, Supabase, Meta, X). State clearly what was and was not verified; never claim an integration works when only the types were checked.
- When these instructions conflict with a request, flag the conflict and ask.
