# 08. Social scheduling

**Roles covered:** admin (the only role with access), guest/user/leader (access-control only)
**Fixtures used:** none required — this area has no seeded social_posts fixtures; create/discard
a throwaway post during the walkthrough.
**Related automated spec:** `qa/e2e/specs/admin-social.spec.ts`, `qa/e2e/specs/admin-settings-connections.spec.ts`

## Walkthrough

### Composer (`/admin/social/new`)

1. Open the composer logged in as admin. → **Expect:** three platform rows (X, Facebook,
   Instagram), each with its own character counter reading `0/<limit>` (280 / 63,206 / 2,200).
2. Type a post body. → **Expect:** all three counters update live, in real time, as you type —
   not just the one for a currently-checked platform.
3. Type past 280 characters with X selected. → **Expect:** the X counter turns the error color
   (`text-error`) while Facebook/Instagram's counters (still well under their own limits) stay
   the normal moss color. This is a genuine per-platform check, not a single global limit.
4. Check Instagram with no image uploaded. → **Expect:** a visible "Instagram requires an image."
   message, and the Schedule button is disabled until either an image is added or Instagram is
   unchecked.
5. Click "Get suggestions" with no platform selected. → **Expect:** a clear inline error ("Select
   at least one platform first..."), not a silent no-op or a server round trip that then fails.
6. Click "Get suggestions" with at least one platform selected and a custom instruction. →
   **Expect:** draft buttons appear; clicking one fills the body textarea with that draft's exact
   text (read, don't just click — confirm the pasted text matches what the draft button showed).
7. Set a platform's frequency to "Weekly". → **Expect:** a Day of week selector appears; switching
   back to "Once" or "Daily" hides it again without losing other field values.
8. Upload an image, then select Instagram. → **Expect:** the "Instagram requires an image"
   message disappears and the Schedule button becomes enabled (assuming body + at least one
   platform are also valid).
9. Submit a complete post. → **Expect:** redirect to `/admin/social`, and the new post appears at
   the top of the list with the correct platform badges and `scheduled` status (or `draft` —
   confirm which the UI actually produces for a first-time save, since the schema's default status
   is `scheduled`, not `draft`, per `lib/db/schema.ts`).

### List (`/admin/social`)

10. Open the list. → **Expect:** each post shows a 2-line-clamped body preview and one badge per
    platform target showing `<Platform> · <status>` (and `· <frequency>` when not "once") — colors
    match `STATUS_STYLES` in `app/admin/social/page.tsx` (draft=moss, scheduled=ember, sending=gold,
    published=success-green, failed=error-red, paused=moss).
11. With zero posts (a fresh local seed before anything is scheduled). → **Expect:** "No social
    posts yet." renders instead of an empty, blank list.

### Connections (`/admin/settings/connections`)

12. Open Connections as admin. → **Expect:** 4 rows (Anthropic, X, Facebook, Instagram), each
    showing a connect/disconnect affordance and a status.
13. If a connection is in an `error` state. → **Expect:** `lastError` is shown to the admin in
    plain language, not a raw provider error code/stack trace.
14. Click Disconnect on a connected integration (use a throwaway test connection if available,
    not a real production credential). → **Expect:** a confirmation step before the disconnect
    actually fires — this is a destructive, hard-to-reverse action (the admin would need to
    redo the OAuth flow or re-enter a key).

## Information-consistency checks

- Does the character count shown in the composer match the actual byte/character count the
  platform's real API would reject at? (X counts code points, not bytes — spot-check an emoji or
  non-ASCII character doesn't silently under/over-count.)
- Does a post's status badge on the list page match its real `social_post_targets.status` value
  (not a stale client-side cache) after a page reload?
- After scheduling a weekly/daily post, does the list's shown `next_run_at`-derived timing (if
  displayed) make sense relative to the frequency/day/time actually configured?
- Does the Connections page's status for each provider match what a direct check of
  `integration_connections.status` in the database would show (i.e., is the page actually reading
  live data, not a stale default)?

## Known accepted trade-offs

- None specific to this area found in CLAUDE.md beyond the general social-scheduling build notes
  (SOCIAL.md covers the external-cron-trigger requirement — Cloudflare has no built-in cron, so
  `/api/cron/social-publish` only runs when something external calls it on a schedule; this is by
  design, not a bug, and isn't something this checklist should flag).
