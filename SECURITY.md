# Security Notes

This scaffold follows a "server is the only trust boundary" model: every write, every
entitlement check, and every price comes from the server/DB, never from client input.
Below is what's enforced, where, and why — treat this as a starting checklist for review
before launch, not a guarantee of completeness.

## Auth cookie flags
`lib/supabase/server.ts` and `lib/supabase/client.ts` both pass an explicit
`cookieOptions: { secure: true, sameSite: "lax" }` to `@supabase/ssr`'s client
constructors, rather than relying on the library's own default (which does not set
`Secure` at all). `httpOnly: false` is the library default and is kept as-is — it's an
inherent trade-off of this cookie-based SSR auth pattern (the browser client needs to
read/refresh the session cookie), not a bug; it does mean a future XSS gap would have
direct access to the session cookie, which is one more reason the DOMPurify
sanitize-on-write/render pattern above matters.

## Server-side fetches of external URLs (SSRF)
`publishToX` (`lib/social/publishers/x.ts`) fetches a post's image server-side before
uploading it to X's media endpoint. This `imageUrl` is restricted to the app's own
`R2_PUBLIC_BASE_URL` origin (checked before the fetch) — it is never allowed to be an
arbitrary admin-supplied URL, which would otherwise let a compromised/malicious admin
session make the server fetch internal network addresses. Facebook/Instagram
publishing passes the image URL to Meta's Graph API instead, which fetches it on Meta's
own infrastructure, so this risk is specific to the X publisher.

## Input validation
Every API route validates its input with a Zod schema (`lib/validation/schemas.ts`)
before touching the database. This catches malformed requests, enforces sane bounds
(cart size, text length, price ceilings, hex color format, slug format), and rejects
anything that doesn't match — rather than trusting client-shaped JSON directly.

## Authorization
- **`lib/entitlements/check.ts`** is the single source of truth for "can this user access
  this content" — every gated page and API route calls this, rather than each place
  re-implementing its own access check.
- **`lib/admin/guard.ts`** is now a three-tier role system (`admin`/`leader`/`user` on
  `users.role`, replacing an earlier boolean `is_admin`), with `requireRole([...])` as
  the underlying check and `requireAdmin()`/`requireLeaderOrAdmin()` as convenience
  wrappers. Every gated page or API route calls one of these rather than querying
  `users.role` directly. There's no self-serve path to becoming an admin — the first
  admin is set directly in the database, intentionally, to avoid a privilege-escalation
  surface.
- **Role changes are admin-only** (`/admin/users`, `PATCH /api/admin/users`), and an
  admin cannot change their own role through that endpoint — a deliberate guard against
  a single misclick locking the only admin account out of the admin section with no one
  left able to restore it.
- The `responses` and `progress` API routes both verify the content block's/lesson's
  parent study is one the requesting user actually has an entitlement for — not just
  that they're logged in — before accepting a submitted answer or progress update.
  (`progress` was missing this check until a build-time review caught it; fixed to
  mirror `responses`.)
- `/checkout/success?orderId=...` checks the order belongs to the requesting session
  before rendering it (items, total, shipping name/address) — an order UUID alone isn't
  enough. Guest orders (no `userId`) have no account to check against, so the link
  itself is the credential there, the same trade-off most storefronts' guest-order
  confirmation pages make.
- `/api/cron/*` compares the `Authorization` header against `CRON_SECRET` via a
  SHA-256-digest + `crypto.timingSafeEqual` comparison, not plain `===`, so a timing
  attack can't be used to recover the secret byte-by-byte.
- The admin rich-text editor (`components/admin/RichTextEditor.tsx`) runs Tiptap v3+,
  not v2 — v2.x had a real XSS (GHSA-cp6q-959q-f8rh, `mergeAttributes()` turning an own
  `__proto__` key into inherited executable DOM attributes). This mattered here
  specifically because the `.docx`/`.pdf` study-import feature loads hostile document
  content into this exact editor for the importing admin to review, a path the
  DOMPurify-sanitize-on-write/render pattern elsewhere doesn't cover (that protects the
  public render, not the editor's own HTML parsing while editing).

## Signup vs. login trade-off (account enumeration)
`/login` and `/signup` are functionally distinct, not just different copy on the same
form: login sets Supabase's `shouldCreateUser: false`, so submitting an email with no
existing account returns an error ("We couldn't find an account for that email"),
directing the person to `/signup` instead. This is a genuine, deliberate trade-off worth
being explicit about: **it reveals whether a given email has an account** on this
platform (submit it to `/login` — an error means no account, success means one exists).
This is a well-known and generally accepted UX trade-off (most consumer apps with
separate login/signup flows have exactly this property), but it is a real account
enumeration side channel. If that risk matters more than the UX clarity for your
audience, the alternative is a single unified auth form that always attempts sign-in and
falls back to account creation silently, at the cost of a slightly more ambiguous first
run for new users.

## Pricing integrity
The checkout route never trusts a price from the client. The client sends only
`productId` + `quantity`; the actual `priceCents` is always looked up server-side from
the `products` table. This closes the common e-commerce vulnerability where a modified
client request could check out at an arbitrary price.

The checkout route also rejects any product with `sellOnStripe: false` — an admin can
mark a physical product Amazon-exclusive, and that's enforced server-side, not just by
hiding the "Buy Now" button in the UI.

## Amazon purchase links
Physical products can carry an `amazonUrl` the storefront renders as an outbound
"Buy on Amazon" link (`components/commerce/AmazonBuyButton.tsx`). Because this becomes
an `<a href>` shown to every visitor, `productSchema` (`lib/validation/schemas.ts`)
validates it by *parsing the URL* and checking `protocol === "https:"` plus an
end-anchored regex against `url.hostname` — never a regex over the raw URL string,
which is bypassable by a lookalike host such as `amazon.com.evil.com` (the real
registrable domain is `evil.com`, but a start-anchored/unanchored-at-the-end regex over
the full string can still match). `amazonUrl` is admin-only input (behind
`requireAdmin`) and is restricted to `format: "physical"` products — digital products
can only sell through Stripe, since entitlements are granted off the Stripe webhook and
an Amazon sale has no equivalent.

## Webhook idempotency
Stripe redelivers webhook events (retries, at-least-once delivery). The checkout webhook
handler checks `order.status === 'paid'` before granting entitlements or sending the
confirmation email, so a redelivered event is a no-op rather than a duplicate charge
side-effect (duplicate entitlement rows, duplicate emails).

## XSS / rich text
Lesson content (text and callout blocks) is authored as HTML via a WYSIWYG editor and
rendered with `dangerouslySetInnerHTML`. To keep this safe:
- HTML is sanitized with DOMPurify **on write** (`app/api/admin/content-blocks/route.ts`,
  `app/api/admin/studies/import/route.ts`, `app/api/admin/leader-resources/route.ts`,
  `app/api/admin/blog/posts/route.ts`) and **again on render**
  (`components/study/LessonBlock.tsx`, `lib/markdown.ts` for the blog). Sanitizing twice
  is deliberate — it means the stored data is safe even if a future change adds another
  way to write to this table.
- This matters even though only admins can author content today, because "only trusted
  people can write this" is exactly the assumption that erodes over time as products add
  more contributors, imports, or integrations.
- The blog post body is stored as markdown (not HTML), so DOMPurify runs against the raw
  markdown source on write — this strips any literal HTML an author embeds, while
  leaving normal markdown syntax untouched. The authoritative sanitize is still the one
  at render time in `lib/markdown.ts`, after `marked` converts markdown to HTML.

## File uploads
- **Product/study/lesson images**: only `image/jpeg`, `image/png`, `image/webp`,
  `image/gif` are accepted (enforced server-side in `uploadUrlSchema`) — the presigned
  R2 URL is never issued for other content types.
- **Upload keys**: the study document importer (`app/api/admin/studies/import/route.ts`)
  always generates its own `crypto.randomUUID()` key server-side. The general-purpose
  `uploadUrlSchema`/`resourceFileUploadUrlSchema` (used by product/study/lesson image
  uploads and leader-resource PDFs), however, still accept a client-supplied key — the
  UI always builds a safe `{random-uuid}.{extension}` key today, but the schema itself
  only enforces a character allowlist plus a refine rejecting `..` path segments
  (closing literal path traversal), not server-side key generation. **Known gap**: this
  means any other caller hitting these routes directly (requires `requireAdmin()` first)
  could overwrite an arbitrary existing R2 key. Fixing this properly means generating
  the key server-side in the route and ignoring any client-supplied key entirely — not
  done yet, flagged in CLAUDE.md's 2026-11-03 security-review entry pending a decision.
- Direct-to-R2 presigned PUT URLs (`lib/r2/upload.ts`) have no enforced upload size cap
  — also a known gap, see the same CLAUDE.md entry.
- **Study document imports** (`.docx`/`.pdf`) are capped at 25MB server-side before
  parsing, bounding worst-case parse time from an oversized upload.
- **Book cover PDF uploads** (`app/api/admin/products/cover-pdf/route.ts`,
  `lib/images/bookCover.ts`): same 25MB input-size cap as study imports, enforced
  before parsing. Unlike a plain image upload, this one is processed entirely
  server-side (not a direct-to-R2 presigned PUT), so all three resulting R2 keys
  (source PDF + back/front cover images) are fully server-generated, never
  client-supplied. Because a PDF's declared image dimensions aren't bounded by its
  compressed file size (a small file can decode to an enormous pixel buffer),
  this also checks the page's physical size (rejects anything over ~60in per
  side) before extracting the image, and the extracted image's pixel count
  (rejects over 50 megapixels) before any further processing — both guard
  against a crafted PDF trying to force a large decode allocation. The physical
  page-size check is the more meaningful of the two, since it runs before pdf.js
  decodes anything; see the code comment in `lib/images/bookCover.ts` for why it
  isn't a complete guarantee on its own.

## Environment variables
`lib/env.ts` validates all required environment variables at server startup
(`instrumentation.ts`), so a missing or malformed credential fails immediately with a
clear message — instead of surfacing later as a confusing runtime error mid-request.

**Cloudflare deploys specifically:** `opennextjs-cloudflare build` bakes whatever
`.env`/`.env.local` is present at build time — every value, not just
`NEXT_PUBLIC_*` ones — as plaintext into the deployed Worker's bundled source
(`.open-next/cloudflare/next-env.mjs`), confirmed locally by building with dummy
values and finding every secret name/value from `.env.local` present verbatim in the
build output. **Never build/deploy with real production secrets in `.env`/
`.env.local`.** Build and deploy with placeholder values, then set every real value
as a Cloudflare dashboard variable/secret on the Worker (or `wrangler secret put`)
*after* deploying — those are what the Worker actually reads at request time, and
`opennextjs-cloudflare deploy -- --keep-vars` on later deploys keeps a redeploy from
reverting them to the build-time placeholders. See BUILD_TASKS.md's Deployment
section for the full sequence.

## Database access model (important to understand)
This app connects to Postgres directly via Drizzle using a connection string, **not**
through `supabase-js` with Row Level Security policies. That means **RLS policies you
set in the Supabase dashboard are not consulted** for this app's queries — the API route
code itself is the entire authorization boundary (see "Authorization" above).

This is a legitimate architecture, but it means: **never expose `DATABASE_URL` to the
client**, and any future direct-from-browser Supabase client usage you add would need
its own RLS policies, since it would bypass the checks in `lib/entitlements` and
`lib/admin/guard` entirely.

## Rate limiting (not built into the app — configure at the platform level)
No custom rate limiter is built into the app code, to avoid adding a stateful
dependency (e.g. Redis) for a concern the hosting platform already handles well:
- **Cloudflare** (already your host) — set Rate Limiting Rules in the dashboard for
  `/api/checkout`, `/api/responses`, `/api/progress`, and `/login`. This is free-tier
  available and requires no code changes.
- **Supabase Auth** already throttles magic-link requests per email address at the
  project level (configurable under Auth settings), which limits email-bombing abuse
  on `/login` independent of any Cloudflare rule.

## Security headers
`next.config.js` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Strict-Transport-Security`, and a restrictive `Permissions-Policy` on every route (and
`public/_headers` mirrors the same set for the handful of pages Cloudflare serves as
static assets, bypassing the Worker entirely — see "Cloudflare deploys specifically"
above).

**Content-Security-Policy** is set in `proxy.ts` (Next.js's proxy/middleware file) with
a fresh, random nonce generated per request:
- `script-src` is strict: `'nonce-{random}' 'strict-dynamic'`, no `'unsafe-inline'` —
  an attacker who manages to inject an inline `<script>` (e.g. a gap in the
  DOMPurify-sanitized rich text elsewhere in this doc) still can't get it to execute,
  since it won't carry the per-request nonce. Next.js automatically applies the nonce
  to its own framework/hydration scripts; this app doesn't yet load any third-party
  script that would need the nonce threaded through manually (see Next's docs on
  reading `headers().get('x-nonce')` in a Server Component if one gets added later).
- `style-src` deliberately has **no** nonce, just `'self' 'unsafe-inline'` — this app
  uses inline `style={{}}` React props in a few places (e.g. the homepage's animated
  decorative dust motes). CSP's nonce mechanism only covers `<style>` elements, never
  `style=""` attributes, and once a nonce is present in a directive, nonce-aware
  browsers ignore `'unsafe-inline'` for that whole directive — so a nonce on
  `style-src` would have silently broken every inline style with no working fallback.
  Confirmed this exact failure mode by testing against the real `wrangler dev` runtime
  before settling on this split. Style-based injection is a much narrower attack
  surface than script execution, so keeping the strict nonce on `script-src` only is
  the standard, accepted tradeoff.
- `connect-src`/`img-src`/`media-src` allow exactly the external hosts this app
  actually calls from the browser: Supabase Auth (`*.supabase.co`), direct-to-R2
  presigned uploads (`*.r2.cloudflarestorage.com`) and reads (the real
  `R2_PUBLIC_BASE_URL` hostname, derived the same way `next.config.js`'s image
  `remotePatterns` does), and Cloudflare Stream (direct creator upload + signed HLS
  playback). Stripe checkout needs no entry — it's a full top-level redirect
  (`window.location.href`), not an embedded fetch or frame.
- `frame-ancestors 'none'` is the modern equivalent of the `X-Frame-Options: DENY`
  header above; both are set, since older browsers only understand the latter.

**Why `proxy.ts` and not `next.config.js`'s `headers()`:** a per-request nonce can only
be generated in code that runs per-request, which `next.config.js`'s `headers()`
cannot do (it's evaluated once at build/startup). Using a nonce also means every page
must be dynamically rendered (Next.js disables static optimization for nonce'd pages) —
true of every route in this app already except `/account`, which now has `export const
dynamic = "force-dynamic"` in its (now server-only) `page.tsx` for exactly this reason;
the actual page content moved to `AccountPageClient.tsx` since route segment config
exports are silently ignored in a `"use client"` file.

**A known risk worth naming:** `proxy.ts` makes this app's Worker run through
`@opennextjs/cloudflare`'s Node.js-middleware support, which the adapter's own build
output explicitly warns is "experimental ... and not officially maintained by OpenNext
maintainers." This is unavoidable in Next.js 16 specifically — `middleware.ts` was
renamed to `proxy.ts` and now always runs in the Node.js runtime, with no edge-runtime
option to fall back to. Verified working against the real local Workers runtime
(`wrangler dev`) across the homepage, `/login`, and `/account` — hydration, styling,
and the CSP header itself all behaved correctly — but this hasn't been exercised
against a real Cloudflare deploy. Revisit if this ever causes real deploy issues.

## TypeScript
`tsconfig.json` runs in `strict` mode with `noUncheckedIndexedAccess` enabled — catches
a meaningful class of null/undefined bugs at compile time rather than runtime.

## What to revisit before real launch
- Add automated tests around the checkout → webhook → entitlement flow specifically,
  since that path is the one place a bug directly costs money or blocks paying customers.
- Consider Stripe Radar rules for fraud/chargeback signals once you have real volume.
- Rotate `CLOUDFLARE_STREAM_API_TOKEN` and R2 access keys periodically; scope the R2
  token to only the bucket this app uses, not full account access.
