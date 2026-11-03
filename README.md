# Study Platform Scaffold

Next.js app combining a commerce storefront with a gated, interactive study app.

**See [`SECURITY.md`](./SECURITY.md) for a full rundown of what's enforced and where —
input validation, authorization boundaries, webhook idempotency, XSS/upload safety,
and what's intentionally left to platform-level configuration (rate limiting).**

**See [`ACCESSIBILITY.md`](./ACCESSIBILITY.md) for what's implemented against WCAG 2.1 AA
— required alt text, video captions/transcripts, keyboard-operable drag-and-drop,
focus management, and what still needs manual verification before launch.**

**See [`RESPONSIVE.md`](./RESPONSIVE.md) for the mobile-first breakpoint strategy,
touch-target sizing, viewport config, and cross-browser support target.**

**See [`AUDIT.md`](./AUDIT.md) for a full architecture audit — real bugs found via an
actual `tsc`/`eslint`/`next build` run (not just a read-through) and how to re-verify
with `npm run verify`.**

**See [`PRIVACY.md`](./PRIVACY.md) for what personal data is collected and why
(including the country field captured at checkout), and what a real compliance posture
still needs beyond this codebase — published privacy policy, data subject request
handling, retention limits, sub-processor agreements.**

**See [`SOCIAL.md`](./SOCIAL.md) for the social media scheduling feature — required
platform app registrations, the companion cron-trigger deployment this needs (Cloudflare
Pages has no built-in cron), character limits, and known limitations.**

**See [`BUILD_TASKS.md`](./BUILD_TASKS.md) for the living, continuously-updated build
checklist — hand this to Claude Code to work through systematically.**

## Public storefront pages
`/` (homepage), `/books` + `/books/[slug]` (catalog + detail), and `/blog` +
`/blog/[slug]` are real, live pages — not stubs — reading directly from the
`products`/`posts` tables. All five are rendered dynamically per-request
(`export const dynamic = "force-dynamic"`) rather than statically at build time,
since product/blog content changes whenever an admin adds something and a static
build would otherwise freeze that content until the next deploy.

## Design system
- **Color**: `ink` #17231f, `dusk` #2a4038, `parchment` #f7f2e6, `ember` #de3a2e,
  `gold` #f0b93e, `moss` #4b6358 — registered in `tailwind.config.js`.
- **Type**: Fraunces (display/headlines), Source Serif 4 (body — this app's actual job
  is long-form reading), Archivo (nav/UI) — loaded via `next/font/google` in
  `app/layout.tsx`. These fetch from Google Fonts at build time, which needs normal
  internet access (see `AUDIT.md` for a note on verifying this outside a restricted
  sandbox).
- **Signature element**: the homepage hero (`components/marketing/DustHero.tsx`) is a
  horizon panel with dust motes drifting upward on a slow CSS animation — a direct,
  literal rendering of Psalm 119:25 ("my soul clings to the dust... revive me") rather
  than a generic hero pattern. Respects `prefers-reduced-motion` (see `ACCESSIBILITY.md`).

## Stack
- **Hosting:** Cloudflare Pages/Workers
- **DB:** Supabase Postgres via Drizzle ORM
- **Auth:** Supabase Auth (magic link), wired in `lib/auth/session.ts`, `lib/supabase/`, `app/auth/callback`
- **Payments:** Stripe, webhook-driven entitlements
- **Video/audio:** Cloudflare Stream, signed URLs generated per-request
- **Images/files:** Cloudflare R2
- **Email:** Resend
- **Validation:** Zod on every API route input (`lib/validation/schemas.ts`)

## Setup
1. `cp .env.example .env` and fill in credentials
2. `npm install`
3. `npm run db:generate && npm run db:migrate`
4. `npm run db:seed` — loads one sample study with a text/callout/video/question lesson
5. `npm run dev`

**Migration note**: `orders.country` is `NOT NULL` with no default, since every order
should have gone through the checkout page's required country field going forward. This
is only a concern if you're migrating an existing database with pre-existing order
rows — a fresh Supabase project has none, so this just works. If you ever do have
existing orders, backfill `country` on them (or add a temporary default) before running
the migration that adds the `NOT NULL` constraint, or Postgres will reject it.

## Supabase notes
One Supabase project covers both Auth and the database — no separate DB vendor needed.
- **Connection string:** use Supabase's **connection pooler** URL (Session or Transaction
  mode, found under Project Settings → Database) rather than the direct connection —
  this matters because Cloudflare Workers/edge runtimes open many short-lived connections,
  which a direct Postgres connection isn't built to handle at scale.
- **`users` table:** this app keeps its own `users` table (in `lib/db/schema.ts`) alongside
  Supabase's built-in `auth.users` table, reusing the same UID as the primary key
  (see `app/auth/callback/route.ts`). This is intentional — `auth.users` is managed by
  Supabase internally and isn't meant to be extended directly with app-specific columns
  like `role`.

## Key files to know
- `lib/db/schema.ts` — full data model (users, entitlements, studies, lessons, content_blocks, responses, progress, posts)
- `lib/entitlements/check.ts` — single source of truth for access control; call this everywhere you gate content
- `lib/stream/signing.ts` — Cloudflare Stream signed URL generation
- `lib/stripe/webhook-handlers.ts` — turns a paid Stripe order into entitlement rows
- `components/study/LessonBlock.tsx` — renders any block type (text/video/audio/question) from the flexible content model

## Not yet wired up
- Nothing left as an intentional stub — auth, payments, video/audio, images, product
  admin, content authoring/import, and email are all wired to real services below.
  What's still needed from you is creating accounts and filling in `.env` values.

## Hosting
Cloudflare Workers via the OpenNext adapter (`@opennextjs/cloudflare`, configured in
`wrangler.jsonc`/`open-next.config.ts`). Zero egress fees, and the same Cloudflare
account also covers Stream (video/audio) and R2 (images/files) below — one account,
three products. `npm run preview` builds and runs the app in the real Workers runtime
locally (via `wrangler`); `npm run cf:deploy` builds and deploys it. The bundled Worker
is currently ~5.2MB gzipped — over the Workers Free plan's 3MiB script limit, fine on
the $5/mo Paid plan — see BUILD_TASKS.md's "Known gaps" for the tradeoff.

## Email
Order confirmation emails go through **Resend** (`lib/email/send.ts`) — picked for its
generous free tier (3,000 emails/month), clean API, and native fit with Next.js/TypeScript.
The email content is composition-aware, matching the same physical/digital/mixed logic
as the confirmation page: physical-only orders get an order + shipping summary with no
login prompt; digital/mixed orders get the summary plus a "log in to access your content"
button linking back to the app.

## Auth notes
Using Supabase's magic-link (passwordless) flow, with `/login` and `/signup` as
**distinct pages** (`components/auth/AuthForm.tsx`), not just different copy on the same
form:
- `/signup` can create a new account (`shouldCreateUser: true`) — the entry point for
  first-time buyers.
- `/login` only signs in an existing account (`shouldCreateUser: false`) — submitting an
  unrecognized email returns an error pointing to `/signup` instead of silently creating
  an account.
- `/auth/callback` exchanges the magic-link code for a session and creates a matching
  row in our own `users` table, reusing the Supabase auth UID as the primary key so no
  separate mapping table is needed.
- See `SECURITY.md` for the account-enumeration trade-off this distinction introduces.

## Checkout & cart notes
- Cart is client-side, multi-item, persisted to `localStorage` (`lib/cart/CartContext.tsx`).
- **Digital/webapp content requires an account** — the checkout page blocks proceeding
  until the user logs in if the cart contains any digital item.
- **Physical-only carts allow guest checkout** — just an email for the confirmation.
- Stripe Products/Prices are created lazily and cached (`lib/stripe/products.ts`) —
  you only manage products in your own `products` table, never in the Stripe dashboard directly.
- **Discounts** use Stripe's built-in promotion codes (`allow_promotion_codes: true` on
  the Checkout Session) — create codes in the Stripe dashboard or via API, no custom
  discount logic needed. The order's stored total is updated from Stripe's actual
  charged amount (`session.amount_total`) after payment, so discounts show correctly
  on the confirmation page.
- Order composition drives the post-purchase experience:
  - **Physical only** → success page shows order + shipping info; confirmation emailed, no login prompt.
  - **Digital/webapp only** → success page shows order info + a "log in to access your content" button.
  - **Mixed** → success page shows order + shipping info *and* the login button.
- Entitlements are granted only for `format: 'digital'` products — physical books never
  create an entitlement row, since they don't gate any content.

## Roles & access control
Three roles on `users.role`: `admin` (full admin UI + role management + reporting),
`leader` (leader resource section only), `user` (regular studies/books customer).
- `lib/admin/guard.ts` is the single place role checks happen —
  `requireAdmin()`/`requireLeaderOrAdmin()`/`requireRole([...])`. Every gated page or
  API route calls one of these rather than querying `users.role` directly.
- **First admin**: there's no self-serve "become an admin" flow, intentionally — set it
  directly in the database once:
  ```sql
  update users set role = 'admin' where email = 'you@example.com';
  ```
- **After that**, role changes go through `/admin/users` — an admin can promote/demote
  any other user. An admin *cannot* change their own role through that UI (a safety
  guard against accidentally locking yourself out); have a different admin do it, or
  fall back to the SQL above.

## Reporting
- `/admin/reports/sales` — who bought what, when, from where (country), and revenue
  totals. Reads `orders`/`order_items`/`products` directly.
- `/admin/reports/engagement` — login frequency and approximate average session length
  per user, built from the `login_events` table (one row per login, `lastActiveAt`
  nudged forward by a periodic heartbeat — see `components/study/ActivityHeartbeat.tsx`).
  This is an approximation, not an exact measurement — there's no persistent connection
  telling the server the precise moment someone closes a tab. See `PRIVACY.md` for what
  this data is and isn't used for.

## Leader resources
A simple flat content type (title + rich text + optional PDF) for group-leader-only
material, separate from the full study/lesson block model since this is typically a
handful of guides, not a multi-week curriculum.
- Admin authoring: `/admin/leader-resources`.
- Public section: `/leader` (gated to `admin`/`leader` roles — a regular `user` hitting
  this gets a plain "ask an admin" message rather than being bounced to `/login`, since
  redirecting an already-authenticated person back to login reads as broken).

## Admin (product management)
- `/admin/products` — gated to the `admin` role.
- Add/edit product forms handle title, description, price, format (physical/digital),
  active status, and image upload.
- **Product images** upload directly from the browser to Cloudflare R2 via a presigned URL
  (`lib/r2/upload.ts`, `app/api/admin/upload-url`) — files never pass through our own server.
- Editing a product's price after a Stripe Price already exists clears the cached Stripe
  IDs, since Stripe Prices are immutable — the next checkout creates a fresh one automatically.

To make your own account an admin after signing up once:
```sql
update users set role = 'admin' where email = 'you@example.com';
```

## Admin (study & lesson content authoring)
- `/admin/studies` — create/edit studies (title, slug, description, cover image, linked
  digital product) and manage their lessons.
- `/admin/studies/[id]/lessons/[lessonId]` — the lesson content editor. A lesson is an
  ordered list of blocks; each block type has its own editing UI:
  - **Text** — full WYSIWYG editor (Tiptap: bold, italic, headings, lists, links)
  - **Image** — upload straight to Cloudflare R2, same pattern as product images
  - **Video / Audio** — upload straight to Cloudflare Stream via a direct creator upload
    URL (`lib/stream/upload.ts`) — large files never pass through our own server
  - **Question** — a simple prompt field; answers are collected on the public side via
    the existing `responses` table
  - **Callout / color block** — a free-form colored section (title + background color
    via a color picker + rich text body) for things like "Key Verse," "Reflection," or
    "Prayer Prompt" — fully custom color, not a fixed preset list
- **Reordering** is full drag-and-drop (`@dnd-kit`), persisted immediately via a bulk
  reorder API call so the order survives a refresh.
- Every block edit saves immediately (no separate "save" step per block) via
  `PATCH /api/admin/content-blocks`.
- The public-facing renderer (`components/study/LessonBlock.tsx`) sanitizes all rich-text
  HTML with DOMPurify before rendering, since it's stored and rendered as raw HTML from
  the Tiptap editor.

## Importing studies from .docx / .pdf
`/admin/studies/new` has two tabs: create manually, or import from a document.

- **`.docx` import** (`lib/import/parseDocx.ts`) — converts the document to HTML via
  Mammoth, which preserves Word's own Heading 1/2 styles. Lessons are split on those
  headings, so this is the more reliable import path — it relies on structure the author
  already created in Word, not guesswork.
- **`.pdf` import** (`lib/import/parsePdf.ts`) — PDFs don't carry heading styles the same
  way, so lesson-splitting is heuristic: lines matching patterns like "Week 1", "Lesson 2",
  or "Session 3" are treated as lesson boundaries (`lib/import/splitIntoLessons.ts`). If no
  such lines are found, the whole PDF becomes a single lesson.
- Every imported study is created **unpublished**, and every imported lesson is one
  editable "text" block per section — the intent is that an admin reviews and cleans up
  the auto-generated lessons in the normal block editor before publishing, not that import
  is a one-click final result.
- The original uploaded file is stored in R2 (`studies.source_file_url` /
  `source_file_name`) and linked from the study edit page, so you can always go back to
  the source document while cleaning up the import.
