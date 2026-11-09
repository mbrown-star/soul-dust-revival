# 02. Auth, login, and account

**Status note (2026-11-11):** several items this checklist originally flagged (`/account`
having no session guard or order-history UI, `/login`/`/signup` not redirecting an
already-authenticated visitor) were fixed in that build — see
`qa/findings/FINDINGS_2026-11-07.md` for the authoritative fixed/unfixed status of every
numbered finding before treating anything below as still open.

**Roles covered:** guest, user, leader, admin
**Fixtures used:** `qa-user@soul-dust-revival.test`, `qa-leader@...`, `qa-admin@...`, qa-user's
seeded paid + pending orders
**Related automated spec:** `qa/e2e/specs/auth-access.spec.ts`, `qa/e2e/specs/account.spec.ts`

## Walkthrough — real OTP-code login (manual only — cannot be scripted, see below)

**Changed 2026-11-08:** login no longer sends a clickable magic-link URL. Traced a real
expired login attempt against souldustrevival.com's actual Google Workspace mail hosting and
confirmed every fresh magic link came back `otp_expired` before the real click — Workspace's own
link-prefetching/security scanning was consuming the single-use link first. The fix was to stop
sending a link at all and send a 6-digit code instead (no URL for anything to prefetch); see
`components/auth/AuthForm.tsx` and the 2026-11-08 CLAUDE.md entry. The walkthrough below reflects
the new flow; `/auth/callback`'s `link_expired` handling is kept only as a fallback for a
leftover pre-change email, not the primary path anymore.

1. Open `/login` as a guest, enter a real email you control, submit. → **Expect:** the form is
   replaced by "Enter your code" / "We sent a 6-digit code to {email}", and keyboard focus
   visibly moves to that heading (tab/arrow keys shouldn't land back on the now-gone form fields).
2. Open the real email, copy the 6-digit code, type it into the code field, submit. → **Expect:**
   lands on `/library` (the default `next`), now shown as logged in in the nav.
3. Repeat with `/signup?next=/checkout` for a brand-new email. → **Expect:** the same code-entry
   step, and after verifying, the destination respects `next=/checkout` rather than always going
   to `/library`.
4. While already logged in, navigate to `/login` directly. → **Expect (real behavior, not a bug
   to silently work around):** the login form renders again rather than redirecting you away —
   confirm this doesn't let you do anything harmful (it doesn't: submitting again just emails
   another code to the same address), but note whether this reads as confusing UX.
5. On the code-entry step, click "Use a different email." → **Expect:** returns to the plain
   email form, with the email field cleared.

*Why this is manual-only:* a real OTP-code flow needs an inbox to receive mail — the automated
suite instead proves the server-side login mechanics work via `qa/e2e/global-setup.ts`'s use of
Supabase's Admin API to generate and redeem a real OTP without sending mail, which is a faithful
substitute for "read the code from the email" but not a substitute for actually checking the email
arrives, its copy, and its deliverability (SPF/DKIM) — check an actual inbox periodically, not
just once.

## Walkthrough — account-enumeration trade-off

5. On `/login`, try an email with no account. → **Expect:** "We couldn't find an account for
   that email," with a "Sign up instead" link. This is a **documented, accepted trade-off**
   (SECURITY_REVIEW.md: "`/login` revealing whether an email exists is a documented trade-off. Do
   not widen it") — don't report this exact behavior as a new finding; only flag if you find a
   *new* place (a different endpoint, an error message elsewhere) that leaks the same information
   in a way this trade-off doesn't already cover.

## Walkthrough — role gating

6. As a guest, visit `/library`, `/admin/products`, `/admin/users`. → **Expect:** redirected to
   `/login` (with varying/sometimes-generic `next` params — confirm the destination after login
   is at least somewhere reasonable, even if not always the exact page requested — see
   Information-consistency checks below).
7. As a guest, visit `/account` directly. → **Expect (real, surprising behavior — confirm it's
   still true, don't assume it's been fixed):** the page returns 200 and shows "Your account" /
   "Loading..." **forever**, with no redirect to `/login` at all. This has no security
   consequence (no data renders — `AccountPageClient` only shows the authenticated view once a
   real session resolves client-side) but is a real, confusing UX dead end for a logged-out
   visitor who lands here from a bookmark or old link.
8. As qa-user (role `user`), visit `/leader`. → **Expect:** a 200 response with an inline "This
   section is for group leaders" message — not a redirect to `/login` (the layout deliberately
   treats "logged in but wrong role" differently from "not logged in at all").
9. As qa-leader, visit `/leader`. → **Expect:** the real published leader-resource listing (not
   the draft one). Visit `/admin/products`. → **Expect:** redirected to `/login` — a leader role
   alone never grants admin access.
10. As qa-admin, visit both `/leader` and `/admin/products`. → **Expect:** both succeed.

## Walkthrough — account page

11. As qa-user, open `/account`. → **Expect:** shows the real logged-in email
    (`qa-user@soul-dust-revival.test`), an "Export your data" section, and a "Delete your
    account" section. **There is no order-history list anywhere on this page** — confirm that's
    still true (see Information-consistency checks).
12. Click "Download my data". → **Expect:** a `my-data-export.json` file downloads containing (at
    minimum) the account's profile, both seeded orders (one `paid`, one `pending`), any saved
    study responses, login history, and entitlements. Open the file and spot-check the order
    totals/status match what's in the database.
13. Click "Delete my account". → **Expect:** a confirmation input appears asking to type `DELETE`
    exactly; the delete button stays disabled for anything else typed (including lowercase
    `delete`), and "Cancel" dismisses the whole confirmation without side effects. **Do not
    actually complete a deletion against the qa-user fixture** — other specs/checklists depend on
    it existing.

## Information-consistency checks

- **Real UX gap candidate:** qa-user has two real seeded orders (one paid, one pending), both
  retrievable via the data export JSON — but neither is visible anywhere in the account UI
  itself. A customer who wants to glance at "did my order go through" has no page to check short
  of downloading and reading a raw JSON file, or going to My Library (which only shows *digital*
  entitlements, nothing about a physical-only order's shipping/payment status). Worth raising as
  a genuine improvement opportunity, not just a QA nitpick.
- Every `/admin/*` redirect to `/login` uses `next=/admin/products` regardless of which admin
  page was actually requested (the guard lives in one shared `app/admin/layout.tsx`, which
  hardcodes that redirect target). After logging in, a guest who wanted `/admin/users` lands on
  `/admin/products` instead — minor, but confirm it's at least never silently dropped or broken
  entirely (it isn't: `/admin/products` is always a valid admin landing page).
- Does the `/account` page's "Delete your account" copy ("Order records are kept for financial
  record-keeping, with your personal details removed from them") match what `/api/account/delete`
  actually does? Worth a one-time code read-through of that route the next time this checklist
  runs, to confirm the copy hasn't drifted from the real implementation.

## Known accepted trade-offs

- Account enumeration via `/login`'s "no_account" error — SECURITY_REVIEW.md, "Account
  enumeration" line. Do not re-flag.
- Neither `/login` nor `/signup` redirect an already-authenticated visitor away — not documented
  as a deliberate trade-off anywhere in CLAUDE.md as of this writing, so treat this as an **open
  UX nit** worth raising (low severity — no security impact), not an already-accepted decision.
