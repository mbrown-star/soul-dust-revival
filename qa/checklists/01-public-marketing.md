# 01. Public storefront & marketing

**Roles covered:** guest, user, admin (nav-state differences only)
**Fixtures used:** `qa-digital-study-not-started`, `qa-devotional-in-progress`, `qa-study-completed`, `qa-physical-amazon-and-stripe`, `qa-physical-amazon-only`, `qa-bundle-both-formats`, `qa-inactive-product`, `qa-fixture-published-post` / `qa-fixture-draft-post`
**Related automated spec:** `qa/e2e/specs/public-marketing.spec.ts`

Note: `/leader` is **not** part of public marketing — it's gated by `requireLeaderOrAdmin()`.
See `qa/checklists/07-admin-console.md` for leader-resource access control, and
`qa/checklists/02-auth-and-account.md` for the `/leader` role-gate walkthrough.

## Walkthrough

1. Open `/` as a guest. → **Expect:** the hero renders, a "Featured content" section shows
   `QA Digital Study — Not Started` and `QA Bundle — Both Formats` (both seeded `featured:true`),
   and `QA Inactive Product` never appears anywhere on the page.
2. Read each featured tile's category label under its title. → **Expect:** "Study · Web app" for
   the digital study, "Book & Study" for the bundle — the label must match the product's real
   `format`, not a hardcoded guess.
3. Click a featured tile. → **Expect:** navigates to `/books/<slug>` for that exact product.
4. Scroll to "From the blog". → **Expect:** only `QA Fixture: Published Post` appears; the draft
   post is absent.
5. Open `/books`. → **Expect:** every active QA product appears (6 of the 7 seeded), `QA Inactive
   Product` does not. Visit `/books/qa-inactive-product` directly. → **Expect:** a real 404, not a
   blank/broken page.
6. Open `/books/qa-physical-amazon-and-stripe`. → **Expect:** both a "Buy Now" button and a "Buy
   on Amazon" link render.
7. Open `/books/qa-physical-amazon-only`. → **Expect:** only "Buy on Amazon" renders — no Stripe
   purchase button anywhere on the page, in any viewport width.
8. Open `/books/qa-bundle-both-formats`. → **Expect:** two clearly separated sections ("Printed
   book", "Digital access"), each with its own price and its own button; the two prices must be
   visibly different ($24.99 vs $15.99) and neither button should look like it applies to both.
9. Open `/blog`, then the published post. → **Expect:** listing excludes the draft; the post body
   renders bold text and a working link — read the rendered HTML source to confirm no stray
   `<script>`/`on*=` attributes survived (sanitization, not just visual correctness).
10. Visit `/blog/qa-fixture-draft-post` directly, logged out. → **Expect:** 404.
11. Open `/privacy`. → **Expect:** renders without needing to be logged in; re-read the listed
    data categories against what the app actually collects per `PRIVACY.md` (country, study
    answers, login activity, purchase history) — look for a category the app actually stores that
    this page doesn't mention, or vice versa.
12. As a guest, open the nav bar. → **Expect:** Store, Blog, Cart, Log in. No My
    Library, no Profile menu.
13. Log in as qa-user (or load `/` with the user storageState). → **Expect:** nav gains My
    Library and a Profile menu (Account, Log out — no Admin item).
14. Same as qa-admin. → **Expect:** Profile menu also shows Admin, linking to `/admin/products`.

## Information-consistency checks

- Does the homepage's featured-tile price match the detail page's own price for the same
  product, for every format (physical, digital, both)? A "both" product's homepage tile shows
  only one price (`priceCents`, the physical side) with no indication a second, independent
  digital price exists — **is that a gap, or intentional brevity?** Flag it either way; don't
  assume it's fine just because it's not technically wrong.
- `/books` listing also shows a single price per product, same caveat for the "both" format.
- Does a product's "Book & Study" / "Study · Web app" / "Book · Ships to you" label stay
  consistent between the homepage tile, the `/books` listing, and the detail page's own eyebrow
  text? All three read from `product.format` the same way — confirm they don't drift if a future
  change touches only one of the three call sites.
- Does the blog post's published date (shown on both `/blog` and the post page) match exactly,
  or could one show a different timezone/format than the other?

## Known accepted trade-offs

- None specific to this area beyond the brand/design-system rules already documented in
  `CLAUDE.md` (standard `max-w-5xl` page width, the sunset palette). If the homepage's
  single-price-per-tile question above turns out to already be a documented decision, cite the
  relevant CLAUDE.md dated entry when updating this file.
