# Privacy & Data Protection Notes

This documents what personal data this app collects, why, and what a real compliance
posture still needs beyond what code alone can provide. **This is engineering
documentation, not legal advice or a compliance certification** — data protection
obligations depend on where your buyers are, where your business operates, and specifics
a codebase can't determine on its own. Get real legal review before treating this as
"compliant" for any specific jurisdiction (GDPR, CCPA/CPRA, PIPEDA, LGPD, etc.).

## What's collected, and why

| Data | Where | Why |
|---|---|---|
| Email | `users.email`, `orders.guestEmail` | Account identity; order confirmation |
| Country | `orders.country`, `users.country` | Determines which data-protection regime applies to that person (see below) |
| Full name (optional) | `users.fullName` | Convenience display only — never required, never used to gate access |

**Source of `users` rows**: usually the person's own signup — created on their first sign-in by
`lib/auth/recordLogin.ts`, called from the emailed-code login (`/api/auth/login-recorded`). On the pre-launch "sneak peek"
site the free-sample form (`/sneak-peek`) is the signup, and its copy tells the person they'll
be emailed when the full launch is live. An admin can also create or edit a `users` row directly
from `/admin/users` (e.g. onboarding someone who won't self-signup) — same columns, same
purpose, same access rules as above. Creating one sends that email address a one-off
"your account is ready" email (via Resend) pointing at the login page; it contains no
sign-in link or code.
| Full shipping address | `orders.shipping*` | Only collected for physical orders, only via Stripe's own checkout page — never stored anywhere except what Stripe's Checkout session collects |
| Login timestamps + user agent | `login_events` | Access/engagement reporting (`/admin/reports/engagement`) |
| Study and devotional answers | `responses.answerText` | The product's actual function — saving a user's own study responses and devotional "A Question to Sit With" reflections (added 2026-11-06; previously the devotional question was display-only and never persisted) |
| Role, purchase history | `users.role`, `orders`/`order_items` | Access control; sales reporting |

**Data minimization in practice**: country is collected as a 2-letter code, not a full
address, for every order — full street address is only ever collected by Stripe's own
checkout page, and only for physical orders that need it, never duplicated into this
app's own database beyond what's already stored in `orders.shipping*`.

## Why country is collected on every order (including guest, including digital)
Data-protection obligations differ meaningfully by where the *buyer* is, not where the
business is incorporated — GDPR (EU/EEA/UK), CCPA/CPRA (California), PIPEDA (Canada),
LGPD (Brazil), and others each impose different requirements (consent mechanics, data
subject rights, retention limits, breach notification timelines). Without knowing a
buyer's country, there's no way to know which of these might apply to them. Collecting
it explicitly at checkout — rather than only inferring it when Stripe collects a
shipping address for physical orders — is what makes this knowable for **every**
purchase, including guest and digital-only orders that never go through shipping
collection at all.

**What this does NOT do by itself**: collecting the country code doesn't automatically
*apply* the right rules for that country — no automatic consent banner changes, no
automatic data residency enforcement, no automatic differing retention windows by
region. It's the input a real compliance implementation would need; it isn't the
implementation.

## What's now built
- **A published privacy policy** at `/privacy` — real content describing what's
  collected, why, who it's shared with, and how to exercise data rights. It carries an
  honest caveat that it hasn't been reviewed by an attorney for legal sufficiency —
  worth doing that review before treating it as final, especially for jurisdictions
  with specific mandatory-disclosure requirements (GDPR's Art. 13/14 notice
  requirements, CCPA's specific disclosure categories, etc.).
- **Self-service data export** at `/account` (`GET /api/account/export`) — a logged-in
  user can download everything stored about them (profile, orders, study responses,
  login history) as JSON. Fulfills GDPR Art. 15 / CCPA access requests.
- **Self-service account deletion** (`POST /api/account/delete`), gated behind a
  type-to-confirm UI step since it's irreversible. Design choice worth understanding:
  - Study responses, login history, and entitlements are deleted outright.
  - **Orders are kept, not deleted** — financial records often have their own legal
    retention requirements independent of a deletion request (a real legal question
    this code can't resolve on its own). The personal link is anonymized instead:
    the `users` row's email/name/country are scrubbed rather than the row being
    removed, since `orders.userId` depends on it existing.
  - The Supabase `auth.users` record is deleted via the Admin API
    (`lib/supabase/admin.ts`, requiring `SUPABASE_SERVICE_ROLE_KEY`) — this is what
    actually revokes the ability to log in, distinct from the DB-side anonymization.
  - An admin cannot delete their own account if they're the only admin — same
    lockout-prevention rationale as the "can't change your own role" guard.
- **A retention window on `login_events`** — `POST /api/cron/prune-login-events`
  deletes rows older than 13 months (covers a full year of year-over-year engagement
  reporting at `/admin/reports/engagement` plus a one-month buffer), addressing the
  GDPR Art. 5 data-minimization concern of otherwise-indefinite access-log retention.
  Like the social-publish/social-metrics cron endpoints, it's authenticated via the
  `CRON_SECRET` bearer token and needs an external scheduler to actually call it on a
  schedule — see SOCIAL.md's "Deploy a cron trigger" section for the same setup
  (a companion Worker or an external scheduler, called daily or weekly is plenty for
  a retention job). The 13-month window is a default, not a mandate — change
  `RETENTION_MONTHS` in that route if your actual retention policy differs.

## What a real compliance posture still needs (not built here)
- **Cookie/tracking consent**, if you ever add analytics, ads, or any non-essential
  cookie — currently there's no third-party analytics or tracking pixel in this
  scaffold, and the Supabase auth cookie is generally treated as "strictly necessary"
  (not requiring consent under most cookie-law frameworks), but re-evaluate this the
  moment any tracking/analytics tool gets added.
- **Sub-processor agreements.** Supabase, Stripe, Cloudflare, and Resend are all
  reputable processors with their own compliance programs, but *you* (the business)
  are still the data controller and are responsible for having appropriate data
  processing agreements in place with each — that's a legal/contractual step, not
  something this codebase does for you.
- **International transfer mechanisms**, if applicable — knowing a buyer's country
  (this scaffold) is a different question from *where their data is physically stored
  and processed* (determined by which Supabase/Cloudflare regions you deploy to). If you
  have EU buyers and non-EU infrastructure, standard contractual clauses or an
  equivalent transfer mechanism may be required — again, a legal question informed by
  your actual infrastructure choices.

## Engagement/access data specifically
`login_events` stores a timestamp and user-agent string per login, plus a
heartbeat-updated `lastActiveAt` — deliberately **not** IP address, precise geolocation,
or device fingerprinting, to keep this dataset as minimal as it can be while still
answering "how often, how long." If IP logging is ever added (e.g., for fraud
detection), treat it as personal data requiring the same consideration as everything
else in this document — IP addresses are considered personal data under GDPR.
