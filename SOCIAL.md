# Social Media Scheduling Notes

## What this is
Admin-authored posts, scheduled once/daily/weekly, auto-published to X, Facebook, and
Instagram, with AI-drafted suggestions and basic engagement analytics. Everything here
is real, working code against each platform's documented API — but three things need
setup outside this codebase before any of it actually posts anywhere: registering an
app with each platform, deploying a cron trigger, and generating an encryption key.

## "Based on a Project" — interpretation
AI suggestions are grounded in **this project's own content** — recent published blog
posts, published studies, and a sample of actual lesson text content (not just the
study's title/description) — pulled live from the database via the shared
`lib/ai/projectContext.ts`, not Claude.ai's "Projects" feature, which has no API for
fetching project knowledge programmatically. If you meant something more specific by
"a Project" (a particular study, a particular campaign), say so and the context
gathering can be pointed at that instead.

**Model and key.** Every suggestion call goes through `lib/ai/claude.ts`, which names the
model in one place (`SUGGESTION_MODEL`, currently `claude-sonnet-5-5`, at low effort, with
the API's server-side fallback on if a request is declined). It uses the admin's own
Anthropic API key, created in the Claude Console (console.anthropic.com → API Keys; API
use is billed separately from a claude.ai plan) and pasted into Admin → Settings →
Connections. Connecting checks the key by listing models, so the check never depends on
a model that might be retired.

**Blog posts get the same AI-suggestion treatment**, using the same shared context —
see the blog admin at `/admin/blog`, which has its own "get suggestions → refresh →
accept" flow (`components/admin/BlogPostForm.tsx`) generating full title+body drafts
rather than short social copy.

## Required setup before this works end-to-end

### 1. Register an app with each platform
- **X**: [X Developer Portal](https://developer.twitter.com) → create a project/app →
  enable OAuth 2.0 → set the callback URL to
  `https://yourdomain.com/api/admin/connections/x/callback`. **Important**: X's free
  API tier has very limited write access — posting via API generally requires a paid
  access tier (Basic or above as of this writing). Check current tier limits before
  assuming the free tier will let you actually publish.
- **Facebook + Instagram**: [Meta for Developers](https://developers.facebook.com) →
  create an app → add **both** the "Manage messaging & content on Instagram" use case
  **and** the "Manage everything on your Page" use case → set the redirect URI to
  `https://yourdomain.com/api/admin/connections/facebook/callback`. Both use cases are
  required: the Instagram one alone does not expose `pages_manage_posts` in the app's
  permission catalog, which this code needs to post to the Facebook Page itself (found
  the hard way — the OAuth dialog fails with "Invalid Scopes" until both are added).
  The requested scope also needs `business_management`, even though this app doesn't
  call the Business Manager API directly — without it, `/me/accounts` in
  `app/api/admin/connections/facebook/callback/route.ts` silently returns an empty
  Page list for any Page shared through Meta's current Business-asset picker dialog
  (the "Choose the Pages you want Soul Dust Revival to access" / Business Integrations
  flow), even when every other requested permission shows as genuinely granted on the
  token. **Important**: `pages_manage_posts` and `instagram_content_publish` are both
  permissions Meta requires **App Review** for before they work for anyone other than
  your own test accounts/developers on the app. Budget real time for this — Meta's
  review process is not instant and can require a demo video and written justification.
- Put the resulting client IDs/secrets in `.env` (`X_CLIENT_ID`, `X_CLIENT_SECRET`,
  `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`).

### 2. Generate the encryption key
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Put the result in `TOKEN_ENCRYPTION_KEY`. This encrypts every OAuth token and the
Anthropic API key at rest (see `lib/crypto/tokenCipher.ts`) — losing this key means
every stored connection needs to be reconnected, so store it somewhere durable (your
host's secret manager), not just in a local `.env` file.

### 3. Cron triggers (built in, production Worker only)
Three endpoints run on a schedule, each requiring `Authorization: Bearer {CRON_SECRET}`:
- `POST /api/cron/social-publish` — every 10 minutes, publishes due scheduled posts
- `POST /api/cron/social-metrics` — daily at 06:00 UTC, refreshes engagement stats
- `POST /api/cron/prune-login-events` — daily at 06:00 UTC (see PRIVACY.md)

Since 2026-11-15 the app's own Worker runs them: `custom-worker.ts` exports a
`scheduled` handler that passes each Cron Trigger to `lib/cron/scheduledJobs.ts`, which
calls the matching routes inside the same Worker (no network hop, so Cloudflare Access
doesn't matter) with the Worker's `CRON_SECRET`. The schedules are `triggers.crons` in
`wrangler.jsonc`, set on `env.production` only; staging's list is empty on purpose.
Both Workers share one database, so one scheduler publishes posts scheduled from either
admin. Change a schedule in both `wrangler.jsonc` and `CRON_ROUTES` (a test checks they
match). Times in the composer are UTC; a post saved for a time already past goes out on
the next run.

**`npm run deploy` applies the triggers** (`wrangler triggers deploy` after switching
traffic). Uploading and promoting a version never does, which is why the first deploy
of this left the schedules unregistered.

**X images** go through `POST https://api.x.com/2/media/upload`, which needs the
`media.write` scope (added 2026-11-15). A connection made before then lacks it: X
refuses the upload with a 403 until X is reconnected in Settings → Connections.

## Character limits
Enforced both live in the composer and again server-side at post-creation time
(`lib/data/socialPlatforms.ts`, checked in `app/api/admin/social/posts/route.ts`) —
the live count is a UX aid, the server check is the actual gate:

| Platform | Limit |
|---|---|
| X | 280 characters |
| Facebook | 63,206 characters |
| Instagram | 2,200 characters (caption) |

Instagram additionally has no text-only post type — an image is required, enforced at
both the composer and the API route.

## Security notes (see also SECURITY.md)
- All OAuth tokens and the Anthropic API key are encrypted at rest (AES-256-GCM) before
  ever touching Postgres — see `lib/crypto/tokenCipher.ts`.
- Cron endpoints authenticate via a shared secret, not a user session, since they're
  called by an external scheduler, not a logged-in admin — see `lib/social/cronAuth.ts`.
- The X OAuth flow uses PKCE (not just client secret), which is the current
  recommended/required flow for X's OAuth 2.0.
- Connecting the Anthropic key makes one lightweight test call before saving it, so a
  typo'd key surfaces immediately as an error rather than as a mysterious failure the
  next time a suggestion is requested.

## X token refresh
X's OAuth 2.0 access tokens expire quickly (on the order of ~2 hours) — since posts
here are scheduled to fire unattended over days or weeks, this needed active handling,
not just storing a refresh token and hoping. `lib/social/publish.ts` checks token
expiry before every X publish attempt and refreshes automatically via
`lib/social/publishers/x.ts`'s `refreshXTokenIfNeeded`, updating the stored (encrypted)
token so the next scheduled fire doesn't need to refresh again. Facebook Page tokens
are much longer-lived and aren't refreshed the same way here — if that ever becomes a
problem in practice, the same pattern in `x.ts` is the template to follow for Facebook.

## Known limitations, honestly
- **Facebook Page selection**: if the connecting account manages more than one Page,
  a picker screen (`/admin/settings/connections/facebook-picker`) lets the admin choose
  which one to connect — the list of pages (with their access tokens) is held briefly
  in an encrypted, short-lived cookie between the OAuth callback and the picker
  submission, then discarded. If the account only manages one Page, it connects
  automatically with no picker step.
- **No per-image platform validation** (e.g. Instagram's aspect ratio / resolution
  preferences). The image just needs to be a reachable public URL; if a platform
  rejects a specific image for format/size reasons, that surfaces as a publish failure
  (`social_post_targets.lastError`), not a pre-emptive check.
- **No post preview/approval workflow** — scheduling a post is the only step; there's
  no draft-review-approve pipeline if that's needed for a team with more than one editor.
- **"Session length" analytics elsewhere in the admin (`/admin/reports/engagement`) is
  unrelated to this feature** — don't confuse the two reports.
- **Nothing here has been tested against real platform credentials** — this sandbox
  can't complete an OAuth round-trip to Facebook/X (real user consent, real redirect),
  so the flows are correct against each platform's documented API shape but unverified
  end-to-end. Test the full connect → schedule → publish → metrics loop against a real
  (ideally test/sandbox) account on each platform before relying on it for anything
  time-sensitive.
