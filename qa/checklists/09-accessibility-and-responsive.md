# 09. Accessibility and responsive

**Status note (2026-11-11):** the mobile nav-overflow issue flagged below (and in
`qa/findings/FINDINGS_2026-11-07.md` #1) is **fixed** as of that build (`SiteNav.tsx`),
verified on both desktop and mobile-chromium. See that findings report for the
authoritative fixed/unfixed status of every numbered finding before treating anything
else below as still open.

**Roles covered:** guest, user, leader, admin
**Fixtures used:** all (this is a cross-screen pass, not fixture-specific)
**Related automated spec:** none — this is judgment-only (axe-core/Lighthouse supplement this but
don't replace a human pass; ACCESSIBILITY.md already documents a past axe-core run — re-run it
rather than relying on the old one if the app has changed meaningfully since 2026-11-05).

Read `ACCESSIBILITY.md` and `RESPONSIVE.md` in full before running this — both document specific,
already-implemented behavior and known trade-offs; this checklist exists to catch regressions in
that behavior or new gaps in screens built since those docs were last updated, not to re-litigate
decisions already made there.

## Walkthrough

### Keyboard navigation

1. On the homepage, Tab from the very first element. → **Expect:** the skip-to-content link is the
   first focusable element and is visible when focused (not just present in the DOM).
2. Continue tabbing through the nav, featured-product tiles, and footer. → **Expect:** every
   interactive element gets a visible focus indicator — either the global `:focus-visible` ring, or
   one of the three documented exceptions (nav text-color change, admin nav text-color change,
   homepage tile `group-focus:` hover-reuse) per ACCESSIBILITY.md. No element is silently
   unreachable or invisible-when-focused.
3. Open a Study lesson's Greek sheet / week-picker sheet via keyboard only (Enter/Space on the
   trigger). → **Expect:** focus moves into the sheet, Escape closes it, and focus returns to the
   trigger afterward.
4. On the admin lesson block editor, reorder a block using only the keyboard (Tab to the drag
   handle, Space to pick up, Arrow keys, Space to drop). → **Expect:** this works per
   ACCESSIBILITY.md's documented `KeyboardSensor` wiring, AND the Move Up/Down buttons are present
   as a simpler alternative.

### Screen-reader-relevant structure

5. Check each major page has exactly one real `<h1>`. → **Expect:** homepage, /books, /books/[slug],
   /blog, /blog/[slug], /library, a study lesson page, /admin/products, /login, /signup, /checkout
   (including its empty-cart and login-required early-return states — ACCESSIBILITY.md flags these
   as a past bug, confirm the fix is still in place) all have one.
6. Trigger a form validation error (e.g. submit checkout with an invalid field). → **Expect:** the
   error has `role="alert"`, is linked to its field via `aria-describedby`, and the field has
   `aria-invalid="true"`.
7. Trigger an async status change (uploading an image, saving a lesson). → **Expect:** a
   `role="status" aria-live="polite"` region announces it — not just a visual-only spinner/text
   change.

### Images and alt text

8. Check a product image, a book cover gallery, a lesson image block, and a social-composer
   uploaded image. → **Expect:** lesson image blocks have required, non-empty alt text (enforced at
   both UI and API per ACCESSIBILITY.md); product/book cover images may legitimately have empty
   alt="" — this is a **documented, accepted trade-off** (ACCESSIBILITY.md, widened 2026-11-05),
   not a bug to report.

### Motion

9. Enable `prefers-reduced-motion: reduce` in the browser/OS, then open a Study lesson's prayer
   timer and a devotional's Hide Words slider. → **Expect:** transitions/animations collapse to
   near-zero duration; the cover gallery's smooth-scroll also respects it (ACCESSIBILITY.md notes
   this needed an explicit JS `matchMedia` check, not just CSS, since `scrollTo({behavior:
   "smooth"})` ignores the CSS media query).

### Responsive / touch targets

10. Resize to 375px width (a small phone). → **Expect:** no horizontal page scroll anywhere except
    the admin nav, which RESPONSIVE.md documents as deliberately `overflow-x-auto` at narrow
    widths — not a bug.
11. At 375px, check the lesson-block drag handle, Move Up/Down buttons, and the cart's "Remove"
    link. → **Expect:** each has a real tappable area of roughly 44×44px per RESPONSIVE.md, even
    where the visible text/icon is smaller (invisible padding).
12. At 375px, open the Study reader's 5-tab bar and the devotional's 4-tab bar. → **Expect:** tabs
    are all reachable and tappable without being cut off or requiring horizontal scroll.
13. Rotate a tablet-width viewport (or resize through 768px/1024px) while on an admin list page and
    a lesson page. → **Expect:** no layout stays in a visually "transitional" broken state at the
    breakpoint boundary (RESPONSIVE.md flags this as worth checking, not as already-verified).

### Color contrast (the "sunset" palette's own documented rules)

14. Scan every screen for plain `text-ember` or `text-gold` used on body-sized text against
    `parchment`. → **Expect:** none — CLAUDE.md is explicit that plain `ember`/`gold` fail WCAG AA
    at normal text size on parchment (2.62:1 / 1.39:1) and that only `ember-700`/`gold-700` (for
    large/bold text) or `ink`/`moss` (for normal-size text) are compliant. This is exactly the kind
    of rule that's easy to violate in new code added after the palette migration — actively look
    for regressions, don't just trust the 2026-11-05 sweep covered everything added since.
15. Check every `role="alert"`/error message site-wide uses the `error` token (`#a8301c`,
    5.78:1), not `ember`. CLAUDE.md's 2026-11-05 entry says this was swept at the time — confirm
    it's still true in any screens built afterward (the social composer's inline errors, the admin
    Users add/edit forms, etc.).

## Information-consistency checks

- Does the visible focus style actually match what ACCESSIBILITY.md claims for a given element
  (e.g. is the admin nav really using a color-only focus style, or did it silently get the global
  ring back after some other change)?
- Does a page's `<title>` (browser tab) match its visible `<h1>` in substance, and does a
  gated page's title avoid leaking content to an unentitled visitor (ACCESSIBILITY.md's
  `generateMetadata` mirroring point)?

## Known accepted trade-offs

- Product/book cover image alt text is optional by explicit decision (ACCESSIBILITY.md,
  widened 2026-11-05) — do not flag a blank product image alt as a new finding.
- The admin nav's horizontal scroll at narrow widths is intentional (RESPONSIVE.md).
- The nav bars' color-only (not ring) focus indicator is an explicit, confirmed-with-the-user
  trade-off (ACCESSIBILITY.md / CLAUDE.md 2026-11-05 nav rework entries) — not a missing focus
  indicator, just a different one.
- Print stylesheet deliberately excludes study/lesson content (RESPONSIVE.md) — not in scope to
  flag.
