# Architecture Audit

This documents a full pass through the codebase looking for real bugs — not a read-through,
an actual `npm install`, `tsc --noEmit`, `eslint`, and `next build` run against the scaffold,
with every failure traced to a fix rather than suppressed. Re-run `npm run verify` any time
to repeat this whole chain.

## Bugs found and fixed

**Type safety**
- Enum-like schema columns (`products.type`, `products.format`, `orders.status`,
  `entitlements.source`, `contentBlocks.type`, `lessonProgress.status`) were declared as
  plain `text()`, so Drizzle inferred them as generic `string` everywhere — silently
  defeating every literal-union type used in components downstream. Fixed with Drizzle's
  `.$type<>()` at the schema root, so this is enforced once, centrally, instead of
  needing a cast at every call site.

**Next.js 15 breaking changes** (this codebase was written against pre-15 API shapes
in a few places)
- `cookies()` in `lib/supabase/server.ts` was called synchronously; Next 15 made it
  return a `Promise`. Fixed the function and both call sites (`lib/auth/session.ts`,
  `app/auth/callback/route.ts`).
- `params`/`searchParams` on five page components (product edit, study edit, lesson
  editor, the public lesson page, checkout success) were typed and destructured
  synchronously; Next 15 made both `Promise`s. All five fixed.
- `/login` and `/signup` call `useSearchParams()` without a Suspense boundary — this
  doesn't just warn, it **breaks the production build entirely** in Next 15. Fixed by
  wrapping both in `<Suspense>`.

**Data integrity / defensive coding**
- Several `.returning()` calls were destructured (`const [x] = await db.insert(...)`)
  and used immediately without checking `x` existed — added explicit guards that fail
  loudly (checkout route, study import route, seed script) instead of silently trusting
  an insert always returns exactly one row.
- `app/api/stream/sign-url/route.ts` used `lesson!`/`study!` non-null assertions with
  no actual guard behind them — if a content block ever had a dangling `lessonId`
  (orphaned data), this would throw an unhandled runtime error instead of a clean 404.
  Fixed with explicit checks, matching the pattern already used in the responses route.
- Swept the whole codebase for remaining non-null assertions (grep for `!` after
  identifiers, excluding the legitimate `process.env.X!` pattern): four remained, three
  are provably safe given validation earlier in the same function (documented inline),
  one (the Stripe webhook's signature header) was tightened from an implicit
  exception-path check to an explicit guard for clarity.
- **Race condition in Stripe webhook idempotency**: the original guard read
  `order.status`, then updated it later — under Stripe's at-least-once delivery, two
  near-simultaneous redeliveries of the same event could both pass a "not yet paid"
  check before either had written. Fixed by making the status transition itself the
  check: a single atomic `UPDATE ... WHERE status != 'paid' RETURNING *`, so at most one
  concurrent call can ever win it.
- `lib/stripe/client.ts` had a hardcoded Stripe API version string that didn't match
  what the installed SDK's own types actually expect — verified the correct value
  directly from the SDK's type definitions rather than guessing again.

**Two recurring "field added to schema, never wired into the form" bugs** — same
mistake made twice in the accessibility pass: `imageAlt` and `coverImageAlt` were added
to the database schema but never actually passed into the product/study edit pages'
initial form values, so editing an existing product/study would always show an empty
alt-text field even if one had been saved. Both fixed.

**Homepage/books/blog pages defaulted to static generation**
- The new public content pages (`/`, `/books`, `/books/[slug]`, `/blog`, `/blog/[slug]`)
  query the database directly, but Next.js doesn't know to treat that as a reason to
  render dynamically — left alone, it tries to prerender them once at build time. That's
  a real, meaningful bug for this site specifically: product/blog content changes
  whenever an admin adds something, and a statically frozen build would never show new
  products or posts until the next code deployment, not just a performance nitpick.
  Fixed by adding `export const dynamic = "force-dynamic"` to all five, confirmed by
  actually building with an unreachable placeholder database first (which failed with
  `ECONNREFUSED` during static generation, proving the bug), then again after the fix
  (which passed, correctly rendering them as dynamic `ƒ` routes instead).

**Tooling gaps** (these meant real problems were going undetected, not bugs themselves)
- No ESLint config existed at all in the project — meaning zero linting had ever run,
  including the `jsx-a11y` accessibility rules bundled with Next's config, despite the
  accessibility work already done elsewhere. Configured properly (`eslint.config.mjs`,
  pinned to the Next 15-compatible config version — installing without pinning pulled a
  Next 16-targeted config that broke immediately with a circular-reference error).
- Running lint then surfaced: three `react/no-unescaped-entities` errors (raw
  apostrophes/quotes in JSX text — fixed with proper HTML entities), one unused-variable
  warning in the Stripe webhook's catch block (fixed by actually logging the error
  instead of discarding it, which also improves production debuggability), and several
  `<img>` usages that should be `next/image` for real LCP/bandwidth benefit — converted
  the admin list thumbnails (fixed known size) and the public lesson image block (using
  Next's documented pattern for responsive images with unknown intrinsic dimensions),
  plus added the R2 remote-image pattern to `next.config.js` so `next/image` can actually
  optimize images served from R2.

## One thing this pass could not verify in this sandbox
`next/font/google` (used for the homepage/marketing typography — Fraunces, Source Serif
4, Archivo) fetches font files from Google Fonts at build time. This sandbox's network
is restricted to package registries and doesn't allow `fonts.googleapis.com` (confirmed
directly: a request there returns `403` from the egress proxy, consistent with it not
being on this sandbox's domain allowlist — not a bug in the code). This is standard,
correct Next.js usage that will work normally on any real host (Cloudflare Pages,
Vercel, etc. all have unrestricted internet access during build). To isolate this from
the rest of the new pages, the build was re-run with the font imports temporarily
stripped — it passed cleanly, confirming the five new pages have no other issues hiding
behind the font-fetch failure. Worth doing a real `npm run build` once this repo is
somewhere with normal internet access, just to see the actual fonts load correctly —
but there's no reason to expect a problem there.

## How to re-run this verification
```
npm install
npm run verify   # typecheck + lint + build, in that order
```
Each step fails fast and points at the specific file/line — treat a clean `verify` run as
the baseline before considering any future change to this codebase "done."

## What this pass did NOT cover
- **No live database was available**, so nothing here proves runtime query correctness
  against real Postgres/Supabase — only that the TypeScript types are internally
  consistent. Run `npm run db:seed` against a real Supabase project and manually
  exercise checkout → webhook → entitlement → lesson access once real credentials exist.
- **No live Stripe/R2/Cloudflare Stream credentials were available**, so the actual
  external integrations (webhook delivery, presigned uploads, signed playback URLs)
  are unverified beyond their TypeScript types matching each SDK's expectations.
- This was a static/build-time audit, not a security penetration test or a full manual
  QA pass — see `SECURITY.md` and `ACCESSIBILITY.md` for what's specifically been
  addressed in those domains, and their own "still needs manual verification" sections.
