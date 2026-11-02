# Security Review Instructions — Soul Dust Revival

Run this review on every build, and again before any release. Review the code changed in the current build first, then spot-check adjacent code it touches.

## How to run
1. Identify the scope: files added or changed since the last reviewed build.
2. Walk each checklist section below. Skip a section only if it clearly does not apply, and say so.
3. Report findings using the format at the bottom. Fix Critical and High findings before the build is considered done. Ask before deferring anything.

## Checklist

### 1. Secrets and configuration
- No API keys, tokens, passwords, or private keys in source, tests, fixtures, logs, or commit history.
- Secrets come from environment variables or a secrets manager. `.env` files are git-ignored; a `.env.example` with placeholders exists.
- Different credentials for dev, staging, and production.
- Debug modes, verbose errors, and test endpoints are off in production.

### 2. Authentication and sessions
- Passwords hashed with a modern algorithm (argon2, bcrypt, scrypt). Never stored or logged in plain text.
- Session or token expiry, rotation on login, and invalidation on logout.
- Cookies: `HttpOnly`, `Secure`, `SameSite`.
- Rate limiting or lockout on login, password reset, and other sensitive endpoints.

### 3. Authorization
- Every endpoint and action checks who the caller is and what they may access, server-side.
- No insecure direct object references: a user cannot read or modify another user's records by changing an ID.
- Admin functions are separately protected. Least privilege applies to users, services, and database roles.

### 4. Input handling and injection
- All external input (forms, query strings, headers, uploads, webhooks, third-party API responses) is validated and treated as untrusted.
- Database access uses parameterized queries or a safe ORM. No string-built SQL.
- Output is encoded or escaped to prevent XSS. No unsafe HTML injection (`innerHTML`, `dangerouslySetInnerHTML`) with untrusted data.
- No command injection, path traversal, unsafe deserialization, or SSRF through user-supplied URLs.
- File uploads: type and size limits, safe storage location, no execution of uploaded files.

### 5. Data protection
- Personal and sensitive data is identified, minimized, and encrypted in transit (TLS) and at rest where appropriate.
- Sensitive data does not appear in logs, error messages, URLs, or analytics.
- Backups and exports are protected and have a retention policy.

### 6. Dependencies and supply chain
- Run the ecosystem's audit tool (`npm audit`, `pip-audit`, etc.) and report results.
- Flag unmaintained, unknown, or unpinned packages. Lockfile is committed.
- No unnecessary new dependencies.

### 7. Web and API surface
- CORS restricted to known origins. CSRF protection on state-changing requests.
- Security headers set (CSP, HSTS, X-Content-Type-Options, frame protections).
- API responses return only needed fields. Error responses do not leak stack traces or internals.

### 8. Payments and third-party integrations (if used)
- Webhooks verify signatures. Payment details never touch our servers or logs when a provider handles them.
- Third-party keys are scoped to least privilege.

### 9. Infrastructure and deployment
- Least-privilege cloud and database permissions. No publicly exposed databases or storage buckets.
- Build and deploy pipelines do not expose secrets. Production changes are traceable.

## Scaffold-specific checks (study-platform-scaffold stack)
Apply these in addition to the general checklist. Background is in the scaffold's `SECURITY.md`; confirm each still holds after the current build.

- **No RLS safety net.** The app talks to Postgres directly through Drizzle, so Supabase RLS is never consulted. Every route and server action must enforce authorization itself. Flag any route that reads or writes data without `requireRole`/`requireAdmin`/`requireLeaderOrAdmin` or `lib/entitlements/check.ts` where access should be restricted.
- **`DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` never reach the client.** Check for secrets imported into client components or prefixed `NEXT_PUBLIC_`. Any new browser-side Supabase client needs its own RLS policies.
- **Zod on every API route.** New or changed routes validate all input through `lib/validation/schemas.ts` with sane bounds. No trusting client-shaped JSON.
- **Pricing integrity.** Checkout accepts only `productId` and `quantity`. Prices are always looked up server-side.
- **Stripe webhooks.** Signature verified with an explicit guard. Status transitions stay atomic (`UPDATE ... WHERE status != 'paid' RETURNING`) so redelivery cannot double-grant entitlements or double-send email. Entitlements granted only for `format: 'digital'`.
- **Entitlements and roles.** Content access and role checks go through the single sources of truth. Admins cannot change their own role or delete themselves when they are the last admin. No self-serve path to admin.
- **XSS.** Rich text (Tiptap HTML, callouts, imports, markdown blog) is sanitized with DOMPurify on write and again on render. Any new `dangerouslySetInnerHTML` is justified and sanitized.
- **Uploads.** Image types allowlisted server-side; R2 keys are random UUIDs, never user filenames; `.docx`/`.pdf` imports size-capped before parsing. Imported documents are untrusted input.
- **Direct-to-R2 and Stream uploads.** Presigned URLs are issued only to authorized admins, scoped, and short-lived. Stream playback URLs are signed per request after an entitlement check.
- **Social integrations.** OAuth tokens encrypted at rest with `TOKEN_ENCRYPTION_KEY`, never logged. Cron endpoints (`/api/cron/*`) require the `CRON_SECRET` bearer token and compare it safely. OAuth redirect URIs registered only for real domains.
- **AI features.** Content sent to the AI provider contains no personal data, orders, or credentials. AI output is treated as untrusted and sanitized before storage or display.
- **Privacy and data rights.** Data export, account deletion, and order anonymization still work. Personal data (email, country, login events) is not leaked in logs or reports beyond admins. Check against `PRIVACY.md`.
- **Account enumeration.** `/login` revealing whether an email exists is a documented trade-off. Do not widen it (for example, new endpoints that confirm account existence).
- **Platform controls.** Cloudflare rate limiting is configured for `/api/checkout`, `/api/responses`, `/api/progress`, `/login`. Security headers in `next.config.js` are intact. Stripe, R2, and Stream tokens are least-privilege and rotated.
- **Environment validation.** New env vars are added to `lib/env.ts` and `.env.example`, not read ad hoc.
- **Dependencies.** Run `npm audit`. Pay particular attention to `jsonwebtoken`, `pdf-parse`, `mammoth`, `marked`, and anything that parses untrusted input.
- **Unverified integrations.** State plainly which of Stripe, R2, Stream, Supabase, Resend, Meta, and X were exercised against real services and which were only type-checked.

## Automated and AI-assisted testing layer
The checklists above are a manual, code-reading review. This layer adds automated scanners and AI-driven testing on top. It does not replace the checklists. **Tool names and features below are from memory and were not verified online; confirm each tool's current status, license, and pricing before adopting it.**

### Ground rules for any active testing
- Test only Soul Dust Revival's own code and its own **local or staging** deployment. Never point an active scanner or AI pentester at production, or at third-party services (Stripe, Supabase, Cloudflare, Resend, Meta, X). Use Stripe test mode and a separate staging Supabase project.
- Use seeded test accounts (one `user`, one `leader`, one `admin`) with fake data. Never use real customer data or real payment details.
- Run active tests with write access limited to the staging database, and reset it afterward.
- Treat every AI finding as a lead, not a verdict. Reproduce it before reporting. Discard unreproducible findings, and do not accept AI-suggested fixes without reading them.
- Never paste secrets, `.env` contents, or customer data into an external AI service. Check what a tool uploads before running it on the codebase.

### Tiers (run in this order)
| Tier | When | Tools to consider | What it catches |
|---|---|---|---|
| 1. Secrets and dependencies | Every build | Gitleaks or TruffleHog; `npm audit`; OSV-Scanner; Socket | Leaked keys, vulnerable or malicious packages |
| 2. Static analysis (SAST) | Every build | Semgrep (rules plus its AI triage); CodeQL; Snyk Code; Claude Code `/security-review` | Injection, XSS, unsafe patterns, missing auth checks in code |
| 3. Dynamic scan (DAST) | Before each release, against staging | OWASP ZAP (baseline and full scan, authenticated); Nuclei | Misconfigurations, missing headers, known vulnerabilities, reflected XSS |
| 4. AI-driven pentest | Before launch and after major changes, against staging | Open-source agents such as Strix, Shannon, or PentestGPT; commercial options such as XBOW or Burp Suite's AI features | Business-logic flaws, chained attacks, broken access control that rule-based scanners miss |

### What to point them at in this codebase
Give tier 3 and 4 tools these scenarios explicitly, since generic scans miss logic flaws:
- **Broken access control:** as a `user`, request admin routes (`/admin/*`, `/api/admin/*`) and leader pages; as one user, request another user's orders, responses, progress, and data export; request lesson content and signed Stream URLs without an entitlement.
- **Checkout tampering:** alter price, quantity, currency, or product IDs; replay and forge Stripe webhook calls (bad signature, duplicate delivery); race two identical webhooks to test double entitlement grants.
- **Role and account abuse:** self-promotion to admin, an admin changing their own role, the last admin deleting their own account, account enumeration through `/login` and `/signup`.
- **Injection and XSS:** rich text blocks, callouts, blog markdown, `.docx` and `.pdf` imports with hostile content, alt text, and titles.
- **Uploads:** wrong content types, oversized files, traversal in filenames, presigned URL reuse or scope abuse.
- **Cron and social endpoints:** call `/api/cron/*` without or with a wrong `CRON_SECRET`; OAuth callback state and redirect tampering.
- **AI features:** prompt injection through lesson text or imported documents that influences social or blog suggestions.
- **Rate limits and abuse:** `/api/checkout`, `/api/responses`, `/api/progress`, `/login`.

### Cadence
- **Every build:** tiers 1 and 2.
- **Before each release and after changes to auth, payments, roles, uploads, or webhooks:** add tier 3.
- **Before launch, then at least quarterly and after major features:** add tier 4. Consider a human penetration test before taking real payments.

### Reporting for this layer
Add a section to the build's security report listing: tools run and versions, target (local or staging), scope and accounts used, raw finding count, findings reproduced, false positives dismissed (with reason), and fixes made. If a tier was skipped, say so and why.

## Report format
For each finding:
- **Severity:** Critical / High / Medium / Low / Info
- **Location:** `path/to/file:line`
- **Issue:** what is wrong
- **Impact:** how it could be exploited
- **Fix:** specific recommended change

End with a summary: counts by severity, sections reviewed, sections skipped (with reason), and a clear pass/fail for the build. Do not report speculative issues without a concrete scenario.
