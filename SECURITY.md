# Security Notes

This scaffold follows a "server is the only trust boundary" model: every write, every
entitlement check, and every price comes from the server/DB, never from client input.
Below is what's enforced, where, and why — treat this as a starting checklist for review
before launch, not a guarantee of completeness.

## Auth cookie flags
`lib/supabase/server.ts`, `lib/supabase/client.ts`, and `proxy.ts`'s own internal client
all build their `cookieOptions` from `lib/domains.ts`'s `sessionCookieOptions()` — the
single source of truth for this, rather than three hand-duplicated literals. It passes an
explicit `{ secure: true, sameSite: "lax" }` to `@supabase/ssr`'s client constructors,
rather than relying on the library's own default (which does not set `Secure` at all).
`httpOnly: false` is the library default and is kept as-is — it's an inherent trade-off of
this cookie-based SSR auth pattern (the browser client needs to read/refresh the session
cookie), not a bug; it does mean a future XSS gap would have direct access to the session
cookie, which is one more reason the DOMPurify sanitize-on-write/render pattern above
matters.

**Cookie domain scope (marketing/app subdomain split).** `sessionCookieOptions()` also sets
`domain` once `NEXT_PUBLIC_MARKETING_HOSTNAME`/`NEXT_PUBLIC_APP_HOSTNAME`/
`NEXT_PUBLIC_COOKIE_DOMAIN` are configured (see `lib/domains.ts`, and CLAUDE.md's entry on
the subdomain split) — a leading-dot parent domain (e.g. `.souldustrevival.com`) so the
session is shared between the marketing and app subdomains, letting a visitor log in on
either and be authenticated on both. `lib/env.ts` requires all three vars together or none,
so a staggered rollout fails loudly at boot rather than silently breaking cross-subdomain
auth. **This widens the cookie's scope to every current and future subdomain of the
configured parent domain**, not just the two intended hosts — before setting
`NEXT_PUBLIC_COOKIE_DOMAIN` in a real environment, confirm no other subdomain (an old
staging host, a demo Worker subdomain, etc.) should be untrusted with this session cookie.

**Logout clears both cookie forms.** `POST /api/auth/logout` (used by every logout button
through `lib/auth/logOut.ts`) revokes the session with Supabase and then expires every
`sb-` cookie twice: host-only, and on the configured parent domain. A browser that signed in
before `NEXT_PUBLIC_COOKIE_DOMAIN` was set can still hold a host-only copy, which a
domain-scoped delete doesn't remove, so logging out client-side alone left that visitor
signed in. Other cookies (e.g. Cloudflare Access's `CF_Authorization`) are never touched.
Unset (local dev today), the cookie stays host-only, unchanged from before the split
existed.

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
- **Creating and editing users is also admin-only** (`/admin/users`, `POST`/`PUT
  /api/admin/users`). `POST` creates a new user through Supabase Auth's admin API
  (`createUser` with the email already confirmed — sign-in is emailed-code only, so
  there's no password to set and no invite link is sent; the person signs in at `/login`
  like anyone else, and gets a plain "your account is ready" email with no link or code
  in it) and only then inserts the corresponding `users` row, rolling back the just-created
  auth account if the insert fails (e.g. a concurrent duplicate-email race), so a failed
  create never leaves an orphaned login with no app-side row. `PUT` edits an existing
  user's email/full name/country; an email change is pushed to Supabase Auth first via
  `updateUserById` and the `users` row is only updated once that succeeds, keeping the two
  in sync. Neither endpoint touches `role` — role changes stay exclusively on the existing
  `PATCH` endpoint and its self-role-change guard above, so creating/editing a user is never
  a path to self-escalation (only an existing admin can call these routes at all).
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

### Reader access and admin preview
All reader access to a study goes through `getStudyAccess()` in `lib/entitlements/check.ts`:
an entitlement to the study's linked product, **or** the admin role. Admins get in so the
lesson builder's "Preview as reader" works; they already control all of this content in the
admin console, so this grants nothing new, and anything they save while previewing (answers,
progress) is scoped to their own account. Only admins can open an unpublished study or lesson
in the reader. The reader lesson page also requires the lesson to belong to the study in its
URL. Before 2026-11-10 it loaded any lesson id under any study the visitor was entitled to,
so a buyer of one study could read another study's lessons by editing the URL. Used by the
reader pages, `/api/progress`, `/api/responses`, and `/api/stream/sign-url`. `My Library`'s
"Start over" (`/api/progress/reset`) stays entitlement-only.

## Draft and publish (unpublished lesson changes)

A published lesson has two versions: the **working copy** the admin builder edits (`content_blocks` rows and `lessons.study_content`), and a frozen **published snapshot** (`lessons.published_content`) that readers see. All the rules are in `lib/lessons/publishedContent.ts`. What keeps unpublished changes away from readers:

- **Reader page** (`app/(study-app)/studies/[slug]/[lessonId]/page.tsx`): renders the snapshot whenever one exists. `?draft=1` shows the working copy **only** when `getLessonAccess` reports an admin preview. The devotional Year/Journal views take each published day's question from its snapshot.
- **Video/audio signing** (`app/api/stream/sign-url`): readers can sign only media in the snapshot. Media that exists only in the draft returns 404 for them. The request's `draft: true` (sent from the preview page) is honored only for admins.
- **Answers** (`app/api/responses`): on a published lesson with a snapshot, a reader may answer only a question the snapshot shows (404 otherwise). Admins previewing may answer draft questions.
- **Writes** are admin-only (`requireAdmin()`, unchanged). Each working-copy write first freezes the pre-edit content if the lesson has no snapshot yet, inside the same transaction, with the lesson row locked.
- **Removing a block the snapshot shows** sets `content_blocks.removed_at` instead of deleting it, because answers reference it by foreign key. Every working-copy read filters `removed_at is null`.
- **Not drafted, and live on save:** title, Published, Free sample, lesson order.

## Deleting accounts and blocking emails (`/admin/users`)
- `DELETE /api/admin/users` and `/api/admin/blocked-emails` are `requireAdmin()` routes
  with `.strict()` Zod input. An admin can't delete or block themselves, or delete or
  block another admin (demote first), so one click can't lock out the admin team.
- **A block is enforced twice** (`lib/auth/blockedEmails.ts`):
  1. The email's Supabase auth account is banned (`ban_duration` about 100 years), so a
     sign-in code for it never verifies. An email with no account gets a banned
     placeholder account, which also stops sign-up, since sign-up only signs in to the
     existing account for that email. Deleting with "also block" deletes the person's
     own auth account first and then bans a placeholder, so their old (anonymized)
     `users` row can never be signed into again.
  2. `getSession()` treats a session whose email is in `blocked_emails` as signed out,
     so a session issued before the block, or one that got past step 1, reaches no
     page or route. `/api/auth/login-recorded` ends such a session and the sign-in
     form says the email can't be used.
- If the Supabase ban fails, the app-side block (2) still holds and the admin is told.
  Unblocking keeps the row if Supabase refuses, so the two stay in step.
- **Not covered:** a different address for the same person (plus-addressing, Gmail
  dots, a new address) isn't blocked; guest physical checkout takes an email but no
  sign-in, so it isn't blocked either. The sign-in form's blocked message reveals that
  an email is blocked (the same enumeration trade-off as below).
- `getSession()` now does one indexed lookup in `blocked_emails` per signed-in request.
  It fails closed: if the table is unreachable, signed-in pages error rather than
  skipping the check. Apply the migration before deploying code that reads it.

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

## Sneak-peek launch mode
A build with `NEXT_PUBLIC_LAUNCH_MODE=sneak_peek` (`lib/launchMode.ts`) has no store. That
is enforced server-side, not just by removing links: `/books*` and `/checkout*` (including
`/checkout/success`) redirect home from their layouts, `/api/checkout` returns 404 before
reading the request, and `/signup` redirects to `/sneak-peek`. The Stripe webhook is
unchanged. The mode is baked in at build time, so no request can switch it. The sample
signup form creates an account for a new email and signs in an existing one with the same
response, so it doesn't add an account-enumeration channel beyond the `/login` trade-off
below.

## Free-sample lessons
A lesson marked `lessons.isSample` can be opened by any signed-in reader, without
owning the study, as long as the lesson and its study are both published. This is
decided per lesson by `getLessonAccess` in `lib/entitlements/check.ts`, and every reader
path that acts on a lesson asks about that specific lesson, never the whole study: the
lesson page, `/api/progress`, `/api/responses` (via the answer's content block), and
`/api/stream/sign-url` (via the video's content block). So sample access can't be
stretched to a study's other lessons by changing an id. `/api/progress/reset` lets a
sample reader clear only their own progress on sample lessons. Which lessons are samples
is admin data (set by `scripts/mark-sample-lessons.ts`), not something a request can
influence.

## The Journey's pacing
A bundle presented as a Journey (`journeys`, `journey_enrollments`) is read one week at a
time, in order (`lib/journey/schedule.ts`). The pacing is enforced in the same place as
every other reader check, `getLessonAccess`: for a non-admin, a lesson in a published
Journey is allowed only if it's already finished or it's the reader's open stop. So the
lesson page, `/api/progress`, `/api/responses` and `/api/stream/sign-url` all refuse a stop
that isn't open, whatever id a request names. The rhythm is stored server-side and only
changes through `PATCH /api/journey/enrollment`, which re-anchors from today and never opens
the next stop sooner than a week after the last one, so switching days can't speed the
Journey up. Enrollment routes act only on the caller's own enrollment and require owning
every Part (`getJourneyAccess`). Admins previewing are never paced. Readers who own only some
Parts aren't paced at all (they read what they own as ordinary studies). Known trade-off:
the time zone comes from the reader's browser once, when he begins, so choosing a far-east
zone (up to UTC+14) opens each week up to about a day early. It's a one-time, bounded choice
and only affects his own pace.

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
Lesson content (text and callout blocks), leader resources, and blog posts are all
authored as HTML via the same Tiptap WYSIWYG editor (`components/admin/RichTextEditor.tsx`)
and rendered with `dangerouslySetInnerHTML`. To keep this safe:
- HTML is sanitized through the single `sanitizeHtml()` helper in `lib/sanitize/html.ts`
  **on write** (`app/api/admin/content-blocks/route.ts`, `app/api/admin/studies/import/route.ts`,
  `app/api/admin/leader-resources/route.ts`, `app/api/admin/blog/posts/route.ts`) and
  **again on render** (`components/study/LessonBlock.tsx`, `app/(marketing)/blog/[slug]/page.tsx`,
  `app/leader/[id]/page.tsx`). Sanitizing twice is deliberate — it means the stored data is
  safe even if a future change adds another way to write to this table.
- This matters even though only admins can author content today, because "only trusted
  people can write this" is exactly the assumption that erodes over time as products add
  more contributors, imports, or integrations.
- The blog post body was markdown through 2026-11-05; it's now sanitized HTML like the
  other rich-text fields (see `lib/db/schema.ts`'s `posts.body` comment and CLAUDE.md's
  2026-11-05 entry for the migration).
- **`sanitizeHtml()` uses `sanitize-html` with an explicit tag/attribute allowlist, not
  DOMPurify.** The original `isomorphic-dompurify` dependency pulled in `jsdom`, which isn't
  Cloudflare Workers-compatible (crashes on a missing filesystem the moment `.sanitize()` is
  actually called — invisible in local dev, which has a real filesystem). Two DOMPurify +
  pure-JS-DOM-shim replacements (`linkedom`, then `happy-dom`) were tried and both **silently
  returned dangerous input unsanitized** instead of crashing — confirmed by hand with
  `<script>`/`onerror` payloads before either shipped. `sanitize-html` parses HTML directly
  with no DOM dependency at all, avoiding that whole failure class. `lib/sanitize/html.test.ts`
  has regression tests asserting specific dangerous payloads are actually stripped — don't
  touch `lib/sanitize/html.ts` without running that file's tests, since a green `npm test` run
  on its own previously provided false confidence here (nothing in the existing suite asserted
  on sanitize() output at all).

## Linked (external) media in lesson blocks
Since 2026-11-10 an image, video, or audio block can point at a file hosted elsewhere
instead of an upload (`content_blocks.image_url` / `media_url`, set from the admin lesson
builder's "Use a link" option):
- Only `https://` URLs are accepted (`httpsUrlSchema` in `lib/validation/schemas.ts` --
  plain `z.string().url()` would also accept `javascript:`, `data:`, and `http:`). The same
  rule now also covers `imageUrl` and `captionsUrl`.
- Each block type may only write its own columns (`FIELDS_BY_TYPE` / `fieldsOutsideType()` in
  `lib/content/blocks.ts`, enforced by `app/api/admin/content-blocks/route.ts`), and a block
  plays from either an uploaded Stream asset (`media_id`) or a linked URL, never both.
- **CSP:** `img-src` and `media-src` in `proxy.ts` allow any `https:` origin, so linked files
  can load. Images and media can't execute script; `script-src`/`connect-src` are unchanged.
  The reader renders a non-R2 image as a plain `<img referrerpolicy="no-referrer">` rather than
  widening `next/image`'s `remotePatterns`.
- **Trade-off, stated in the admin UI:** a linked video/audio URL is a permanent, shareable link
  anyone with the lesson can copy, unlike an uploaded file's expiring signed Stream URL. Use
  uploads for anything that should stay behind the purchase. Loading a linked file also sends
  the reader's IP address to that host (see PRIVACY.md).
- **Media inside a Study week** (`studyContent` `media`/`tabMedia`, same field rules via
  `weekMediaSchema`): callout HTML is sanitized on save in `app/api/admin/lessons/route.ts`
  and again on render. An uploaded video/audio there is signed by `{lessonId, mediaId}`.
  `/api/stream/sign-url` signs it only if that id is actually in the lesson's week, and
  for both signing paths refuses an unpublished lesson or study unless the viewer is an
  admin previewing, the same rule as the reader page.
- Caption files now upload through their own `/api/admin/captions-upload-url` (`text/vtt`
  only, and the **server** picks the R2 key, so a caller can't aim the upload at an existing
  object). They previously went through the image-only `/api/admin/upload-url`, whose
  allowlist rejected `text/vtt`, so caption uploads could never succeed.

## File uploads
- **Product/study/lesson images**: only `image/jpeg`, `image/png`, `image/webp`,
  `image/gif` are accepted (enforced server-side in `uploadUrlSchema`) — the presigned
  R2 URL is never issued for other content types.
- **Upload keys are always server-generated** (as of 2026-11-11). Every upload-link
  route picks its own `crypto.randomUUID()` key: `/api/admin/upload-url` takes only a
  `folder` from a fixed list (`products`, `bundles`, `social`, `content`) and stores
  `{folder}/{uuid}.{extension from the content type}`; `/api/admin/leader-file-upload-url`
  stores `leader-resources/{uuid}.pdf`; captions and covers already did this. The
  schemas are `.strict()`, so a request that still sends a `key` is refused, and no
  caller can name, overwrite or escape into an existing object. (Until this date the
  image and leader-PDF routes accepted a client-chosen key, guarded only by a character
  allowlist and a `..` check.)
- **Study resources are gated downloads** (as of 2026-11-11). A study's downloadable PDFs (`study_resources`) are uploaded through `/api/admin/study-resource-upload-url` (admin-only, PDF only, up to 100 MB, signed for the exact size). Unlike every other upload, that route returns only the server-chosen key (`study-resources/<uuid>.pdf`), never a public URL.
  - `POST /api/admin/study-resources` accepts only a key matching that pattern, and takes the size and type from R2 (`HeadObject`), which also confirms the upload finished.
  - Readers download through `GET /api/study-resources/[id]`. It requires a session (otherwise it redirects to sign-in), hides a draft study from everyone but admins (404), and requires `getStudyAccess` (owner or admin; 403 otherwise, including free-sample readers). It then redirects to a 5-minute signed GET with `Content-Disposition: attachment` under the file's own name, sent `Cache-Control: private, no-store`.
  - The key never reaches a reader's browser. Note the bucket also has a public r2.dev domain, so the object is reachable there by anyone who knows its key; the key is a random UUID that's never published, so the signed link is the only way to it in practice.
  - Removing a resource deletes its R2 object; deleting a study removes its resources and their files.
- **Upload size caps are enforced by R2 itself** (as of 2026-11-11). Each route's Zod
  schema requires the file's exact `size` and caps it (`lib/uploads/limits.ts`: images
  20 MB, captions 2 MB, leader PDFs 100 MB, cover PDF 25 MB, cover crops 30 MB), and
  `createPresignedUploadUrl` signs that `ContentLength` into the link
  (`X-Amz-SignedHeaders=content-length;host`). Checked against the real bucket: a link
  signed for 100 bytes refused bodies of 99, 101 and 5,000 bytes (403) and a chunked
  upload with no Content-Length (403), and stored only the exact 100. So a link can't
  be reused for a bigger file, and the cap holds even for a caller who skips the admin
  UI. The browser checks the same caps first only to show a clear message.
- **Video/audio uploads to Cloudflare Stream** (`/api/admin/stream-upload-url`, `lib/stream/upload.ts`): as of 2026-11-11 these use Stream's resumable (tus) direct creator upload.
  - **The server's part:** the route is admin-only and Zod-validated (`streamUploadSchema`: `size` up to Stream's 30 GB, plus a filename). It reserves one upload of exactly that size, using the Stream API token, which stays server-side. The reservation is private (`requiresignedurls`), capped at 4 hours of media (`maxDurationSeconds`), and expires in 6 hours. The browser gets back only the one-time tus URL and the video's uid.
  - **The browser's part** (`components/admin/builder/tusUpload.ts`): it sends the bytes straight to Stream, so they never pass through our server.
  - **Resuming after a reload:** an unfinished upload's one-time URL is remembered in the admin's `localStorage`, keyed by file name, size and modified time, for up to 5 hours. That URL can only ever receive that one reserved file.
- **Study document imports** (`.docx`/`.pdf`) are capped at 25MB server-side before
  parsing, bounding worst-case parse time from an oversized upload.
- **Book cover PDF uploads** (`lib/images/uploadBookCover.ts`,
  `app/api/admin/cover-upload-urls/route.ts`): as of 2026-11-10 the PDF is split in
  the admin's own browser, not on the server -- a 300ppi KDP cover decodes to far
  more than a Workers isolate's 128MB. The server's only role is
  `/api/admin/cover-upload-urls` (`requireAdmin()`, Zod-validated
  `coverUploadUrlsSchema`), which issues 5-minute presigned PUTs under one fresh
  `crypto.randomUUID()` folder -- every key server-generated, never
  client-supplied (unlike `uploadUrlSchema` above). Trade-offs: the 25MB source-PDF
  cap and the pixel/page-size guards (`extractCoverImage` in
  `lib/images/bookCover.ts`: ~60in per side, 40 megapixels in the browser) now run
  client-side, so they protect the admin's tab rather than the server; and the
  stored crops are whatever the admin's browser produced. Both are acceptable
  because only an admin can obtain the upload links, and each link is signed for its
  file's exact size (the source PDF's cap and the crops' cap are enforced by R2, see
  above). The stored source
  PDF is still parsed server-side by `scripts/reprocess-book-covers.ts` (Node, run
  by hand), which treats it as untrusted input with the same guards.

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

**On the deployed Worker, the connection goes through Cloudflare Hyperdrive, not
`DATABASE_URL` directly.** `lib/db/client.ts`'s `getDb()` is an async factory — a
Workers environment forbids reusing a database client/connection created during one
request's handling in a later request, so a fresh `node-postgres` `Client` is created
per call, pointed at `env.HYPERDRIVE.connectionString` when that binding is present
(the deployed Worker) and at `DATABASE_URL` directly otherwise (local dev, vitest,
`scripts/seed.ts`). Hyperdrive pools and TLS-terminates the real connection to Supabase
on Cloudflare's side, so creating a client per request is cheap, not a new TCP+TLS
handshake per request. Every caller of `db` therefore calls `await getDb()` locally
rather than importing a shared singleton — do not reintroduce a module-level `db`
export, since that reintroduces the cross-request I/O error Workers raises for exactly
this pattern.

## Contact form (`/contact`, `/api/contact`)
Added 2026-11-11. Signed-in readers send a name, email, message and up to 5 screenshots,
which the route emails to `admin@souldustrevival.com` (`CONTACT_INBOX` in
`lib/email/send.ts`) through Resend.
- **Signed-in only**: the route returns 401 without a session, so an anonymous visitor
  can't use it to send email or push 20 MB bodies at the Worker.
- **Fields** go through `contactMessageSchema` (trimmed, bounded; the email must parse).
  An optional `page` (the referrer, so a bug report says where it happened) is kept only
  if it starts with `http(s)://`. Every field is HTML-escaped in the email (`escapeHtml`
  now escapes quotes too); the subject strips line breaks.
- **Screenshots are never stored.** They're read in memory and attached to the email.
  Each must be PNG, JPEG, WebP or GIF *by its bytes* (`detectScreenshotType`), not by the
  browser's Content-Type or filename; attachment names are ours (`screenshot-1.png`).
  Caps: 5 files, 10 MB each, 20 MB total (`lib/uploads/limits.ts`), so the base64 email
  stays under Resend's 40 MB. A declared `Content-Length` over the cap is refused (413)
  before the body is read. A chunked body with no length is read before its size is
  known; acceptable for a signed-in-only route, but a Cloudflare body-size or rate rule
  on `/api/contact` would close it.
- **Reply-To** is the address the person typed, so a reply goes straight to them. If it
  differs from the signed-in account's email, the email says which account sent it.
- A Resend refusal is a 502 to the person ("didn't send"), never a false success; the log
  line carries only Resend's error text, never the message or the person's details.
- **Not rate-limited in the app**: a signed-in account could send many messages. Add
  `/api/contact` to the Cloudflare rate-limiting rule below.

## Rate limiting (not built into the app — configure at the platform level)
No custom rate limiter is built into the app code, to avoid adding a stateful
dependency (e.g. Redis) for a concern the hosting platform already handles well:
- **Cloudflare** (already your host) — set Rate Limiting Rules in the dashboard for
  `/api/checkout`, `/api/responses`, `/api/progress`, `/api/contact`, and `/login`. This is free-tier
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
