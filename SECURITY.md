# Security Notes

This scaffold follows a "server is the only trust boundary" model: every write, every
entitlement check, and every price comes from the server/DB, never from client input.
Below is what's enforced, where, and why — treat this as a starting checklist for review
before launch, not a guarantee of completeness.

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
- The `responses` API route verifies the content block's parent study is one the
  requesting user actually has an entitlement for — not just that they're logged in —
  before accepting a submitted answer.

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

## Webhook idempotency
Stripe redelivers webhook events (retries, at-least-once delivery). The checkout webhook
handler checks `order.status === 'paid'` before granting entitlements or sending the
confirmation email, so a redelivered event is a no-op rather than a duplicate charge
side-effect (duplicate entitlement rows, duplicate emails).

## XSS / rich text
Lesson content (text and callout blocks) is authored as HTML via a WYSIWYG editor and
rendered with `dangerouslySetInnerHTML`. To keep this safe:
- HTML is sanitized with DOMPurify **on write** (`app/api/admin/content-blocks/route.ts`,
  `app/api/admin/studies/import/route.ts`) and **again on render**
  (`components/study/LessonBlock.tsx`). Sanitizing twice is deliberate — it means the
  stored data is safe even if a future change adds another way to write to this table.
- This matters even though only admins can author content today, because "only trusted
  people can write this" is exactly the assumption that erodes over time as products add
  more contributors, imports, or integrations.

## File uploads
- **Product/study/lesson images**: only `image/jpeg`, `image/png`, `image/webp`,
  `image/gif` are accepted (enforced server-side in `uploadUrlSchema`) — the presigned
  R2 URL is never issued for other content types.
- **Upload keys** are generated as `{random-uuid}.{extension}`, never incorporating the
  original filename directly, to eliminate any path-traversal or injection risk from a
  user-controlled filename.
- **Study document imports** (`.docx`/`.pdf`) are capped at 25MB server-side before
  parsing, bounding worst-case parse time from an oversized upload.

## Environment variables
`lib/env.ts` validates all required environment variables at server startup
(`instrumentation.ts`), so a missing or malformed credential fails immediately with a
clear message — instead of surfacing later as a confusing runtime error mid-request.

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
`Strict-Transport-Security`, and a restrictive `Permissions-Policy` on every route.

## TypeScript
`tsconfig.json` runs in `strict` mode with `noUncheckedIndexedAccess` enabled — catches
a meaningful class of null/undefined bugs at compile time rather than runtime.

## What to revisit before real launch
- Add automated tests around the checkout → webhook → entitlement flow specifically,
  since that path is the one place a bug directly costs money or blocks paying customers.
- Consider Stripe Radar rules for fraud/chargeback signals once you have real volume.
- Rotate `CLOUDFLARE_STREAM_API_TOKEN` and R2 access keys periodically; scope the R2
  token to only the bucket this app uses, not full account access.
