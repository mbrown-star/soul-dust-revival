# 03. Checkout & payments

**Roles covered:** guest, user
**Fixtures used:** `qa-bundle-both-formats`, `qa-physical-amazon-and-stripe`,
`qa-physical-amazon-only`, `qa-digital-study-not-started`, `qa-inactive-product`
**Related automated spec:** `qa/e2e/specs/checkout.spec.ts`

## Walkthrough — cart & checkout page content

1. As a guest, add `QA Physical Book — Amazon + Stripe` to the cart, open `/checkout`. →
   **Expect:** no "requires an account" gate (purely physical), an email field appears (required),
   a country selector (required), and "Proceed to payment" stays disabled until both are filled.
2. As qa-user, add both halves of `QA Bundle — Both Formats` (the "Buy the book" and "Buy digital
   access" buttons on its own detail page), open `/checkout`. → **Expect:** two distinct line
   items for the same product title, with their own quantity/price, summing to $40.98 total — not
   collapsed into one line, not silently dropping one of them.
3. Remove one line item via its "Remove" button. → **Expect:** the total recalculates immediately
   and the removed line disappears; re-add it (navigate back to the product page) and confirm the
   quantity didn't double from a stale cart state.
4. As qa-user with only the digital study in the cart, open `/checkout`. → **Expect:** no
   guest-email field at all (already know the account's email), country still required.

## Walkthrough — real Stripe test-mode payment (manual, staging or local dev — not automated)

5. Complete steps 1 or 2 above for real, click "Proceed to payment", and actually enter Stripe's
   published test card number (4242 4242 4242 4242, any future expiry/CVC) on the real
   `checkout.stripe.com` page. → **Expect:** redirects back to `/checkout/success?orderId=...`
   showing the real order total and items.
6. For a digital/mixed order, confirm `/checkout/success` shows "Sign in to access your content"
   (if not already logged in) or that the item actually appears in My Library shortly after (once
   the webhook has run — see step 8).
7. For a physical order, confirm the cart is empty on return to the site (per
   `components/commerce/ClearCartOnMount.tsx`, cleared on mount of the success page specifically,
   not at the Stripe redirect itself — cancelling on Stripe's own page and returning should leave
   the cart intact; completing the purchase should not).
8. **Only on staging, against a real registered Stripe webhook endpoint** (see CLAUDE.md's
   2026-11-10 entries on the webhook's own history of silent failures): confirm the order's status
   actually flips from `pending` to `paid`, and a digital purchase's entitlement is actually
   granted, within a reasonable time. This can't be exercised against the local QA dev server at
   all — Stripe can't deliver a webhook to `localhost`.

*Why 5–8 are manual-only:* this project has already hit three real, silent Stripe/Workers
compatibility bugs that only showed up against a real deployed Worker and real Stripe test
traffic (missing fetch-based HTTP client, sync vs. async webhook signature verification, no
webhook endpoint registered at all — see CLAUDE.md's 2026-11-10 entries). Don't treat "the
automated spec passed" as proof checkout works end to end; it only proves the pre-Stripe-redirect
page logic and the server-side validation guards are correct.

## Walkthrough — server-side guards (a crafted request can't bypass the UI)

9. POST directly to `/api/checkout` with an Amazon-only product's id (bypassing the UI, which
   never renders a Stripe button for it at all). → **Expect:** `400 invalid_product`.
10. POST with a digital item and no session, no guest email. → **Expect:** `401 login_required`
    — not treated as a guest-email case.
11. POST with the inactive product's id. → **Expect:** `400 invalid_product`.
12. POST the same `{productId, variant}` line twice in one request (simulating a crafted request
    bypassing the cart UI's own client-side merge). → **Expect:** exactly one `order_items` row
    with the summed quantity — this is a regression test for a real previously-shipped bug (a
    customer could otherwise be charged twice while only receiving one entitlement; see CLAUDE.md
    2026-11-07).

## Information-consistency checks

- **Real finding, confirmed by reading `app/(marketing)/checkout/success/page.tsx`:** the order
  confirmation page prices every line item using `product.priceCents` (the *physical* price)
  unconditionally — for a `format: "both"` product's **digital** line, this would display the
  wrong price (the physical price, not the digital price actually charged). Reproduce this for
  real on staging: buy only the digital half of a "both" product, and check whether the success
  page's displayed line price matches what Stripe actually charged. **If confirmed, this is a
  real customer-facing information-accuracy bug**, not just a cosmetic nit — the whole point of
  this QA pass is catching exactly this kind of thing.
- Related: `orderedProducts` on that same page is fetched via `products.id IN (...)`, which
  returns each product **once** regardless of how many `order_items` rows reference it. An order
  containing both the physical and digital lines of the same "both" product (same `productId`,
  different `variant`) would show that product's title only once on the confirmation page, with
  one price — not two distinct lines the way `/checkout` itself correctly shows them. Confirm
  this on staging with a real "buy both halves in one order" purchase; if the two lines really do
  collapse into one, that's a second real display bug in the same file, sharing the same root
  cause (the success page keys only off `productId`, not `{productId, variant}`, unlike the cart
  and checkout pages which already learned this lesson — see `lib/cart/CartContext.tsx`'s
  `lineKey()`).
- Does the admin Sales report (`/admin/reports/sales`) show the same order consistently with what
  the customer's own `/checkout/success` and data-export JSON show for the same order (status,
  total, line items)? Cross-check at least one real order across all three surfaces.

## Known accepted trade-offs

- Checkout merging line items sharing `{productId, variant}` — already fixed and regression-
  tested per CLAUDE.md 2026-11-07; the automated spec's merge test re-confirms this, it is not a
  new finding if it passes.
- `ClearCartOnMount` only fires on the success page, not at the Stripe-redirect moment — a
  deliberate choice (CLAUDE.md, the entry documenting `ClearCartOnMount.tsx`) so a cancelled
  Stripe checkout leaves the cart intact. Not a bug.
