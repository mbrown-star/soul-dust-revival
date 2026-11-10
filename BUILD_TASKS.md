# Build Task List

**This file is maintained continuously — updated every time this project changes,**
not written once and left stale. Point Claude Code at this file to work through
systematically. Checked items are done in the codebase already; unchecked items are
what's left, roughly in the order they need doing.

---

## 1. Accounts & services to set up
- [x] Cloudflare account (hosting, Stream, R2) — `wrangler whoami` confirms an
      authenticated real account. **note:** a dry-run build shows the bundled
      Worker at ~5.2MB gzipped, over the Free plan's 3MiB script-size limit,
      so budget for Workers Paid ($5/mo) to actually deploy this. See "Known
      gaps" below. Stream/R2 bindings themselves still untested against a
      real deploy.
- [x] Supabase project (Auth + Postgres — one project covers both) — connected
      to the existing "Soul Dust Revival Website/Web App Project"; see
      "Recently completed" below.
- [x] Stripe account — "Bible Studies Inc sandbox" test-mode account connected;
      `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` in `.env.local`; see
      "Recently completed" below for the verified end-to-end test
- [x] Resend account — `souldustrevival.com` domain created and verifying
      (nameservers moved to Cloudflare); sending-only API key scoped to the
      domain created and in `.env`. See "Recently completed" below.
- [x] Meta Developer app ("Soul Dust Revival") — Facebook Login for Business +
      Instagram API (Manage messaging & content on Instagram) + Manage Pages
      use cases added; `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` in `.env.local`.
      See "Recently completed" below for a scope gap found while testing.
- [x] X Developer Portal app ("Soul Dust Revival") — OAuth 2.0 (Web App,
      Read and write) configured; `X_CLIENT_ID`/`X_CLIENT_SECRET` in
      `.env.local`. Connected and tested end-to-end locally.

## 2. Environment configuration
- [ ] `cp .env.example .env` and fill in every value
- [x] Find `SUPABASE_SERVICE_ROLE_KEY` in Supabase Project Settings → API (used only
      for account self-deletion — never exposed to the client). Note: Supabase has
      moved to a new key format (`sb_secret_...` replacing the old JWT-style
      `service_role` key, `sb_publishable_...` replacing the old `anon` key) — both
      are set in `.env.local` using the new format; confirmed `lib/env.ts`'s schema
      has no format restriction, so this is a drop-in match.
- [x] Generate `TOKEN_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- [x] Generate `CRON_SECRET`: any long random string
- [ ] Register OAuth redirect URIs with X and Meta once you know your real domain:
  - `https://yourdomain.com/api/admin/connections/x/callback`
  - `https://yourdomain.com/api/admin/connections/facebook/callback`

## 3. Database
- [x] `drizzle/0004_needy_proudstar.sql` applied to the real Supabase project
      (adds `products.digitalPriceCents`/`digitalStripeProductId`/
      `digitalStripePriceId` and `order_items.variant`) — confirmed via a
      direct read against `information_schema.columns` and
      `drizzle.__drizzle_migrations`. Run via `node scripts/migrate-direct.mjs`,
      **not** `npm run db:migrate` — see the "known gap" below on why.
- [x] **Known gap: `npm run db:migrate` (`drizzle-kit migrate`) is currently
      broken against this project's Supabase connection and must not be
      relied on.** Two separate bugs found while applying migration 0004: (1)
      `drizzle.config.ts` built its connection string with `sslmode=require`,
      which a recent `pg-connection-string` major version now treats as an
      alias for `verify-full` (full certificate-chain validation) instead of
      "encrypt, don't verify" — Supabase's pooler cert isn't in Node's
      trusted CA store, so the connection fails with "self-signed certificate
      in certificate chain." Fixed by switching to `sslmode=no-verify` (same
      encryption, no chain check — see the comment in `drizzle.config.ts`).
      (2) Separately, and more seriously: **`drizzle-kit@0.31.11`'s own CLI
      swallows the real error on a failed migration and gives zero
      diagnostic output** — `bin.cjs`'s `renderWithTask` does
      `catch (err2) { terminal.reject(err2); process.exit(1); }`, which never
      prints `err2` anywhere, so a failing `npm run db:migrate` just exits 1
      with nothing on stdout or stderr, even redirected to a file. This is an
      upstream drizzle-kit bug, not specific to this project's setup. Added
      `scripts/migrate-direct.mjs`, which calls the same `drizzle-orm`
      migrator function drizzle-kit uses internally, directly — bypassing
      the broken CLI entirely and actually surfacing errors if any occur.
      **Use `node scripts/migrate-direct.mjs` for all future migrations**,
      not `npm run db:migrate`, until drizzle-kit fixes this upstream.
- [x] `npm install`
- [x] `npm run db:generate && npm run db:migrate` — ran against the real
      Supabase project (via `MIGRATION_DATABASE_URL`, which always targets it
      regardless of what `DATABASE_URL` points at locally — see the warning
      box below); see "Recently completed" below for a `drizzle-kit` env bug
      worked around and an untracked-migration fix along the way
- [x] `npm run db:seed` (loads one sample study + lesson + blog post) — done,
      against the real Supabase project
- [ ] Promote your own account to admin after signing up once:
  ```sql
  update users set role = 'admin' where email = 'you@example.com';
  ```

> ⚠️ **`DATABASE_URL` stays pointed at the real Supabase project — by
> explicit decision, so local `next dev` and the deployed site always show
> the same data, with no separate "sync" step needed.** `npm test` instead
> *always* runs against a separate local/disposable Postgres in
> `TEST_DATABASE_URL`, enforced in `vitest.setup.ts`, which forcibly
> overrides `DATABASE_URL` with it for the vitest process and **refuses to
> run at all** if `TEST_DATABASE_URL` isn't set — there is no manual
> env-swapping step to forget. This exists because this project has no
> mocked DB layer by design (real DB behavior > asserting against mocks —
> see CODE_QUALITY_REVIEW.md), so every test run does real inserts/deletes;
> pointing `DATABASE_URL` itself at the real project briefly (2026-11-05,
> same day) made a test-cleanup bug a live production-data incident twice in
> one session before this fix. See CLAUDE.md's 2026-11-05 entries for the
> full history, including the first (reverted) attempt at this fix.
>
> **One-time setup, if you're on a fresh machine without this already:**
> 1. `brew install postgresql@16` (Homebrew; not a project dependency, just
>    the simplest local Postgres)
> 2. `brew services start postgresql@16` (run `initdb` first if it's a fresh
>    install)
> 3. `createdb soul_dust_revival_dev`
> 4. Set `TEST_DATABASE_URL` in `.env.local` to it, e.g.
>    `postgresql://you@localhost:5432/soul_dust_revival_dev` — no `sslmode`
>    needed; `lib/db/client.ts` only adds TLS for a non-localhost host.
>    **Leave `DATABASE_URL` itself pointed at the real Supabase project.**
> 5. Apply the schema to it once: easiest is
>    `MIGRATION_DATABASE_URL=<that local url> npx drizzle-kit migrate`
>    (run from a shell, not via `.env.local` — `drizzle.config.ts` always
>    appends `sslmode=require`, which a local Postgres doesn't speak, so this
>    one-off invocation needs `migrate`'s SSL append avoided; if that still
>    fails, apply each `drizzle/*.sql` file directly via `psql` instead and
>    hand-insert the matching `drizzle.__drizzle_migrations` rows, same
>    method as the 2026-11-04 entry below).
> 6. `npm test` — should now run clean against the local database.
>
> **`lib/db/client.ts` pools connections for this non-Hyperdrive path**
> (`localPool`, capped `max: 3`) rather than opening a fresh one per call —
> a local Postgres has no connection pooler in front of it the way Supabase
> does, so a fresh-unclosed-connection-per-call pattern (fine against a
> pooler) exhausts a plain Postgres server's `max_connections` almost
> immediately under a full test run. `vitest.config.mts` also caps
> `maxWorkers: 4` for the same reason — if you ever see "sorry, too many
> clients already" again, those two knobs are where to look first, and
> `brew services restart postgresql@16` clears already-stuck connections.
>
> **`MIGRATION_DATABASE_URL` is a separate env var and is unaffected** — it
> always points at the real Supabase project, since schema migrations are
> meant to land there. `TEST_DATABASE_URL` only ever overrides `DATABASE_URL`,
> never `MIGRATION_DATABASE_URL`.

## 4. Deployment

> ⚠️ **Read this before your first real `npm run cf:deploy`.** `opennextjs-cloudflare
> build` reads whatever `.env`/`.env.local` is present at build time and bakes its
> *entire* contents — every secret, not just `NEXT_PUBLIC_*` ones — as plaintext into
> `.open-next/cloudflare/next-env.mjs`, which gets bundled straight into the deployed
> `worker.js`. Confirmed locally: building with dummy `.env.local` values produced a
> `next-env.mjs` containing the literal `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`,
> `CRON_SECRET`, etc. If you build with your *real* production secrets in `.env`/
> `.env.local`, those secrets ship inside the Worker's bundled source — not sent to the
> browser, but baked into an artifact that's a very different exposure profile than a
> proper runtime secret (visible to anyone with "view Worker source" access, cached in
> CI/build logs, etc.), and rotating one then means a full rebuild+redeploy. This is
> standard Next.js/OpenNext build behavior, not a bug in this app's code — see
> opennext.js.org/cloudflare/howtos/env-vars ("you should always set the runtime
> environment variables in the [Cloudflare] dashboard").
>
> **The safe order of operations:**
> 1. Build and deploy with `.env`/`.env.local` containing only dummy/placeholder
>    values (exactly what `.env.example` has) — never your real Supabase/Stripe/
>    encryption-key values at build time, **except** `NEXT_PUBLIC_SUPABASE_URL`,
>    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `R2_PUBLIC_BASE_URL` (see note below — these
>    three must be real).
>    **As of 2026-11-16, `NEXT_PUBLIC_MARKETING_HOSTNAME`/`NEXT_PUBLIC_APP_HOSTNAME`/
>    `NEXT_PUBLIC_COOKIE_DOMAIN` must *also* be set to their real staging values on
>    every deploy** (`staging.souldustrevival.com` / `app.staging.souldustrevival.com`
>    / `.staging.souldustrevival.com`) — the marketing/app subdomain split is no
>    longer a one-off test, it's staging's own standing configuration. **Found the hard
>    way 2026-11-09 (later): several deploys in a row used the generic placeholder
>    procedure and silently left these three unset, regressing the split back off with
>    no error anywhere — it just made the "App" nav link resolve to a plain path that
>    stayed on whichever domain served the page, instead of routing to the app
>    subdomain.** Check this section before every `cf:deploy`, not just the first one.
>    Also note: `STRIPE_SECRET_KEY` and `RESEND_API_KEY` can't be left truly blank the
>    way `.env.example` has them — the `Stripe`/`Resend` SDK constructors run at
>    *module* scope and throw immediately on an empty string, which fails the build
>    outright (`Failed to collect page data for /api/checkout` etc.) before it ever
>    gets to baking anything in. Use any syntactically-plausible dummy string for
>    these two specifically (e.g. `sk_test_placeholder_build_only_...`) — never a real
>    key — the module-scope constructor only needs a non-empty string to not throw;
>    it's never actually called with real values until request time, by which point
>    the real secret (set via `wrangler secret put`) has taken over.
> 2. *After* the first deploy, set every real value as a Cloudflare dashboard
>    variable/secret (Workers & Pages → this Worker → Settings → Variables), or via
>    `wrangler secret put <NAME>`. These are what the Worker actually reads at request
>    time; they override the baked-in build-time defaults **for every var except
>    `NEXT_PUBLIC_*` ones and `R2_PUBLIC_BASE_URL`** (see note below).
> 3. On every later deploy, run `opennextjs-cloudflare deploy -- --keep-vars`
>    (or update the `cf:deploy` script to include it) so redeploying doesn't wipe the
>    dashboard-configured secrets back to the build-time placeholders. This itself
>    needs `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` set to *any*
>    syntactically-valid Postgres URL in the shell running the deploy command (not
>    `.env.local` — it's `opennextjs-cloudflare deploy`'s own `getPlatformProxy()` call
>    that needs it, to resolve local env vars before deploying; it has no bearing on
>    the deployed Worker's actual, Hyperdrive-backed connection) — set once a
>    `hyperdrive` binding exists in `wrangler.jsonc`, confirmed 2026-11-05.
>
> **`wrangler` needs Node 22+ — found 2026-11-15.** `wrangler 4.157.0` refuses to run
> deploy at all under Node 20 ("Wrangler requires at least Node.js v22.0.0"), even
> though earlier deploys this same version number succeeded — a `wrangler` self-check
> that changed between versions, not a project-side regression. If the active `node`
> on `PATH` is older, prefix just the deploy command rather than changing the system
> default, e.g. (this machine has Node 22 installed via Homebrew, keg-only):
> `PATH="/opt/homebrew/bin:$PATH" npx opennextjs-cloudflare deploy -- --keep-vars`
>
> **`npm test` has the same Node 22+ requirement — found 2026-11-08.** Under Node 20,
> `vitest 5.1.0`'s own reporter throws `TypeError: Map.groupBy is not a function` the
> moment any test fails, which **swallows the real failure output** and makes every
> failure look identical and uninformative regardless of its actual cause (`Map.groupBy`
> is a Node 22+ runtime feature vitest's reporter now uses unconditionally). Re-running
> the exact same suite under Node 22 showed the tests themselves were fine all along —
> this is a reporting-layer crash, not a test failure. If `npm test` ever shows several
> tests failing with no useful error message, re-run it with the same `PATH` prefix
> before assuming something broke: `PATH="/opt/homebrew/bin:$PATH" npm test`.
>
> **`NEXT_PUBLIC_*` vars are the one exception to "placeholder at build time, real
> secret after" — found the hard way on the first post-Hyperdrive redeploy 2026-11-05.**
> Next.js statically inlines every `process.env.NEXT_PUBLIC_*` reference at *build*
> time, wherever it appears — server code and middleware included, not just the
> client bundle. A blank placeholder value here doesn't just ship a blank default
> that a runtime secret can later override (like every other var); it replaces the
> reference itself with a literal `""` everywhere in the compiled output, so no
> `wrangler secret put` afterward can ever fix it without a full rebuild+redeploy.
> This broke `proxy.ts` (the middleware that creates the Supabase client on every
> request) with `Error: Your project's URL and Key are required to create a Supabase
> client!` on the first post-Hyperdrive redeploy, since `.env.example`'s
> `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are blank placeholders.
> Fixed by rebuilding with the *real* values for just these two vars — which is fine
> security-wise, since both are meant by Supabase/Next.js's own design to be exposed
> to the browser; they carry none of the risk the placeholder convention protects
> against for genuine secrets like `DATABASE_URL`/`STRIPE_SECRET_KEY`. **Any future
> `NEXT_PUBLIC_*` var added to this project must get its real value at build time,
> not a placeholder** — add it to this exception list here and in step 1 above.
>
> **`NEXT_PUBLIC_MARKETING_HOSTNAME`/`NEXT_PUBLIC_APP_HOSTNAME`/
> `NEXT_PUBLIC_COOKIE_DOMAIN`** (2026-11-12, the marketing/app subdomain split — see
> `lib/domains.ts` and CLAUDE.md's entry) are the one case so far where leaving a
> `NEXT_PUBLIC_*` var as a blank placeholder is *correct*, not a bug: unset, the split
> is inert and the site behaves exactly as it does today. But once you're ready to turn
> the split on, the same rule above applies — set all three to their real values
> *before* that build, never afterward via `wrangler secret put`. `lib/env.ts` requires
> all three together or none; a build with only some of them set will fail
> `validateEnv()` at boot.
>
> **`R2_PUBLIC_BASE_URL` has the exact same problem, for a different reason — found
> immediately after fixing the `NEXT_PUBLIC_*` issue above, 2026-11-05.** It isn't a
> `NEXT_PUBLIC_*` var, but `next.config.js` itself reads `process.env.R2_PUBLIC_BASE_URL`
> at *build* time to populate Next's image-optimizer allowlist
> (`images.remotePatterns`), which is compiled into the build output the same way —
> no runtime secret can change it afterward. Building with `.env.example`'s blank
> value made the allowlist point at a dummy hostname, so every real R2-hosted
> product/book-cover image got rejected by Next's image optimizer (images just didn't
> render — no error page, easy to miss). Fixed by rebuilding with the real value, same
> as the `NEXT_PUBLIC_*` fix — also safe to bake in, since it's a public CDN base URL
> by design. **Moral for next time: before trusting a placeholder deploy, check every
> env var `next.config.js` itself reads (`grep process.env next.config.js`), not just
> the ones prefixed `NEXT_PUBLIC_*`** — anything read there shares this same build-time
> bake-in behavior regardless of its name.

> ### The marketing/app subdomain split on staging (2026-11-12, verified 2026-11-16, now standing config)
> This is **one Worker**, not separate staging/production deployments — `staging.
> souldustrevival.com` and the eventual `souldustrevival.com`/`app.souldustrevival.com`
> are all just custom domains pointed at the same running Worker/build/database.
> **The split is no longer a one-off test — it's staging's permanent configuration as
> of 2026-11-16, which means its three `NEXT_PUBLIC_*` vars (see "4. Deployment" above)
> need to be set to their real staging values on *every* deploy from now on, not just
> once.** Forgetting them doesn't error — it silently reverts staging to single-domain
> behavior (found the hard way 2026-11-09, after several deploys in a row omitted them).
>
> **1. Dashboard prerequisites (not doable from this session — no DNS/zone-edit or
> Access permissions on this session's API token, same limitation as the original
> `staging.souldustrevival.com` setup below):**
> - Register **`app.staging.souldustrevival.com`** as a second custom domain on the
>   `soul-dust-revival` Worker — same flow as `staging.souldustrevival.com` itself.
>   Don't invent a third name (e.g. a literal `marketing.` subdomain) — production's
>   marketing side is the bare apex domain, not a `marketing.` label, so the staging
>   equivalent of that is just the existing `staging.souldustrevival.com`.
> - Decide what happens to Cloudflare Access, which currently gates the whole of
>   `staging.souldustrevival.com` (email-allowlist policy, see the entry below).
>   Recommended: remove Access for the duration of this test — it sits in front of
>   *every* request, including the login flow this test exists to exercise, which is
>   exactly the kind of conflict that already broke the Stripe webhook once (see the
>   "found there was no Stripe webhook endpoint" entry in CLAUDE.md). If Access needs
>   to stay, add the identical policy to `app.staging.souldustrevival.com` too, so
>   requests aren't gated on one host and not the other.
>
> **2. Build and deploy with staging's own values** (real values at build time, not
> placeholders — see the `NEXT_PUBLIC_MARKETING_HOSTNAME` box above — and all three
> together, since `lib/env.ts` fails `validateEnv()` at boot otherwise):
> ```
> NEXT_PUBLIC_MARKETING_HOSTNAME=staging.souldustrevival.com
> NEXT_PUBLIC_APP_HOSTNAME=app.staging.souldustrevival.com
> NEXT_PUBLIC_COOKIE_DOMAIN=.staging.souldustrevival.com
> ```
> This cookie domain is deliberately `.staging.souldustrevival.com`, not
> `.souldustrevival.com` — a narrower parent shared only by staging's two hosts, so a
> staging session can't also authenticate production once production exists. Then
> `npm run cf:deploy` per the safe order above.
>
> **3. Verify manually, in a real browser:**
> - Logged out, visit `staging.souldustrevival.com/library`, `/studies`, `/account`,
>   `/leader` — each should 307-redirect to the same path on
>   `app.staging.souldustrevival.com`.
> - Visit `app.staging.souldustrevival.com/`, `/books`, `/blog`, `/admin/products` —
>   each should 307-redirect to the same path on `staging.souldustrevival.com`.
> - Click "Books & Studies"/"Blog" from a page on `app.staging...` and "My
>   Library"/"Account" from a page on `staging...` — each should land on the other
>   host directly with no visible redirect hop (confirms the nav links'
>   `marketingUrl()`/`appUrl()` fix, not just `proxy.ts`'s fallback redirect).
> - Log in starting from `app.staging.souldustrevival.com/login`; check the session
>   cookie in dev tools shows `Domain=.staging.souldustrevival.com`; then visit
>   `staging.souldustrevival.com/account` directly and confirm you're still
>   recognized as logged in. Repeat starting from `staging.souldustrevival.com/login`
>   instead, confirming the reverse direction.
> - Log out from `/account` (an app-domain page) and confirm you land directly on
>   `staging.souldustrevival.com/`, not bounced through an extra hop.
> - If Stripe test mode is wired to staging, complete a real test purchase and
>   confirm the order-confirmation email's "Log in to access your content" link
>   points at `https://app.staging.souldustrevival.com/login?next=/library`.
>
> **4. Cutover:** once satisfied, redeploy with production's three values
> (`souldustrevival.com` / `app.souldustrevival.com` / `.souldustrevival.com`) for the
> real launch, same safe-build-then-set-secrets order. Re-apply staging's own values
> in a later build if this needs testing again afterward — the two can't be baked
> into the same deployed Worker at once.

- [x] Deploy with `npm run cf:deploy` (builds via OpenNext, deploys the Worker —
      see `wrangler.jsonc`/`open-next.config.ts`), using placeholder env values per
      the warning above — done 2026-11-05, live at
      `https://soul-dust-revival.matt-brown-8a1.workers.dev`. The account's
      `workers.dev` subdomain (`matt-brown-8a1`) had never been registered before;
      that's a one-time dashboard step (Workers & Pages → Create → any option) that
      can't be done via the API token this session has.
- [x] Set every real `.env` value as a Cloudflare dashboard variable/secret on the
      deployed Worker (not baked into the build — see warning above) — done
      2026-11-05 via `wrangler secret put` for all ~21 vars.
- [ ] **`CLOUDFLARE_ACCOUNT_ID` is missing from the deployed Worker's secrets —
      found overnight 2026-11-05 when a safe-procedure redeploy 500'd every page
      with "Invalid/missing environment variables: CLOUDFLARE_ACCOUNT_ID".**
      `wrangler secret list --name soul-dust-revival` confirms it isn't one of
      the 21 secrets currently set. This session's sandbox refuses to set it
      ("Secret-Store Writes"), so a human needs to run:
      `wrangler secret put CLOUDFLARE_ACCOUNT_ID --name soul-dust-revival`
      (value from `.env.local`) before the next deploy, or that deploy will
      500 the same way. Production was rolled back to the last working
      version (code from before tonight's "both" format build) in the
      meantime — see CLAUDE.md's same-dated entry for the full story.
      **The site is currently NOT running tonight's build** (committed/pushed
      to GitHub, but not deployed) until this is set and `npm run cf:deploy`
      is re-run.
- [x] **Fixed 2026-11-05 — the DB-500 found via the first real deploy.** Every
      DB-backed page 500'd on the deployed Worker with `Error [ERR_OPTION_NOT_IMPLEMENTED]:
      The options.rejectUnauthorized option is not implemented`, from `lib/db/client.ts`'s
      `postgres(..., { ssl: "require" })` — Cloudflare Workers' `nodejs_compat` TLS socket
      shim doesn't implement the TLS options the `postgres` npm driver (direct TCP/TLS to
      Postgres) needs. Fixed by setting up Cloudflare Hyperdrive and switching the driver
      from `postgres` (postgres.js) to `pg` (node-postgres), per Cloudflare's own
      documentation that pairing Drizzle with postgres.js over Hyperdrive is unsupported.
      This also required converting `lib/db/client.ts`'s `db` export from a module-level
      singleton to an async `getDb()` factory, since Workers forbids reusing a database
      client across requests and Hyperdrive expects a fresh client per request (it pools
      the real connection on Cloudflare's side, so this is cheap) — every one of the ~55
      files that previously imported `db` now calls `const db = await getDb()` instead.
      See CLAUDE.md's 2026-11-05 entry and SECURITY.md's "Database access model" section
      for the full writeup.
- [x] **Redeployed 2026-11-05 with the Hyperdrive fix above.** Found one more thing
      only a real redeploy surfaces: building with `.env.example`'s blank
      `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` placeholders broke the
      middleware (`Error: Your project's URL and Key are required to create a Supabase
      client!`) in a way no later `wrangler secret put` could fix, since Next.js
      statically inlines `NEXT_PUBLIC_*` vars at build time everywhere, not just in the
      client bundle — see the warning box above for the full explanation and the fix
      (rebuild with the real values for just those two vars, safe since they're meant
      to be public). Confirmed live: `/`, `/books`, and `/blog` all return 200 (real
      DB data, no more 500s), and `/studies`/`/leader` correctly 307-redirect
      logged-out visitors to `/login` rather than erroring.
- [x] **Fixed 2026-11-05 — product/book cover images not rendering, found right after
      the redeploy above (by the user, clicking through the live site).** Same
      build-time-env-baking issue as the `NEXT_PUBLIC_*` fix just above, this time in
      `next.config.js`'s own `R2_PUBLIC_BASE_URL` read for the image-optimizer
      allowlist — see the warning box above. Fixed by rebuilding with the real value
      and redeploying. Confirmed live: the one product with a real uploaded cover
      renders it via a successful `/_next/image` request; the other two show their
      correct "no cover uploaded yet" placeholder tile, not a broken image.
- [x] **Fixed 2026-11-05 — every blog post and leader resource page 500ing, found
      right after the images fix above.** `isomorphic-dompurify` (this app's HTML
      sanitizer for all Tiptap-authored rich text) pulls in `jsdom`, which isn't
      Workers-compatible. **Took three attempts, not one:** two DOMPurify +
      pure-JS-DOM-shim replacements (`linkedom`, then `happy-dom`) each passed
      typecheck/build/the existing test suite but, caught only by manually testing a
      `<script>`/`onerror` payload by hand, **silently left the dangerous markup in the
      output** instead of sanitizing it — a worse failure than the crash they were
      replacing. Fixed by switching to `sanitize-html` (parses HTML directly, no DOM
      dependency at all) behind a new single `sanitizeHtml()` helper
      (`lib/sanitize/html.ts`), with real regression tests
      (`lib/sanitize/html.test.ts`) that actually assert specific attack payloads get
      stripped — the gap that let the first two silent failures through. See CLAUDE.md's
      2026-11-05 entry and SECURITY.md's "XSS / rich text" section for the full story.
      `npm run verify`/`npm test` (177 tests) clean; redeployed; confirmed live: both
      existing blog posts return 200 with correctly rendered content.
- [x] Register a custom domain (`staging.souldustrevival.com`) for the deployed Worker
      and put Cloudflare Access in front of it — done 2026-11-05, by the user via the
      Cloudflare dashboard (this session's API token has neither Zero Trust/Access nor
      DNS/zone-edit permissions, so this needed the dashboard either way). Access is
      configured with an email-allowlist policy ("Allowed reviewers": the founder's and
      the user's emails) plus both "Cloudflare" (the user's own account) and "One-time
      PIN" (email-code login, no account needed) as login methods, so the founder — who
      has no Cloudflare account — can get in. Confirmed from this session: an
      unauthenticated request to `staging.souldustrevival.com` gets a `302` to
      Cloudflare's Access login page, not the site; the login page itself shows both
      login options.
- [ ] Configure the Stripe webhook endpoint (`/api/webhooks/stripe`) in the Stripe
      dashboard, pointed at the deployed domain, and copy the signing secret into
      the Worker's `STRIPE_WEBHOOK_SECRET` (dashboard, not `.env`)
- [ ] Set up a scheduler to call `/api/cron/social-publish` every 5-15 min,
      `/api/cron/social-metrics` daily, and `/api/cron/prune-login-events` daily or
      weekly (see PRIVACY.md), all three with the `CRON_SECRET` bearer token —
      see SOCIAL.md (a companion Worker or an external scheduler like
      cron-job.org/GitHub Actions both still work unchanged; this app's own Worker
      doesn't export a native `scheduled` handler, so a native Cron Trigger on the
      same Worker isn't wired up — not attempted here, since OpenNext's generated
      `worker.js` is fully regenerated on every build and wrapping it safely with a
      custom entrypoint needs real deploy testing to verify)

### Sneak-peek production launch (souldustrevival.com)
A second Worker, separate from staging, built with `NEXT_PUBLIC_LAUNCH_MODE=sneak_peek`
(see SECURITY.md "Sneak-peek launch mode"). Same database and Supabase project as
staging. Staging keeps the full site; the full launch is a rebuild of production without
the mode set.
- [ ] **Supabase Auth custom SMTP (blocking).** Supabase's built-in email sender only
      allows a handful of emails per hour for the whole project — a public signup form
      would stop sending codes almost immediately. Authentication → Emails → SMTP
      settings, pointed at Resend (the domain order emails already send from). Send one
      code to a fresh address to confirm before launch.
- [x] **R2 bucket CORS rule** (2026-11-10). `GET`/`PUT` from both staging hosts and
      `souldustrevival.com`, `www.`, `app.`; headers `content-type`, `cache-control`.
      If production keeps this same bucket, nothing more is needed; a separate
      production bucket would need its own rule.
- [x] Free-sample lessons built (lesson-level access, `lessons.isSample`, locked-lesson
      UI), 2026-11-10.
- [x] Apply migration `0012` (`lessons.is_sample`) to the real database **before**
      deploying that code — every page that reads `lessons` fails until the column
      exists. Then `npx tsx --env-file=.env.local scripts/mark-sample-lessons.ts`
      (dry run), then again with `--apply`, to mark the 8 sample lessons. **Done
      2026-11-10:** column applied (13 migrations recorded), 8 lessons marked, confirmed
      4/13 Colossians and 4/366 Psalms, every other study 0. There's no
      admin toggle for `isSample` yet, and **re-importing a study's document recreates
      its lessons without the flag** — re-run this script after re-importing Colossians
      or the Psalms devotional.
- [ ] `wrangler.jsonc`: an `env.production` Worker (e.g. `soul-dust-revival-prod`) with
      the same Hyperdrive and Images bindings; its own secrets set (`wrangler secret put
      --env production`). Stripe can stay on test keys — checkout is closed.
- [ ] Domains: move `app.souldustrevival.com` from the staging Worker to the production
      Worker; add `souldustrevival.com` (and a `www` redirect). No Cloudflare Access on
      production.
- [ ] Build with `NEXT_PUBLIC_LAUNCH_MODE=sneak_peek`,
      `NEXT_PUBLIC_MARKETING_HOSTNAME=souldustrevival.com`,
      `NEXT_PUBLIC_APP_HOSTNAME=app.souldustrevival.com`,
      `NEXT_PUBLIC_COOKIE_DOMAIN=.souldustrevival.com`, plus the usual real
      `NEXT_PUBLIC_SUPABASE_*`/`R2_PUBLIC_BASE_URL`, placeholders for everything else.
      A `.souldustrevival.com` cookie is also sent to the staging hosts — acceptable,
      since both use the same Supabase project and staging stays Access-gated.
- [ ] Cloudflare rate-limiting rule on `/api/auth/*` and `/sneak-peek`.
- [ ] After deploy: one real signup from a fresh email end to end (code arrives, a
      `users` row exists, the sample opens, a locked lesson stays locked), and confirm
      `/books`, `/checkout` redirect home and `/api/checkout` returns 404.

## 5. Platform-specific approval steps (these take real calendar time — start early)
- [ ] Submit Meta App Review for `pages_manage_posts` and `instagram_content_publish`
      (required before these work for any account other than your own
      developers/testers on the app)
- [ ] Confirm your X API access tier actually permits posting (the free tier
      generally doesn't — see SOCIAL.md)

## 6. End-to-end testing checklist
**See also `qa/` (added 2026-11-11)** — a reusable, automated-plus-manual QA regression
suite covering most of what's below against local dev with comprehensive fixtures, meant
to be run after every build item (`qa/README.md` for setup/how-to-run,
`qa/findings/FINDINGS_2026-11-07.md` for the first run's results). The checklist below
stays as the staging/production-specific manual pass for whatever `qa/` can't cover
locally (real Stripe test-mode payments, real social platform posting, etc.).

Manual QA pass — walk through each of these against a real (ideally staging/test)
deployment before treating any of it as launch-ready:

**Auth & accounts**
- [ ] Signup creates an account and a `login_events` row
- [ ] Login with an unrecognized email is rejected with a link to sign up instead
- [ ] Session persists correctly across the study app and leader section

**Commerce**
- [ ] Guest checkout completes for a physical-only cart; confirmation email arrives
- [x] Digital purchase requires login; entitlement is granted after the Stripe webhook fires —
      verified 2026-11-04 against real Stripe test mode + real Postgres, see "Recently completed"
- [ ] Country is required and stored on every order, guest and logged-in alike
- [ ] A Stripe promo code applies correctly and the order total reflects the discount

**Content authoring**
- [ ] Create a product; image upload requires alt text before saving
- [ ] Create a physical product with Amazon selling enabled; confirm the "Buy on
      Amazon" button appears and links out correctly, and (if Stripe is also
      enabled) "Buy Now" still adds to cart alongside it
- [ ] Mark a physical product Amazon-exclusive (Stripe off); confirm no "Buy Now"
      button renders and a direct `/api/checkout` POST for that product is rejected
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
- [x] Connect X and Facebook in Settings → Connections — tested locally against
      real accounts; see "Recently completed" below for a Facebook scope fix
      this surfaced. Claude connection still untested (no real Anthropic key
      wired in for this yet).
- [x] Confirm Instagram auto-connects if the Facebook Page has a linked IG business account
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
      and the admin authoring flow — **partially done:** storefront, checkout, and
      account already audited with axe-core directly (see "Recently completed" and
      ACCESSIBILITY.md); a lesson page and the admin authoring flow still need this,
      since both require real auth to reach
- [ ] Full keyboard-only pass through checkout and lesson authoring
- [ ] Test on at least one real phone and one real tablet, not just DevTools' device toolbar

**Security**
- [ ] Configure Cloudflare Rate Limiting Rules for `/api/checkout`, `/api/responses`,
      `/api/progress`, `/login` (see SECURITY.md — not built into the app itself)

## 7. Known gaps worth deciding on, not yet built
- [ ] Have counsel review `/privacy` for legal sufficiency in your actual jurisdictions
      (the content is real and accurate, just not attorney-reviewed yet)
- [ ] Worker bundle size: `wrangler deploy --dry-run` shows ~5.2MB gzipped,
      over the Workers Free plan's 3MiB script limit (10MiB on Paid, so this
      deploys fine there). If staying on Free matters, the likely win is
      splitting the heavy, rarely-hit `.docx`/`.pdf` study-import route
      (`mammoth`/`pdf-parse`) into its own OpenNext server function so it's
      not bundled into every request's cold start — an OpenNext feature
      ("splitting") not set up yet. Not attempted this session: real
      effort, and 3MiB is unlikely to matter once you're paying Cloudflare
      for Stream/R2 anyway.
- [ ] Verify DB connections are stable under the real Workers runtime once
      the real Supabase project exists. Running `wrangler dev` locally
      against the raw (non-pooled) local Postgres, dynamic routes that hit
      the DB intermittently errored with "the Workers runtime canceled
      this request because it detected that your Worker's code had hung."
      `/account` (no DB read) was solid; `/` (does a DB read) was flaky.
      This may just be the local throwaway Postgres having no pooler —
      README/SECURITY.md already call out using the **Supabase pooler
      URL** specifically because Workers churn through short-lived
      connections — so this might be a non-issue once pointed at the real
      pooler. Didn't chase further since testing that properly needs the
      real target environment. Re-test this explicitly once Supabase is
      set up, before trusting any DB-backed route in production.
- [ ] Watch for issues from `proxy.ts` (the CSP) once deployed for real —
      it depends on `@opennextjs/cloudflare`'s Node.js-middleware support,
      which the adapter itself labels experimental/unmaintained. Worked
      correctly in local `wrangler dev` testing across several pages, but
      that's not the same as a real deploy. If it ever causes a production
      issue, the fallback is the simpler CSP (no proxy.ts, no nonce, set
      via `next.config.js`'s `headers()` instead) — see SECURITY.md for
      what that loses (script-src would need `'unsafe-inline'` too).

---

## Recently completed (most recent first)
- **2026-11-10 — captions, upload progress, media signed when shown, and uploaded video playback fixed.** `259fab4` (captions via `/api/captions/[file]`, a progress bar on every upload, signing when the player comes into view) and `f5847a7` (signed Stream URLs doubled the host, so uploaded video never played) are deployed to staging (Worker `36981a68`). An uploaded video was confirmed playing on staging. The R2 bucket had no CORS rule, so every browser upload to R2 (captions, images, cover PDFs) failed. A rule was added on the user's go-ahead (`GET`/`PUT` from the staging and production origins). After that, a captions upload worked on staging and its captions showed in the reader. See CLAUDE.md's same-dated entry.
- **2026-11-10 — free-sample lessons for the sneak peek (second half).** New `lessons.isSample` (migration `0012`, additive, default false) and `getLessonAccess` in `lib/entitlements/check.ts`: a published sample lesson of a published study opens for any signed-in reader; everything else still needs the entitlement (or admin preview). Every reader path asks about the specific lesson — the lesson page, `/api/progress`, `/api/responses`, `/api/stream/sign-url` — and `/api/progress/reset` restarts only a sample reader's sample lessons. A sample reader sees the whole lesson list with the rest locked ("Unlocks at launch and purchase" on the sneak-peek build, "Unlocks with purchase" on the full site): locked rows on the study page, the week picker and the devotional's year calendar, a "Week 4 unlocks …" card at the end of the last sample lesson, no prev/next into a locked lesson, a ring counting only sample days, and "Sneak peek" cards in My Library. `/sneak-peek` now lists whatever is marked as the sample, with real covers. `scripts/mark-sample-lessons.ts` marks Colossians Introduction + Weeks 1–3 and Psalms Introduction + Days 1–3 (the real titles were checked read-only and match; the script itself can only dry-run once the column exists there). New QA fixture `qa-sample-devotional` and `qa/e2e/specs/sneak-peek.spec.ts`; `library-entitlements.spec.ts` updated for the sample card. `npm run verify`, `npm test` (480) and the full desktop QA suite (245) clean. Migration `0012` applied to the real database and the 8 sample lessons marked the same day, with the user's go-ahead. **Not deployed** — see the Sneak-peek production launch checklist.
- **2026-11-10 — removed the last link-based sign-in paths; admin-created users now sign in with a code.** `/admin/users`' "Add user" used `inviteUserByEmail`, which emailed a sign-in link that only worked through `SessionHashRecovery` (tokens in the URL fragment) and `/auth/callback`. Both kept a small login-CSRF risk alive (a crafted URL carrying someone else's tokens would silently sign the visitor into that account) and were otherwise dead since the switch to emailed codes. `POST /api/admin/users` now uses `auth.admin.createUser({ email, email_confirm: true })` and sends a plain "your account is ready" email (`sendAccountCreatedEmail`, Resend, no link or code — just the login page); a mail failure keeps the account and returns `welcomeEmailSent: false`, which `AddUserForm` shows. Deleted `components/auth/SessionHashRecovery.tsx`, `lib/auth/sessionHashTokens.ts`, `app/auth/callback/route.ts` and their tests, plus the `?error=link_expired|account_setup` plumbing on `/login` (only the callback produced it). The Supabase "Confirm signup" email template was switched to show `{{ .Token }}` in the dashboard (by the user). `npm run verify` clean; `npm test` 447/447 (users route tests updated for `createUser` and a new welcome-email-failure case). **Not verified live:** the real `createUser` call and welcome email (mocked in tests; no admin session here) — see the new steps in `qa/checklists/02-auth-and-account.md`. Not deployed.
- **2026-11-10 (latest) — staging check of the builder, with 2 fixes deployed.** The reader no longer crashes on a week with no stations (`4574d38`, Worker `a453c0e8`). The block canvas now hides as soon as a new week first saves, with no page refresh needed (`47a1bda`, Worker `105a3006`). Both were checked on staging, and all test lessons were deleted. **Hyperdrive read caching turned off** on the user's go-ahead (`--caching-disabled`), so reads are no longer up to about 60s stale. Verified on staging: a created or deleted lesson shows immediately. When production is set up, give it its own Hyperdrive config with caching disabled.
- **2026-11-10 (later) — media inside Study weeks.** Images, video, audio, and callouts can be placed after any section, part, station, or practice, or at the end of any tab; they're stored as additive optional fields in `studyContent`, so there's no migration. Uploaded week media is signed by lesson + Stream id, and the signing route refuses ids that aren't in that week and drafts for non-admins. See CLAUDE.md's same-dated entry. `npm run verify`, `npm test` (462), and the QA suite (240/240 desktop and mobile) are clean. **Follow-up (Low):** sign uploaded media on first show rather than at page load, so URLs for tabs opened more than an hour later don't expire. **Committed (`cb4a7e8`) and deployed to staging (Worker version `80d80ea4`).**
- **2026-11-10 — Lesson Builder (Phase 1): drag-and-drop block palette and canvas, a five-tab Study week builder with reorderable lists, a reorderable lesson list, URL-or-upload image/video/audio, autosave throughout, and admin "Preview as reader".** Also fixed 6 pre-existing bugs (caption uploads always failing, answered-question delete 500, cross-study lesson access by URL, devotional layout breaking after any admin edit, devotional extra blocks never shown, UUID screen-reader announcements). An independent review's High finding (a station-id race that could wedge autosave) and its Medium findings were fixed before calling this done; see CLAUDE.md's same-dated entry. Draft lessons can also be deleted from the study page (published or reader-touched lessons are refused). `npm run verify` and `npm test` (444) clean; full QA suite 239/239 desktop and 239/239 mobile against the isolated local DB. **Follow-up:** captions likely never display for readers (cross-origin `<track>`; needs R2 bucket CORS plus `crossOrigin` on the video, verified live). Migration `drizzle/0011_tired_the_call.sql` (adds nullable `content_blocks.media_url`) **applied to the real Supabase project** with explicit approval and confirmed via `information_schema`. **Committed (`252c76d`) and deployed to staging (Worker version `65e4d9b4`)** from a clean worktree with placeholder build secrets; checked live (public pages 200, gated pages redirect, new admin routes 403 unauthenticated).
- **2026-11-10 — fixed new accounts never getting a `users` row, and added the sneak-peek launch mode (first slice).** Since the switch to emailed sign-in codes (2026-11-08), `verifyOtp` ran in the browser and never reached `/auth/callback`, the only place a `users`/`login_events` row was created — so a brand-new account could sign in but every progress/answer save would fail the `users` foreign key. New `lib/auth/recordLogin.ts` + `POST /api/auth/login-recorded`, called by `AuthForm` after the code verifies (a retry skips re-verifying the already-used code), by `SessionHashRecovery`, and — as a backstop if the browser never finishes that call — by the `(study-app)` layout on every reader page load (`ensureUserRow`). An independent review found no Critical/High issues; its Medium/Low findings (that backstop, the callback ignoring a conflicting-email case, a dead-end retry on 409, a build-time check so a misspelled launch mode fails `next build` instead of shipping the open store, the footer's store link) were fixed. A read-only dry run of `scripts/backfill-missing-user-rows.ts` against the real project found no real customer affected — only the 3 QA fixture accounts, so it was not applied. Sneak-peek mode (`NEXT_PUBLIC_LAUNCH_MODE=sneak_peek`, `lib/launchMode.ts`): hero CTA "Experience a sample" → new `/sneak-peek` page (sample signup form), store/cart/checkout closed server-side, nav shows "Try a sample", homepage tiles say "Coming at launch" and don't link. `npm run verify` and `npm test` (412) clean; checked in-browser in sneak-peek mode at desktop and phone width. **Not yet done:** the free-sample lessons themselves (lesson-level access, `lessons.isSample`, locked-lesson UI) wait for the in-flight builder work, which is editing the same reader files; production Worker/domains/Supabase SMTP not set up. **Not committed, not deployed.**
- **2026-11-09 — narrowed imported Study/Devotional Introduction lessons down to just Foreword/Preface content, and added a "both" (physical + digital) format option for bundles.** `narrowToForewordAndPreface()` now feeds both PDF-import paths' leading "Introduction" lesson, discarding the title page/TOC duplicate/acknowledgments/etc.; no Foreword or Preface at all means no Introduction lesson. `bundleSchema`/`BundleForm`/the bundles admin route gained `format: "both"`, reusing the existing checkout/webhook/Stripe variant pipeline unchanged (confirmed by reading it, not assumed) — a bundle still never has its own Amazon route regardless of format. A required security/code-quality review (8 parallel angles) found and fixed 5 real bugs before this shipped: a TOC dot-leader "Foreword .... 3" entry and an ordinary heading-shaped line inside a real Foreword both could corrupt the narrowing; a new "both" bundle's digital price silently stayed `null` if never touched, failing save with no visible cause; the admin and public bundle list pages both mislabeled a "both" bundle (no case for it); and the bundle savings calculation compared mismatched price baskets for "both". See CLAUDE.md's same-dated entry for the full writeup. 15 new/updated tests; `npm run verify` and `npm test` (369, up from 359) both clean. **Not committed or deployed.** BundleForm's own UI wasn't exercised live — a temporary admin-bypass attempt was refused by this session's sandbox and abandoned/reverted rather than worked around; verified instead by test coverage and code review.
- **2026-11-08 (newest) — built "The Journey": 4 new Part products/studies (physical, Amazon-only) imported from their own manuscripts, plus a digital bundle granting access to all 4; fixed 5 real bugs along the way, including two in shared production code.** Found and fixed real gaps in `lib/import/splitIntoLessons.ts`'s Study-PDF heuristic that Colossians alone never exercised (a case-insensitive heading regex matching ordinary recap prose; three different real Contents-page layouts breaking the old TOC-exclusion logic, replaced with a more general "last occurrence of each week number wins" rule; an inline "QUESTION \<text\>" layout two of the four parts use; numbered-book verse references like "1 JOHN 1:9" not recognized as section boundaries) — 3 new regression tests. Also found and fixed a real, **pre-existing** asymmetric-cover-crop bug in the shared `lib/images/bookCover.ts` (confirmed already present on the live Colossians cover too, not new) — every future cover-PDF upload through the real admin UI now gets a centered result, not just this import's 4 covers. All 4 parts reviewed lesson-by-lesson (13 lessons each, matching each PDF's own Contents count); 2 small cosmetic defects found and hand-fixed (two truncated two-line titles, 5 garbled Hebrew callout titles). `npm run verify` and `npm test` (358, 4 new) both clean. See CLAUDE.md's same-dated entry for the full design, the bundle-cascade mechanics (each part sells physical-only via Amazon; only the $80 digital bundle grants app access), and what was verified live. **Not deployed** — this was data/content work plus two small, reviewed production code fixes, per the task's own scope.
- **2026-11-08 (later) — built bundled Products (ships, Stripe-only, founder shipment email) and bundled Studies (grants access to every component), created from the existing Products/Studies admin pages via a new "New bundle" dropdown entry.** One mechanism underneath both: a `products` row (`type: "bundle"`) plus a new `bundle_items` join table listing its existing, independently-priced components. A digital bundle's purchase cascades an entitlement to every component (not to the bundle itself); a physical bundle has no Amazon fulfillment behind it, so it emails `brad.bird@souldustrevival.com` directly instead. The storefront bundle page shows a "What's included" list where each component is purchasable through its own completely unchanged buttons (Amazon included, where offered). 36 new tests; `npm run verify` and `npm test` (353, 36 new) both clean. See CLAUDE.md's same-dated entry for the full design and the required security/code-quality review's findings (none Critical/High). Migration `drizzle/0008_fantastic_guardsmen.sql` (`bundle_items`, additive) applied to the real Supabase project with explicit approval. **Verified live** in the real admin UI and storefront (temporary/reverted session bypass) — one digital and one physical test bundle, both created, saved, and rendered correctly, then deleted. **Not verified**: an actual Stripe-test-mode purchase + real webhook delivery for a bundle (the entitlement cascade and founder email are instead covered by the automated webhook-handler tests against the real local test database).
- **2026-11-08 — fixed a live-reported regression ("login broke again, magic-link opens back to login page"): `/auth/callback` was silently ignoring a failed code exchange and redirecting to `next` as if it had succeeded.** A single-use magic-link code commonly gets consumed by an email client's own link-prefetching/security scanner before the real human click, so the real click then gets a genuine "expired/already used" error from Supabase — the route wasn't checking for that error at all, so it redirected to `/library` anyway with no session ever set, and `/library`'s own guard then bounced the visitor straight to `/login` with no explanation. Fixed to redirect to `/login?next=...&error=link_expired` instead, with a visible "that link expired or was already used" message. 5 new tests in a first-ever `app/auth/callback/route.test.ts`. `npm run verify` and `npm test` (326, 5 new) both clean. See CLAUDE.md's same-dated entry for the full root-cause writeup. **Deployed immediately**, isolated via `git stash` from unrelated in-progress bundles-feature work sitting in the same working tree — confirmed live against the real deployed Worker (a bogus callback code now correctly bounces to `/login?error=link_expired` with the message rendering).
- **2026-11-16 (yet even later) — found and fixed the real cause behind "I can't log in anymore": Supabase's magic link falls back to the legacy implicit-flow format (`#access_token=...` in the URL hash) instead of the normal PKCE `?code=` flow when its redirect validation fails, and the app had no code to handle that at all.** New `components/auth/SessionHashRecovery.tsx` (mounted globally in `app/layout.tsx`) detects that hash shape on page load and completes the login using the app's own real Supabase browser client — verified end-to-end against the real Supabase project using the user's own real tokens (confirmed the nav bar correctly flips from "Log in" to logged-in). This is a resilience fix for the *symptom*, not the underlying Supabase-side bug, which still needs their support — see CLAUDE.md's same-dated entry for the full investigation, including a live security check-in with the user before proceeding, and a real testing gotcha (same-document hash-only navigation doesn't remount React, so testing this needs a genuinely fresh tab/load, not just editing the current tab's URL). `npm run verify` and `npm test` (under Node 22, 321 passing, 5 new) both clean. **Deployed immediately** (Version `2019ee60-d1a0-4fe2-b6ee-cd8aa1877dd8`) given this was actively blocking real login — **confirmed fixed on the real live site**, not just local dev: the user clicked a fresh real magic link in their own inbox/browser and confirmed being logged in.
- **2026-11-16 (even later) — cover image alt text now auto-fills from the title ("{Title} — Front/Back cover"), fixed a real spine-bleed/off-center cover bug (widened the crop's spine margin), and found a second Node-22 tooling requirement (`npm test`'s own reporter).** Alt text only auto-fills when the field is still empty, so a re-upload never overwrites what an admin already typed. The spine-margin widening (`0.04` → `0.06` in `lib/images/bookCover.ts`) fixes both the visible spine sliver and the cover art looking off-center in the admin preview thumbnails — same root cause, one fix. See CLAUDE.md's same-dated entry for the full design, and this file's "4. Deployment" section for the new `npm test` / Node 22 tooling note. `npm run verify` and `npm test` (under Node 22 — see the tooling note above, 316, 3 new) both clean. **Deployed to Cloudflare the same day**, built with the staging-split env vars still set (not reverted) since that split is already live and verified — confirmed live afterward.
- **2026-11-16 — registered the staging-split custom domains (`app.staging.souldustrevival.com`, `app.souldustrevival.com`) in Cloudflare, extended the shared Access policy to cover both, deployed a staging-configured test build, and verified the marketing/app subdomain split end-to-end against real hostnames for the first time — every check passed.** Closes out the "Not yet verified against a real second hostname" gap from the 2026-11-12 entry below. `staging.souldustrevival.com`'s gated paths (`/library`, `/studies`, `/account`, `/leader`) each correctly 307-redirect to the identical path on `app.staging.souldustrevival.com`, which then correctly bounces a guest to its own `/login?next=...`; the reverse direction (`/`, `/blog`, `/admin/products` on the app host) correctly bounces back to the marketing host. See CLAUDE.md's same-dated entry for the full verification detail, including one blocked verification approach (spoofing the `Host` header against the ungated `.workers.dev` URL — Cloudflare's own edge rejects this with a 403) and what still isn't covered (the shared-cookie login round trip, the confirmation-email link). Production (`souldustrevival.com`/`app.souldustrevival.com`) is still fully inert — only the staging hosts were exercised.
- **2026-11-16 (later) — branded Supabase Auth's magic-link email (subject, SDR monogram header, a real branded "Sign in" button), then found the shared-cookie login round trip is blocked by a Supabase-platform-side redirect-URL bug, not anything in this project — held rather than keep guessing.** Added `app.staging.souldustrevival.com/auth/callback` and `app.souldustrevival.com/auth/callback` to Supabase's Redirect URLs allowlist (a real, separate gap — these were missing entirely). Confirmed via a control test that even the **original, long-standing** `staging.souldustrevival.com/auth/callback` entry — the one real customer logins have used before — is *also* currently falling back to the bare Site URL instead of honoring the requested redirect, ruling out a typo, propagation delay, or anything specific to the new entries. See CLAUDE.md's same-dated entry for the full investigation trail. **Next step: check status.supabase.com or contact Supabase support** — this isn't fixable from our side.
- **2026-11-15 — three accessibility improvements requested after a recommendation pass: a live contrast check on the callout color picker, a standing automated axe-core audit in the QA suite, and a manual keyboard-only pass through checkout and the admin lesson-authoring flow.** The axe run found and fixed 4 real contrast failures (all the same root cause: `ember-700` text on a translucent `bg-dusk/5`/`bg-ember-700/10` card background, ~4.45:1, under WCAG AA's 4.5:1 — fine on a full-strength background, not on these). The keyboard pass found and fixed 2 real bugs in the admin block editor: a missing `res.ok` check that let a failed add-block request render as `"undefined block"`, and a Move Up/Down button dropping keyboard focus to `<body>` when it became disabled right after being clicked. One real `@dnd-kit` hydration mismatch was found and flagged, not fixed (needs upstream investigation, not a blind patch). `npm run verify` and `npm test` (313, 9 new) both clean; the new `qa/e2e/specs/accessibility.spec.ts` (22 checks, `npm run test:a11y`) and the full `admin-studies.spec.ts` suite both pass clean after the fixes. See CLAUDE.md's same-dated entry for the full design and ACCESSIBILITY.md for the updated standing documentation. **Deployed to Cloudflare the same day**, confirmed live afterward. Found a new tooling snag along the way: `wrangler` now requires Node 22+, which this machine's active `node` isn't — worked around with a `PATH` prefix to the Node 22 install already present via Homebrew; see CLAUDE.md's same-dated entry for the exact command.
- **2026-11-14 (later) — added a scroll-edge fade+chevron affordance to the Study and Devotional readers' own scrollable tab bars, the same gap just fixed in the main nav, found live right after deploying that fix.** New shared `lib/hooks/useScrollEdges.ts` + `components/ui/ScrollFadeTabs.tsx`, used by both readers instead of fixed in one. A first plain-color-fade version was visually confirmed too subtle against the near-white `parchment` background and replaced with a fade + small `‹`/`›` chevron before calling it done. Verified live against the real Colossians Week 1 data (temporary/reverted session bypass). `npm run verify` and `npm test` (304, unchanged) both clean. See CLAUDE.md's same-dated entry. **Not yet redeployed to Cloudflare.**
- **2026-11-14 — renamed the nav's "My Library" link to "App" and replaced the mobile nav's scrollable strip with a real hamburger menu.** Fixes the exact discoverability gap found the session before (the link could scroll off a phone screen with no hint there was more nav to see) by removing the scrolling entirely below the `sm:` breakpoint -- one hamburger holds everything now. Updated the one Playwright spec (`public-marketing.spec.ts`) whose nav assertions the restructure genuinely broke, then ran the full `qa/` suite (both viewport projects, 446 checks) to confirm. `npm run verify` and `npm test` (304, unchanged) both clean. See CLAUDE.md's same-dated entry for the full design and the one flagged naming question (the `/library` page's own heading is still "My Library" -- only the nav label changed). **Not yet redeployed to Cloudflare.**
- **2026-11-13 — fixed Study weeks having two disconnected "done" signals (a local-only tab ring vs. a separate real "Mark complete" button), found during a requested re-evaluation of progress/button UX.** The Lift Up tab's own button is now also the week's one real, server-synced completion action (mirroring the devotional reader's `WalkedToggle`), and the redundant bottom "Mark complete & continue" button is now hidden for Study weeks too. New shared `lib/study/lessonProgress.ts` also closes a pre-existing race-guard gap in `WalkedToggle.tsx`. `npm run verify` and `npm test` (304, 4 new) both clean. See CLAUDE.md's same-dated entry for the full design, the rejected alternative (gating completion on all 5 tabs), and the one documented transition quirk. **Not yet redeployed to Cloudflare.**
- **2026-11-12 — built the marketing/app subdomain split (`souldustrevival.com` for storefront, `app.souldustrevival.com` for My Library/Study/Devotional readers/Account/Leader Resources) as one Next.js app/Worker with hostname-based routing, plus a shared session cookie so logging in on either domain authenticates both — code-complete and reviewed, nothing deployed yet.** New `lib/domains.ts` (path classification + cross-domain URL helpers + the single shared `sessionCookieOptions()`), the actual redirect logic added to the existing `proxy.ts` (this project uses Next 16's `proxy.ts`, not `middleware.ts`), `lib/env.ts` requiring all three new `NEXT_PUBLIC_*` vars together or none. 5-angle review found and fixed 7 real issues (a missing-cookie-domain validation gap, hostname case-sensitivity, 3x-duplicated cookie options, ad hoc env reads, a permanent-redirect caching risk, a missed cross-domain logout fix, duplicated prefix-match logic); 2 more documented as deliberate trade-offs rather than coded around. `npm run verify` and `npm test` (300, 20 new) both clean. See CLAUDE.md's same-dated entry for the full design, and this file's "4. Deployment" section for the new `NEXT_PUBLIC_*` vars' build-time rule. **Everything stays off (today's single-domain behavior, unchanged) until `app.souldustrevival.com` is registered as a Cloudflare custom domain and the three env vars are set together at build time** — neither has happened yet.
- **2026-11-11 (even later still) — mitigated the specific gap that let the save-on-navigate bug (entry just below) reach production, after being asked why the QA suite hadn't caught it.** New `qa/e2e/specs/race-conditions/` category + `qa/e2e/fixtures/networkThrottle.ts` deliberately reintroduces realistic network latency into tests for any autosave-then-navigate flow (a local dev server's near-zero latency is exactly why the original bug was invisible to every existing test). Added a real WebKit-engine Playwright project (`mobile-webkit`, scoped to just that new folder) since the existing "mobile" project is Chromium with a resized viewport and can't reproduce a Safari-specific timing quirk. New `lib/hooks/pendingSaveRegistry.ts` is an available (not yet wired in) stronger alternative to `keepalive: true` for a future autosave that needs it. **Found a real environment limitation, not a project bug**: WebKit can't actually reach the local dev server in this session's own sandbox (requests get silently upgraded to HTTPS at the network layer) — documented in `qa/CONVENTIONS.md`, re-verify on a real machine/CI before relying on it. No production code changed, no redeploy. `npm run verify`, `npm test` (281, 4 new), and the full suite on both working projects clean. See CLAUDE.md's same-dated entry for the full story.
- **2026-11-11 (even later) — fixed all 10 findings from the QA audit below, a live-reported save-on-navigate bug, and an open-redirect caught during this session's own fix, with the required security/code-quality review run against everything.** Headline fixes: the mobile nav bar is now reachable (Profile kept outside the scrollable region so its dropdown is never clipped); My Library and the study listing page show the real product title, not a study's raw internal title; the Study tab's first Part no longer sits open-but-unread; checkout success now prices a "both"-format order's two lines correctly; `/account` has a real session guard and order history; `/login`/`/signup` redirect an already-authenticated visitor (a real infinite-redirect-loop this introduced was caught in testing and fixed before shipping); a brand-new admin editor (`components/admin/StudyContentEditor.tsx`) lets an admin edit or create a Study lesson's full structured content for the first time, no more one-off scripts; small Kind-badge and active-nav-indicator additions. Plus: a real save-loss bug reported live (an answer typed into a question block could be lost if the reader navigated away right after typing — fixed with `fetch(..., { keepalive: true })`), and an open-redirect this build's own login/signup fix could have introduced, found and fixed via `lib/auth/safeRedirect.ts` before ever shipping. The required review (5 parallel angles + a dedicated security pass) found and fixed one real IDOR-shaped gap (a lesson's question-block save didn't check the block belonged to that lesson) plus 4 smaller correctness fixes. `npm run verify`, `npm test` (277, 5 new), and the full `qa/` suite (208 specs × 2 viewports = 416 checks) all clean. See CLAUDE.md's same-dated entry for the complete writeup and `qa/findings/FINDINGS_2026-11-07.md` for each finding's fix note. **Deployed to Cloudflare the same session.**
- **2026-11-11 (later) — built a reusable, automated-plus-manual QA regression suite (`qa/`) per explicit request, and ran the first full audit pass, surfacing a severe mobile nav bug and several real app bugs (not fixed, per the request's own research/audit framing).** 195 Playwright specs × 2 viewport projects (390 checks) plus 10 manual checklists, covering the whole app: storefront, checkout, account/auth, My Library, the Study and Devotional readers, the full admin console, and cron/social/connections. Headline findings: the public nav bar is completely unreachable at mobile widths (no responsive handling at all, unlike the admin nav); My Library shows a study's raw internal title instead of its product's storefront title (a second, broader instance of the already-documented devotional-title bug); the Study tab's first "Part" is open by default but never marked read; the checkout success page mis-prices/collapses line items for a "both"-format order. Full list with severities and recommendations in `qa/findings/FINDINGS_2026-11-07.md`; full infrastructure design (the magic-link-without-email login helper, the isolated local-Postgres dev server, fixture inventory) in `qa/README.md`/`qa/CONVENTIONS.md`. `npm run verify` and `npm test` (272, unchanged) both clean. See CLAUDE.md's same-dated entry for the complete writeup.
- **2026-11-11 — re-verified the Study reader against `study_template.html` field by field and fixed two real gaps: the Passage tab was missing its whole "Hide It in Your Heart" memorization section, and a Greek station with no inline word match had no fallback way to reach its study.** `npm run verify` and `npm test` (272, unchanged) both clean; verified live against the real Colossians data. See CLAUDE.md's same-dated entry for the full design and what was deliberately left as-is. **Not yet redeployed to Cloudflare.**
- **2026-11-10 — found and fixed three real production bugs in the checkout → payment → webhook flow (Stripe SDK hanging on Workers, the webhook never verifying, the cart never clearing), created the missing Stripe webhook endpoint, and worked around a Cloudflare Access conflict to get it actually delivering.** Verified end-to-end with a real test purchase: order status correctly flips to `paid` and the webhook reaches the Worker. See CLAUDE.md's same-dated entries for the full story. **One real stuck order from before the webhook existed (`4abcdde9-...`) still needs manual reconciliation** — this session's sandbox refused the one-off script that would fix it; needs the user's own terminal or a future session's explicit approval.
- **2026-11-10 — fixed a breadcrumb bug the Study-reader chrome rebuild below introduced, built the devotional reader's own 4-view app shell (Today / The Year / Journal / Six Faces of the Dust) against a new `soul-dust-psalms-365/` reference, and ran the question-answer backfill against the real database (user approved).** Real per-account progress tracking (not localStorage) drives the Year calendar's stats/markers, and "A Question to Sit With" is now a real saved answer (365 real days + 1 seed lesson backfilled, 0 duplicates, confirmed live). `npm run verify` and `npm test` (272, 5 new) both clean. See CLAUDE.md's same-dated entries for the full design and review notes. **Not yet redeployed to Cloudflare.**
- **2026-11-09 (latest) — rebuilt the Study reader's header/tab chrome and the Work the Word tab to match soul-dust-interactive's own `study_template.html` prototype (progress ring, week-picker sheet, per-tab done dots, a one-station-at-a-time stepper instead of all 5 stacked), after the user tried the first pass on staging and said it didn't look like the reference.** No schema change, no new dependencies. `npm run verify` and `npm test` (267, unchanged) both clean; verified in-browser against the real live Colossians data (temporary/reverted session bypass, confirmed via `git status --short`). See CLAUDE.md's same-dated entry for the full design and the security/code-quality review notes. **Not yet redeployed to Cloudflare** — no migration dependency this time, so it can go out as soon as it's approved.
- **2026-11-09 (newest yet) — built the interactive Study reader's 5 tabs (Study / Passage / Work the Word / Live It / Lift Up) against the real Colossians study.** The migration (`lessons.studyContent`), the backfill (12 real weeks), and the Cloudflare redeploy all ran successfully the same day, with the user's explicit go-ahead — this is now live. `npm run verify` and `npm test` (267, unchanged) both clean. See CLAUDE.md's same-dated entry for the full design (the backfill script reusing `soul-dust-interactive`'s own already-verified parsed data, the 5 tab components, the Greek-word bottom sheet, the 5-minute prayer timer).
- **2026-11-05 — added a "both" product format (two independent purchases: physical + digital), Delete buttons for products/blog posts/studies, removed the product-image alt-text requirement, and widened the admin layout — code-complete and fully tested, but blocked on a production migration this session couldn't run (see "3. Database" above).** `npm run verify` and `npm test` (198 tests, 21 new) both clean against the isolated local test database. See CLAUDE.md's same-dated entry for the full design (per-order-item `variant`, separate Stripe prices per variant, the product-delete safety checks, the study-delete cascade). **Action needed before any of this works anywhere that shares the real database (including local dev): run `npm run db:migrate` yourself.**
- **2026-11-05 — corrected the local-Postgres fix below: `DATABASE_URL` stays on the real Supabase project (local dev and staging share data, as explicitly wanted) and test isolation now happens automatically via a separate `TEST_DATABASE_URL`, enforced in `vitest.setup.ts`.** The previous fix pointed `DATABASE_URL` itself at a local Postgres for both dev and test, which broke the actual requirement and briefly looked like a second data-loss incident (it wasn't — the real Supabase project was confirmed untouched). Also fixed a connection-exhaustion bug this surfaced (`lib/db/client.ts` now pools connections for local/test instead of opening one per call, and `vitest.config.mts` caps worker concurrency). Verified: 3 consecutive clean `npm test` runs, and local dev confirmed showing real production data again. See CLAUDE.md's same-dated entry for the full story, and `.env.example`/this file's "3. Database" section for the corrected setup steps.
- **2026-11-05 — set up a real local Postgres for dev/test (structural fix, not another per-incident patch), so `npm test` can no longer leak into the real connected Supabase project.** Prompted by two separate real-data leaks in one session (see the entry just below, and the earlier "Test Product" incident). `.env.local`'s `DATABASE_URL` had pointed at the real Supabase project since it was first connected, contrary to this file's own documented intended setup. Brought an existing-but-stale local `soul_dust_revival_dev` database current (migrations `0001`-`0003` applied directly via `psql`, since `drizzle-kit migrate` forces TLS a local Postgres doesn't support), fixed `lib/db/client.ts` to only add TLS for a non-localhost connection, and switched `DATABASE_URL` locally. `MIGRATION_DATABASE_URL` is untouched and still targets the real project. Verified the full test suite passes against the local DB and that the real Supabase project is untouched by that run (still exactly 2 real users, 3 real products). See CLAUDE.md's same-dated entry, `.env.example`, and this file's "3. Database" section for the full writeup and setup steps.
- **2026-11-05 — found and cleaned up a second live-data leak (8 fake admin users in the real connected Supabase database), caused by the same `pg`-concurrency bug fixed earlier this session.** The user noticed the admin Users table looked off; a direct query against the real database (not through the site) found 8 fake `admin-{uuid}@example.com` rows alongside the 2 real accounts, all created today. Root cause: `lib/admin/guard.test.ts` ran concurrent inserts/deletes on one shared `pg` client before this session's own sequential-await fix was applied — every test run in this environment hits the real connected Supabase project, not an isolated database, so the leaked rows landed in production the same way the earlier "Test Product" incident did. Deleted the 8 fake rows (confirmed via before/after count) with the user's go-ahead, and added an `afterAll` safety net to `guard.test.ts` so a repeat of this failure shape can't silently accumulate again. See CLAUDE.md's same-dated entry for the full writeup.
- **2026-11-05 — redeployed with the Hyperdrive fix, then found and fixed two more deploy-only bugs the redeploy surfaced: missing product/book images, and every blog/leader-resource page 500ing (jsdom isn't Workers-compatible, and the first two sanitizer replacements tried were silently broken).** Full story in CLAUDE.md's same-dated entries and SECURITY.md's "Database access model" and "XSS / rich text" sections; also set up the `staging.souldustrevival.com` custom domain and Cloudflare Access gate (dashboard work, done by the user). Headline lesson from this pass: **a build-time env-var bug doesn't error — it silently bakes in whatever placeholder was present**, and this bit twice in a row (`NEXT_PUBLIC_SUPABASE_*`, then `R2_PUBLIC_BASE_URL`) before the pattern was recognized; and **a passing test suite doesn't mean a security-critical function still works** — two DOMPurify-based sanitizer swaps passed typecheck/build/tests clean while silently leaving `<script>`/`onerror` payloads unsanitized, caught only by testing actual dangerous input by hand. `lib/sanitize/html.test.ts` now exists specifically to close that second gap.
- **2026-11-05 — fixed the Cloudflare Workers DB-500 (Hyperdrive + node-postgres migration), a broken `next build` it introduced, and a pre-existing stale-typecheck-cache issue found along the way.** Three things in one pass, documented in full in CLAUDE.md's same-dated entry:
  (1) **Hyperdrive migration.** Created a Hyperdrive config (`wrangler hyperdrive create`) and switched `lib/db/client.ts` from a module-level `postgres`/postgres.js singleton to an async `getDb()` factory using `pg`/node-postgres, per Cloudflare's own documentation that Drizzle + postgres.js over Hyperdrive is unsupported and that a Workers DB client must be created fresh per request, never cached in module scope. All ~55 call sites (production code and tests) converted from `import { db }` to `const db = await getDb()`. Removed the now-unused `postgres` package dependency.
  (2) **Fixed a `next build` regression this introduced.** `next.config.js` called `initOpenNextCloudflareForDev()` unconditionally (its own comment claimed "No-op in production", which was true before this build but stopped being true the moment a `hyperdrive` binding existed in `wrangler.jsonc`) — with the binding present, the unconditional call made `next build` itself (so `npm run verify`, and CI, with no request ever handled) throw an unhandled rejection demanding a local Hyperdrive connection string it has no use for. Fixed by gating the call to `process.env.NODE_ENV === "development"`, so it only runs for the actual `next dev` server, which is the only place it was ever needed.
  (3) **Fixed a stale `.tsbuildinfo` masking ~60 pre-existing type errors.** Unrelated to the Hyperdrive work, found while confirming a clean typecheck after it: `tsconfig.json`'s `"incremental": true` cache had been silently hiding ~60 real `TS18046`/`TS2339` errors (all `await res.json()` typed as `unknown`, then a property accessed on it directly) across ~30 files, all pre-existing on `main` before this build (confirmed via `git stash` + a clean `tsc --noEmit` against the committed branch). Fixed each with a minimal `as {...}` type assertion matching the properties actually accessed, rather than modeling full API response types.
  Also fixed a real (if minor) test bug found in the same pass: `lib/admin/guard.test.ts`'s `beforeEach`/`afterEach` ran three `db.insert()`/`db.delete()` calls via `Promise.all` on one shared `Client` — a single (non-pooled) `pg` `Client`, unlike the old postgres.js client, doesn't support concurrent queries and logs a deprecation warning that becomes a hard error in `pg@9`; changed to sequential `await`s.
  `npm run verify` (typecheck + lint + build) and `npm test` (169 tests) both clean. **Not yet done:** the Worker has not been redeployed with this fix (see "4. Deployment" above) — the live site is still running the pre-fix code.
- **2026-11-04 — Built the missing `/studies` and `/studies/[slug]` pages,
  found and fixed while testing checkout (see the entry below), plus a
  round of nav/layout consistency fixes that came out of manually trying
  the new pages.** `app/(study-app)/studies/page.tsx` lists the logged-in
  user's entitled, published studies with a progress bar (completed/total
  lessons, via `lessonProgress`); `app/(study-app)/studies/[slug]/page.tsx`
  lists that study's published lessons with per-lesson status, gated the
  same way the existing lesson page already is (`getSession` +
  `hasEntitlement`, redirecting to `/login` or the product page exactly
  like `[lessonId]/page.tsx` does) — both pages mirror that page's own
  privacy-conscious `generateMetadata` (never leaking a gated study's title
  to someone without access). `components/study/ProgressBar.tsx` (existing,
  previously unused anywhere) switched from ad hoc `neutral-900`/`neutral-100`
  to the brand tokens (`ink`/`dusk`) and gained `role="progressbar"` +
  `aria-valuenow/min/max`. **Follow-on fixes found by actually using the new
  pages, not just reviewing the diff:**
  (1) the whole `(study-app)` route group had no header/nav at all (only an
  activity-tracking heartbeat) — no logged-in indicator, no way back to the
  rest of the site; fixed by reusing the existing marketing `SiteHeader` in
  `app/(study-app)/layout.tsx` instead of building a second, different
  header, so every page in the app now shares one nav.
  (2) `SiteHeader`'s nav scrolled horizontally on narrow phones
  (`overflow-x-auto`) — a real but unwanted interaction on any viewport, not
  just a mobile compromise; replaced with `components/marketing/SiteNav.tsx`,
  a client component with a fixed budget of 4 always-visible items (3 links
  + cart) and the rest in an accessible "More" dropdown
  (`aria-haspopup`/`aria-expanded`, closes on outside click/Escape/picking an
  item, ~44px touch targets). Added "Your Studies" to the nav for logged-in
  users while here — it didn't exist before and there was no way to get to
  the new `/studies` page from the homepage at all. See `RESPONSIVE.md` for
  the updated nav-behavior note.
  (3) `/account` had no header either, for an unrelated reason: it lived at
  `app/account/`, never moved into the `(marketing)` route group the way
  `/login`, `/signup`, and `/checkout/success` all are — moved to
  `app/(marketing)/account/` (`git mv`, URL unchanged, route groups don't
  affect the path) so it picks up `SiteHeader`/`SiteFooter` like every other
  authenticated-but-marketing-layout page.
  (4) `/account`'s content column was `max-w-lg` (512px) against everything
  else in `(marketing)` using `max-w-5xl` (1024px) — widened to match, since
  there was no real reason for it to be narrower once it had the same header
  sitting above it.
  `npm run typecheck`/`lint`/`build` all clean throughout. Verified live,
  repeatedly, against the real logged-in session from the Stripe test below
  — not just a code read: the study list, lesson list, nav overflow, and
  account page were all actually clicked through in a real browser after
  each fix, which is how (2)-(4) were caught in the first place (none of
  them would show up in `npm run verify`). **Not done:** no automated tests
  were added for the new pages or `SiteNav` — this project has no
  precedent for testing Server Component pages directly (all existing tests
  are for API routes, schemas, and `lib/`), so this matches the existing
  pattern rather than introducing a new one; `SiteNav`'s interactive
  behavior (dropdown open/close, keyboard, outside-click) was verified
  manually, not with a component test.
- **2026-11-04 — Stripe account connected; checkout → webhook → entitlement
  flow verified end-to-end against real Stripe test mode, real Supabase
  Auth, and the real Supabase Postgres project.** `STRIPE_SECRET_KEY`
  (`sk_test_...`) and a live `STRIPE_WEBHOOK_SECRET` from `stripe listen`
  are in `.env.local`; the Stripe CLI is authorized against the "Bible
  Studies Inc sandbox" Stripe account. Ran a real purchase: logged in via a
  real magic-link email, bought "Foundations: A 6-Week Study" ($29.00) with
  Stripe's `4242...` test card, confirmed `stripe listen` forwarded
  `checkout.session.completed` and the app returned `200`, and confirmed
  directly in Postgres that the order (`status: paid`) and a matching
  `entitlements` row (`source: purchase`, no expiry, granted_at matching the
  order) were both created. **Found and fixed a real bug along the way:**
  `proxy.ts` (Next.js 16's middleware) only set CSP headers — it never
  refreshed the Supabase session, so any Server Component calling
  `getUser()` with an expiring/expired access token (e.g. `SiteHeader`,
  rendered on every marketing page via `getSession()`) crashed with
  "Cookies can only be modified in a Server Action or Route Handler" instead
  of silently refreshing, which also meant sessions weren't reliably
  persisting across requests. Fixed by adding the standard
  `@supabase/ssr` session-refresh call to `proxy.ts`, writing refreshed
  cookies onto both the request and response the same way
  `lib/supabase/server.ts` already does for Route Handlers/Server Actions.
  `npm run typecheck` and `npm run lint` are clean; verified live by
  reproducing the crash, applying the fix, and confirming a fresh
  login completed without it. **Also found, not fixed (see "Known gaps"
  above):** `/studies` and `/studies/[slug]` don't exist — login, signup,
  and purchase-success all redirect there and currently 404. Worked around
  for this test by confirming the order/entitlement directly in Postgres
  rather than via the study UI. **Not yet done:** the production webhook
  endpoint (needs a deployed domain; see section 4), and a test promo code
  hasn't been created/exercised yet.
- Added admin user creation and editing to `/admin/users`. `POST /api/admin/users`
  lets an admin invite a new user by email (role, optional full name/country) —
  Supabase Auth's `inviteUserByEmail` mints the account (magic-link only, no
  password) and emails the sign-in link, and the `users` row is only inserted
  after that succeeds, with the auth account rolled back if the insert fails
  (e.g. a duplicate-email race). `PUT /api/admin/users` edits an existing
  user's email/full name/country, syncing an email change to Supabase Auth
  first so magic-link sign-in keeps working. Role changes are untouched —
  still exclusively the existing `PATCH` endpoint and its self-role-change
  guard, so neither new endpoint is a privilege-escalation path (both still
  require `requireAdmin()`, same as every other `/admin/users` method). New
  `adminUserCreateSchema`/`adminUserUpdateSchema` in `lib/validation/schemas.ts`
  (a shared `countryCodeSchema` was factored out of `checkoutSchema` in the
  process). UI: `components/admin/AddUserForm.tsx` (new) and an inline edit
  row added to `components/admin/UserRoleTable.tsx`. `users.fullName` was
  already a column but had never been documented in `PRIVACY.md` — added it,
  plus a note that `/admin/users` is a second source of `users` rows besides
  self-signup. 17 new tests (schema validation + route behavior, including
  the rollback-on-insert-failure and email-sync-failure regression cases);
  161 tests pass, `npm run verify` is clean. **Not exercised against the real
  Supabase project**: `inviteUserByEmail`/`updateUserById` are mocked in tests
  per this project's convention for genuine external services, and the
  authenticated `/admin/users` UI itself wasn't driven live in this session
  (no admin session available in the dev browser) — confirmed only that the
  page still renders with no console errors and correctly redirects to
  `/login` when unauthenticated. Verify the actual invite-email round trip and
  the new-user flow against the real Supabase project before relying on it.
- Connected real X and Facebook/Instagram accounts end-to-end against the
  local dev server. Created the X Developer app and Meta Developer app, wired
  `X_CLIENT_ID`/`X_CLIENT_SECRET`/`FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` into
  `.env.local`, and tested the full OAuth connect flow for both through
  `/admin/settings/connections`. Found and fixed three real setup/config gaps
  along the way: (1) `TOKEN_ENCRYPTION_KEY` in `.env.local` was a leftover
  placeholder that decoded to 48 bytes instead of the required 32, which threw
  a 500 on the very first successful OAuth callback (`lib/crypto/tokenCipher.ts`);
  regenerated a real key. (2) The Facebook app's permission catalog was
  missing `pages_manage_posts` — it only gets exposed once the **"Manage
  everything on your Page"** use case is added in the Meta dashboard (the
  Instagram use case alone doesn't include it), so the first few connect
  attempts failed with an "Invalid Scopes" error from Facebook's OAuth dialog.
  (3) Even after all five scopes (`pages_show_list`, `pages_manage_posts`,
  `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`)
  showed as genuinely granted on the token (confirmed via `/me/permissions`),
  `/me/accounts` kept returning an empty Page list — because the Page was
  shared through Meta's newer Business-asset picker dialog ("Choose the Pages
  you want Soul Dust Revival to access" / Business Integrations), which
  requires the `business_management` scope for `/me/accounts` to actually
  return that Page; added it to the requested scopes in
  `app/api/admin/connections/facebook/authorize/route.ts`. Also set up Resend
  custom SMTP for Supabase Auth (Supabase's own default mailer has a very low
  rate limit, which blocked repeated local signup testing) and registered
  temporary `http://localhost:3000/...` callback URIs on both the X and
  Facebook apps alongside the production ones, for local testing — these
  should eventually be removed once no longer needed for local dev.
  **Not yet exercised**: actually publishing a post through either platform
  (only the OAuth connect flow was tested, not `lib/social/publish.ts`), the
  X token-refresh path, and the Facebook multi-Page picker (this account only
  has one Page).
- Connected the real Supabase project ("Soul Dust Revival Website/Web App
  Project") and ran migrations + seed against it. The project already had
  the full 17-table schema from earlier manual work (all rows empty). Hit
  the known `drizzle-kit` env-loading bug again (`MIGRATION_DATABASE_URL`
  resolves empty inside drizzle-kit's own process) and worked around it the
  same way as before (parent-process env preload + `spawnSync`). That run
  then surfaced a second, real bug: migration 0002 had been applied by hand
  previously (to route around the same env bug) but was never recorded in
  `drizzle.__drizzle_migrations`, so `drizzle-kit migrate` tried to re-run
  its `ALTER TABLE ADD COLUMN` statements against columns that already
  existed, failing with no useful error message. Fixed by inserting the
  correct tracking row directly (sha256 hash of the migration file's exact
  contents, confirmed against the two already-correct rows for migrations
  0000/0001). `db:migrate` now runs clean; `db:seed` loaded 2 products, 1
  study, 1 lesson, 1 blog post. See the `2026-11-04` entry in CLAUDE.md for
  the exact method, since any future hand-applied migration needs the same
  manual tracking-row fix. Also corrected this file's own stale checklist:
  Cloudflare was already set up (`wrangler whoami` confirms a real
  authenticated account) — it had just never been checked off.
- Added dual purchase routing for products: physical books (mostly sold via
  Amazon) can now offer either or both of a Stripe "Buy Now" button and an
  "Buy on Amazon" link-out button. New `products` columns: `amazonUrl`,
  `sellOnStripe` (default `true`). Digital products are still Stripe-only
  (entitlements require the webhook). Security review of this build found and
  fixed a High-severity domain-validation bypass in the admin's `amazonUrl`
  input (a regex over the raw URL string, not anchored to the end of the
  hostname, accepted lookalike hosts like `amazon.com.evil.com`) and a
  Medium-severity business-logic gap (`/api/checkout` didn't check
  `sellOnStripe`, so a crafted request could still buy an Amazon-exclusive
  product through Stripe). Both fixed; see the `2026-11-03` "Amazon/Stripe
  purchase routing" entry in CLAUDE.md. 138 tests pass, `npm run verify` is
  clean.
- Added book cover PDF upload for `type: "book"` products: admins upload a single
  full-wrap KDP-style cover PDF, the server splits it into back/front cover images
  (new `unpdf` + `@cf-wasm/photon` dependencies), and the storefront detail page
  shows a scrollable front/back gallery. New `products` columns: `backImageUrl`,
  `backImageAlt`, `coverPdfUrl`. Required code-quality and security reviews run
  against this feature found and fixed a High-severity DoS risk (unbounded
  image-decode memory from a crafted PDF) and a High-severity missing
  server-side alt-text enforcement; see the `2026-11-03` "book cover PDF upload"
  entry in CLAUDE.md for full details and two low-severity deferred items.
  134 tests pass, `npm run verify` is clean.
- Ran a full `SECURITY_REVIEW.md` checklist pass (5 parallel sub-reviews covering every
  section) plus `npm audit`. Fixed an SSRF gap in X image publishing, a missing `Secure`
  flag on the Supabase auth cookie, unsanitized blog markdown on write, and encrypted
  OAuth tokens being over-serialized to the connections settings page's client bundle.
  Two items deferred pending a decision — see the `2026-11-03` "full SECURITY_REVIEW.md
  checklist pass" entry in CLAUDE.md for exactly what and why. 114 tests pass, `npm run
  verify` is clean.
- Expanded the automated test suite: added unit tests for `lib/validation/schemas.ts`,
  `lib/crypto/tokenCipher.ts`, `lib/stream/signing.ts`, `lib/admin/guard.ts`, and
  `lib/email/send.ts` (previously untested modules). 108 tests pass (`npm test`),
  `npm run verify` is clean. Ran the project's `code-review` skill (5 finder
  angles + verification) against the changeset; fixed a path-traversal gap in
  the upload-key schema, a token-cipher malformed-check false positive/negative,
  a Stream-signing test env-var leak across worker-shared test files, and a
  checkout test cleanup bug that could mask a real pricing regression behind a
  foreign-key error. See the `2026-11-03` entry in CLAUDE.md for details,
  including one deferred finding (upload keys are still client-supplied rather
  than always server-generated, per SECURITY.md's documented design — needs a
  decision before changing those routes). Tests ran against the live Supabase
  dev project (not a separate local/throwaway Postgres as this file's "Database"
  section below assumes) since it was confirmed empty beforehand and left empty
  after — see SECURITY_REVIEW.md's testing ground rules for why a dedicated
  staging Supabase project should replace this once real data exists.
- Set up Resend for transactional app email (order confirmations only —
  no marketing/broadcast or inbound-inbox usage). Created the
  `souldustrevival.com` sending domain in Resend via the official Resend
  MCP connector (no API key ever pasted in chat). The domain's DNS was on
  Squarespace with a live site (A records) and active Google Workspace
  mail (MX/SPF) already on it, so moved DNS management to Cloudflare
  first (Free plan — "Add a domain", not "Transfer", so registration
  stays at Squarespace) and re-created every existing record there before
  cutting over nameservers, specifically: the 4 Squarespace `A` records,
  `CNAME www`, `CNAME _domainconnect`, root `MX`/`TXT` for Google
  Workspace, and the Google DKIM TXT record — all set to Cloudflare's
  "DNS only" (unproxied), since Squarespace manages its own SSL/CDN and
  breaks if also proxied. Added Resend's 4 DNS records (DKIM TXT, SPF MX,
  SPF TXT, `rsend` CNAME) alongside them. Verified via `dig` before and
  after the nameserver cutover that the existing Google MX/SPF and
  Squarespace A/CNAME records were untouched. Created a `sending_access`
  API key scoped to just this domain (not `full_access`) and wrote it
  directly to local `.env` (git-ignored, never committed or restated in
  chat after creation). `lib/email/send.ts`'s `from` address now reads
  `RESEND_FROM_EMAIL` from env and prefixes the display name in code
  (`RESEND_FROM_EMAIL` is validated as a bare email by `lib/env.ts`'s
  `z.string().email()`, so the display name can't live in the env value
  itself — see "Scaffold deviations" in CLAUDE.md). Domain verification
  completed shortly after the build (`rsend` CNAME verified quickest;
  DKIM and SPF took longer — AWS SES-side propagation, not DNS) and a
  real test send via the Resend API succeeded to an inbox at the domain.
  Order-confirmation sending is confirmed working end-to-end.
- Upgraded `pdf-parse` 1.1.4 -> 2.4.5, resolving the provenance question
  flagged just below in this log. Further digging (full publish-history
  check, not just the two version dates that first looked suspicious)
  showed the same maintainer has owned this package since its original
  2018 release — the package went dormant for ~7 years, then that same
  original author resumed work with a full rewrite, not a takeover.
  `2.x` is built on Mozilla's `pdfjs-dist`, has a security policy and test
  coverage, and explicitly supports Cloudflare Workers. Migrated
  `lib/import/parsePdf.ts` to the new class-based API, removed the now-
  obsolete `@types/pdf-parse` (v2 ships its own types), and verified text
  extraction against real generated PDFs rather than trusting the
  type-check alone — including tracking down one apparent regression (a
  mid-word line break) to the test PDF generator's own crude rendering,
  not an actual pdf-parse defect.
- Checked every package SECURITY_REVIEW.md names for "particular attention"
  (`jsonwebtoken`, `pdf-parse`, `mammoth`, `marked`, plus `isomorphic-dompurify`
  as the actual XSS sanitizer) against their latest releases, not just
  `npm audit`'s CVE database. `jsonwebtoken` and `mammoth` are already on
  latest. `isomorphic-dompurify` looked 2 majors behind (2.36 vs 4.6) but
  the wrapper's version number is misleading — the actual sanitization
  engine it wraps, `dompurify@3.4.17`, is already the real current
  release; the wrapper's major bumps are about its own jsdom/Node-version
  support, not the sanitizer itself. `marked` is a few majors behind but
  its HTML output is always passed through DOMPurify before storage/
  render (`lib/markdown.ts`), so the practical exposure is low. `pdf-parse`
  turned up something that first looked like a provenance red flag —
  resolved above, see the entry just above this one.
- Implemented the `login_events` retention gap from "Known gaps": a new
  `POST /api/cron/prune-login-events` (13-month default window — see
  `PRIVACY.md`) deletes rows older than the cutoff, following the same
  `isValidCronRequest`-authenticated pattern as `social-publish`/
  `social-metrics`. Verified against real Postgres with fixture rows at
  20/14/10/1 months old (via `next dev`, real `curl` calls, not just a
  code read): confirmed exactly the two rows older than 13 months were
  deleted, the two newer ones survived, and the endpoint correctly
  rejects both a missing and a wrong `CRON_SECRET` (403 either way).
  Added a permanent regression test (`route.test.ts`) codifying that same
  verification. `PRIVACY.md`/`BUILD_TASKS.md` updated; still needs an
  external scheduler calling it once deployed, same as the two existing
  cron endpoints.
- Fixed a `npm run db:seed` bug caught by actually running the documented
  command from a clean shell: it never loaded `.env.local` (same class of
  bug `drizzle.config.ts` had earlier — fixed there via
  `process.loadEnvFile()`, but that approach doesn't transfer to the seed
  script since it has to run before the `db` import is evaluated, and
  executable code can't precede an import in the same file). Fixed with
  Node's `--env-file` CLI flag instead. Verified by running it from a
  clean shell: now reaches the real DB.
- Ran an automated code-review pass for N+1/unbounded-query patterns
  across `app/admin/**` and `app/api/admin/**`, per
  CODE_QUALITY_REVIEW.md's Performance checklist item, and fixed every
  real finding: (1) `/admin/reports/social` loaded an **entire
  ever-growing metrics table** on every page view (its own comment admits
  it's an append-only time-series table) — replaced with a `DISTINCT ON`
  query scoped to the targets actually displayed, verified against real
  Postgres with out-of-order timestamp fixtures; (2) the `.docx`/`.pdf`
  study import route did **2 sequential DB round-trips per lesson** — a
  real document can split into dozens — batched into 2 queries total,
  verified the batching doesn't mismatch lesson content under real
  Postgres; (3) the admin users list query was duplicated across the page
  and its API route, both unbounded — extracted to one helper with a
  safety-cap limit; (4) products/studies/blog/leader-resources admin
  lists all unbounded — added safety caps; (5) three POST routes
  (leader-resources, lessons, content-blocks) fetched every existing row
  just to read `.length` — replaced with `db.$count()`, verified directly
  against real Postgres; (6) the social posts list fetched the *entire*
  targets table and filtered it in JS — scoped with `inArray()` instead.
  Left the reorder-loop N+1s and the webhook entitlement-insert loop
  alone — all bounded to small, human-driven lists, genuinely low
  severity, not worth the complexity of batching.
- Ran a real automated accessibility audit (axe-core, against the running
  dev server — not just `jsx-a11y` lint, which only catches static-markup
  issues) across the storefront/checkout/account pages. Found and fixed 3
  real, previously-missed issues: (1) almost every page had **no
  `<title>` at all** (WCAG 2.4.2) — only 3 pages happened to set their
  own, and the root layout had no fallback; fixed with a title template
  plus real per-page titles, including `generateMetadata` for gated pages
  that mirrors each page's own entitlement/role check so a gated title
  can't leak to someone without access; (2) the brand color `ember` on
  `parchment` failed contrast (3.96:1, needs 4.5:1) in ~20 places —
  darkened to the smallest shade that clears it, confirmed with the user
  first since it's a protected design-system token; (3) two pages
  (`/checkout`, `/account`) were missing a heading in some render states
  even though their main path has one. Also fixed `text-neutral-500`
  (generic Tailwind gray, 4.24:1) failing contrast across 24 files,
  bumped to `text-neutral-600` (6.99:1). See ACCESSIBILITY.md for the
  full writeup. Not a substitute for the full manual run ACCESSIBILITY.md
  already calls for — admin, leader, and studies/lessons pages weren't
  exercised beyond `generateMetadata` without real auth, and no screen
  reader was used.
- Added Vitest and 17 tests covering the checkout → webhook → entitlement
  flow specifically, per CODE_QUALITY_REVIEW.md's own explicit
  recommendation ("no test runner... add tests around the checkout →
  webhook → entitlement flow first, since a bug there costs money").
  All run against the real local Postgres, not a mocked DB (`vi.mock()`
  used only for genuine external services — Stripe, Resend): entitlement
  checks (permanent/expiring/expired, no cross-user leakage), webhook
  idempotency (a second call for the same Stripe redelivery is a true
  no-op — the actual bug class that guard exists to prevent), a
  regression test for the `getOrCreateStripePrice` race-condition fix
  from earlier in this build (concurrent checkouts of the same new
  product now provably converge on one winning Stripe price), and
  checkout pricing integrity (a tampered client price is ignored, the
  order total always reflects the DB price). `npm test` deliberately
  isn't part of `npm run verify`, since it needs a real DB connection
  `verify` can't assume exists everywhere it runs. Confirmed zero test
  data leaks into the dev database after a full suite run. Also fixed two
  stale "Next.js 15"/"Cloudflare Pages" mentions in CLAUDE.md/README.md
  left over from this build's earlier Next 16 and Cloudflare-adapter work.
- Added a nonce-based Content-Security-Policy via `proxy.ts` (Next 16's
  mandatory rename of `middleware.ts`) — a real gap in
  SECURITY_REVIEW.md's own checklist ("Security headers set (CSP, HSTS,
  X-Content-Type-Options, frame protections)") that an earlier review pass
  missed, caught now going through the checklist again. Strict nonce +
  `'strict-dynamic'` on `script-src`, no `'unsafe-inline'`; `style-src`
  deliberately has no nonce (`'self' 'unsafe-inline'` only) after finding
  via a real `wrangler dev` test that this app's inline `style={{}}` props
  (e.g. the homepage's animated dust motes) get silently blocked by a
  nonce'd style-src with no working fallback, since CSP nonces never cover
  `style=""` attributes. `connect-src`/`img-src`/`media-src` scoped to
  exactly what the browser actually calls (Supabase, direct-to-R2,
  Cloudflare Stream) — see SECURITY.md for the full writeup. Before
  implementing, flagged and got explicit confirmation on a real risk this
  surfaced: a nonce requires `proxy.ts`, which on this adapter routes
  through `@opennextjs/cloudflare`'s Node.js-middleware support — the
  adapter's own build output calls this "experimental ... not officially
  maintained," unavoidable in Next 16 since proxy always runs Node.js
  runtime now with no edge-runtime option. `/account` needed `export const
  dynamic = "force-dynamic"` (nonces require dynamic rendering everywhere)
  — moved its content to `AccountPageClient.tsx` since that export is
  silently ignored in a `"use client"` file, caught by the build output
  still showing `/account` as static after the first attempt. Verified
  against the real `wrangler dev` runtime, not just a code read: correct
  CSP header, zero console violations, intact hydration/styling across
  the homepage, `/login`, and `/account`. Not yet exercised against a real
  Cloudflare deploy.
- Found and fixed a real security-header gap in this build's own
  Cloudflare adapter setup, by actually running the app under `wrangler
  dev` (the real local Workers runtime) rather than trusting the config
  by inspection. With OpenNext's default `run_worker_first=false`,
  statically-prerendered pages (e.g. `/account`) are served directly from
  the Cloudflare ASSETS binding, bypassing the Worker — so
  `next.config.js`'s `headers()` (X-Frame-Options, HSTS, nosniff,
  Permissions-Policy) silently never applied to them. This mattered
  concretely: `/account` renders a "permanently delete my account"
  control behind a typed confirmation, exactly the kind of page
  X-Frame-Options/clickjacking protection exists for. Fixed by mirroring
  the same header set in `public/_headers` (Cloudflare's own
  static-asset-headers mechanism, which OpenNext's docs recommend for
  this exact case). Verified via `curl` against `wrangler dev` — all five
  headers now present on `/account`, matching `next.config.js` exactly.
  The same test run surfaced a second, unresolved finding: DB-backed
  dynamic routes intermittently hung under `wrangler dev` against the
  local (non-pooled) Postgres — logged under "Known gaps" to re-check
  once the real Supabase pooler exists, since that's plausibly a
  local-only artifact, not a real bug.
- Caught and fixed a real bug introduced by this build's own Cloudflare
  work: `eslint.config.mjs` never excluded `.open-next/`/`.wrangler/`
  (OpenNext's generated Worker bundle — tens of MB of bundled JS), so
  `npm run lint` crashed with a JS heap out-of-memory the first time those
  directories existed on disk. Also excluded `design-system/` (confirmed
  via grep: a Claude Code skill package for AI-assisted prototyping that
  came in with the scaffold copy, not imported anywhere in `app`/`lib`/
  `components`) — same treatment the separate "Soul Dust Revival Design
  System" brand-assets repo already got. `npm run lint` now completes
  clean (0 errors). Also bumped `drizzle-kit` 0.28 -> 0.31 (latest stable)
  for currency; verified `generate`/`migrate` still work against the real
  local Postgres. Didn't move the audit count — drizzle-kit's own
  `@esbuild-kit/esm-loader` dependency carries the esbuild dev-server
  advisory at every version up to 1.0, devDependency-only, left alone.
- Added the Cloudflare deployment adapter (`@opennextjs/cloudflare` +
  `wrangler`, both devDependencies since they're build-time only and never
  ship in the deployed Worker). The scaffold's docs always said hosting was
  Cloudflare Pages/Workers, but nothing actually wired that up — the app
  only ran as a plain Node server. Added `wrangler.jsonc`,
  `open-next.config.ts`, `public/_headers`, the dev-platform init call in
  `next.config.js`, and `preview`/`cf:deploy`/`cf:upload`/`cf-typegen`
  scripts. Confirmed Next.js 16 is supported by the adapter before doing
  this (the one named gap, Node Middleware, doesn't apply — no
  `middleware.ts` in this app). Verified beyond typecheck: ran
  `opennextjs-cloudflare build` and `wrangler deploy --dry-run` for real,
  both completing and producing a working `worker.js` — no Cloudflare
  account needed for either. That dry-run surfaced a real, not-yet-decided
  finding: the bundled Worker is ~5.2MB gzipped, over the Free plan's 3MiB
  script limit (fine on the $5/mo Paid plan) — logged under "Known gaps"
  rather than addressed, since fixing it means splitting the
  `.docx`/`.pdf` import route into its own OpenNext function, a real
  change, not a quick one. Still not exercised: an actual `wrangler
  deploy` to a real Cloudflare account, R2 incremental-cache wiring (needs
  a real bucket), and Cloudflare Stream/R2 bindings in production.
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
