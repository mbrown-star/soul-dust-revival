# Code Quality Review Instructions — Soul Dust Revival

Run this review on every build. Review the code changed in the current build first, then check how it fits the rest of the codebase.

## How to run
1. Identify the scope: files added or changed since the last reviewed build.
2. Run the project's linter, formatter, type checker, and test suite. Report failures.
3. Walk each checklist section below and report findings using the format at the bottom.
4. Fix Critical and High findings before the build is considered done. Apply low-risk cleanups directly; ask before larger refactors.

## Checklist

### 1. Correctness
- Logic matches the stated requirement. Edge cases handled: empty, null, large, duplicate, concurrent, and failure inputs.
- Errors are handled deliberately: no swallowed exceptions, no silent failures, useful messages.
- Async code awaits properly, cleans up resources, and avoids race conditions.

### 2. Readability and consistency
- Names describe intent. Functions do one thing and are short enough to follow.
- Code matches the surrounding style, naming, and structure. Comments explain why, not what.
- No dead code, commented-out blocks, stray debug output, or unresolved TODOs without a ticket.

### 3. Structure and duplication
- No copy-pasted logic that should be shared. Reuse existing helpers before adding new ones.
- Clear separation of concerns (UI, business logic, data access). No circular dependencies.
- Abstractions are justified by actual use, not speculation.

### 4. Tests
- New behavior has tests, including failure paths. Bug fixes have a regression test.
- Tests are deterministic, independent, and check behavior rather than implementation details.
- Existing tests still pass. Coverage did not drop meaningfully.

### 5. Performance
- No obvious N+1 queries, unbounded loops, repeated expensive work, or large payloads.
- Database queries are indexed where needed. Lists are paginated.
- Frontend: no unnecessary re-renders, oversized assets, or blocking work on the main thread.

### 6. Maintainability
- Configuration and magic values are named constants or settings.
- Public interfaces are typed and documented. Breaking changes are called out.
- Dependencies are justified and minimal.
- README or docs updated when setup, behavior, or architecture changes.

### 7. Accessibility and UX (if user-facing)
- Semantic markup, keyboard access, labels, sufficient contrast, alt text.
- Loading, empty, and error states exist and are clear.
- Works at mobile and desktop widths.

### 8. Git hygiene
- Changes are focused and described in clear commit messages. No unrelated edits or generated files committed.

## Scaffold-specific checks (study-platform-scaffold stack)
Apply these in addition to the general checklist. Many come from real bugs recorded in the scaffold's `AUDIT.md`.

- **`npm run verify` passes clean** (typecheck, lint, build). No suppressed errors, `@ts-ignore`, or disabled lint rules to get green. Report the actual result.
- **Strict TypeScript.** `strict` and `noUncheckedIndexedAccess` stay on. Avoid non-null assertions (`!`) unless provably safe and commented. Guard `.returning()` results from inserts instead of destructuring blindly.
- **Next.js 15 patterns.** `cookies()`, `params`, and `searchParams` are Promises and must be awaited. `useSearchParams()` sits inside a `<Suspense>` boundary. Pages that read the database use `export const dynamic = "force-dynamic"`.
- **Schema changes are fully wired.** A new column must reach migrations, seed data, forms' initial values, API schemas, and display. (The scaffold shipped `imageAlt` and `coverImageAlt` unwired twice.) Enum-like columns use `.$type<>()`. Generate and review migrations; check for `NOT NULL` pitfalls on existing data.
- **Single sources of truth.** Access, roles, validation, and pricing go through `lib/entitlements`, `lib/admin/guard`, `lib/validation/schemas.ts`. Flag duplicated checks.
- **Data and async safety.** Atomic updates for status transitions. No race conditions in webhooks, cron jobs, or reordering. External calls (Stripe, R2, Stream, Resend, social APIs) handle failure, timeouts, and retries sensibly, and errors are logged rather than discarded.
- **Cloudflare/edge compatibility.** No Node-only APIs in code that runs on the edge runtime. Database connections use the Supabase pooler URL.
- **Images and fonts.** Use `next/image` with remote patterns configured for R2. Fonts load via `next/font`. Note that the font fetch needs normal internet during build.
- **Accessibility (WCAG 2.1 AA).** Alt text required on images, captions or transcripts on video, keyboard-operable drag-and-drop, focus management, no `jsx-a11y` lint errors, `prefers-reduced-motion` respected. Check against `ACCESSIBILITY.md`.
- **Responsive.** Mobile-first, touch targets sized per `RESPONSIVE.md`, works on the browserslist targets.
- **Design system.** Uses the Tailwind tokens and fonts defined in `tailwind.config.js`. No ad hoc colors or fonts.
- **Tests.** Vitest is set up (`npm test`), with coverage of the checkout → webhook → entitlement flow specifically (pricing integrity, webhook idempotency, entitlement checks — see `lib/entitlements/check.test.ts`, `lib/stripe/products.test.ts`, `lib/stripe/webhook-handlers.test.ts`, `app/api/checkout/route.test.ts`). These run against the real local Postgres (see BUILD_TASKS.md), not a mocked DB, per this project's own preference for testing real behavior over asserting against mocks. New work should add tests the same way: real DB where the behavior under test is DB logic, `vi.mock()` only for genuine external services (Stripe, Resend). Bug fixes get a regression test (e.g. the race-condition fixes already have one).
- **Docs kept current.** `BUILD_TASKS.md` updated (checked items, "Recently completed"). `SECURITY.md`, `PRIVACY.md`, `ACCESSIBILITY.md`, and `README.md` updated when relevant behavior changes. Scaffold deviations recorded in `CLAUDE.md`.
- **Unverified work.** State what was not exercised against live services or a real database, as `AUDIT.md` does.

## Report format
For each finding:
- **Severity:** Critical / High / Medium / Low / Nit
- **Location:** `path/to/file:line`
- **Issue:** what is wrong
- **Recommendation:** specific change

End with a summary: tool results (lint, types, tests), counts by severity, what was fixed, what remains, and a clear pass/fail for the build.
