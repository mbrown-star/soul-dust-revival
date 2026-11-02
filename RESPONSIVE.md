# Responsive & Cross-Browser Notes

## Approach
This app is built mobile-first with Tailwind's default breakpoints (`sm:` 640px,
`md:` 768px, `lg:` 1024px, `xl:` 1280px). Base (unprefixed) classes target the
smallest/mobile layout; breakpoint-prefixed classes layer on wider-screen adjustments.
This matches how the vast majority of real traffic to a consumer site like this behaves:
design for a phone first, then expand.

## What's implemented

**Viewport**
- `app/layout.tsx` sets an explicit responsive viewport (`width=device-width,
  initialScale=1`) via Next's typed `Viewport` export. Without this, some mobile
  browsers render at a fixed desktop-width virtual viewport and scale the whole page
  down, which silently defeats every responsive breakpoint in the CSS.
- Deliberately **not** setting `maximumScale=1` or `userScalable=false` — that's a
  common but harmful pattern that blocks pinch-zoom, which is both a WCAG 1.4.4 failure
  and a real usability problem for low-vision users on any device size.

**Layout**
- Every page container has responsive horizontal padding (`px-4`) so content never sits
  flush against the screen edge on a phone — several pages were missing this and have
  been fixed (checkout, success, login, admin layout, lesson page).
- Multi-column rows (price/format fields, cart line items, admin list headers) stack
  vertically below the `sm:` breakpoint (`flex-col sm:flex-row`) rather than
  compressing into a cramped horizontal squeeze on narrow screens.
- The admin nav and the public `SiteHeader` both scroll horizontally on narrow
  phones (`overflow-x-auto whitespace-nowrap`) instead of wrapping into a cramped
  multi-line stack. (`SiteHeader` was missed when this was first fixed for the admin
  nav — caught later via actual mobile-viewport testing, not just code review.)

**Touch targets**
- The lesson-block drag handle and Move Up/Down buttons were originally sized for
  mouse precision (small text-only targets) — bumped to real touch targets (~44×44px,
  the standard minimum from Apple's and Google's own platform guidelines) since this
  admin UI is realistically used from a tablet as often as a desktop.
- `touch-none` added to the drag handle specifically — without it, touch-dragging the
  handle on a phone/tablet fights with the browser's native scroll gesture, a common
  and easy-to-miss `@dnd-kit` + touch bug.
- Interactive text links with small visual footprints (e.g. "Remove" in the cart) get
  invisible padding (`p-2 -m-2`) that expands the tappable area without changing the
  visual layout.

**Images & video**
- Image previews in the admin editor were missing a max-width constraint and could
  overflow a narrow screen if the uploaded image was wider than tall — fixed
  (`max-w-full h-auto` alongside the existing height cap).
- The public video player is wrapped in an `aspect-video` container so it reserves its
  final size before the video loads, rather than jumping/reflowing the page once
  metadata arrives (this also helps Cumulative Layout Shift, a Core Web Vitals metric
  that factors into how "solid" a page feels on any device).
- All content images render at `w-full` / `max-w-full`, scaling down naturally on
  narrow viewports rather than forcing horizontal scroll.

**Rich text rendering**
- Caught and fixed a real bug while auditing: lesson content and the Tiptap editor both
  used Tailwind's `prose` class for typography, but the `@tailwindcss/typography`
  plugin that makes `prose` do anything was never actually added to the project. Fixed
  by adding the plugin as a dependency and registering it in `tailwind.config.js`.
- Tailwind itself had the same gap — utility classes were used throughout the UI from
  the start, but the package was never installed. Also fixed (dependency, config,
  PostCSS setup, `globals.css` directives).

## Cross-browser support
`package.json` now has an explicit `browserslist` entry (last 2 versions of Chrome,
Firefox, Safari, Edge; iOS ≥ 14; explicitly excluding IE11), which drives what
Autoprefixer and Next's own build target actually emit — this is the setting that
determines whether things like flexbox gaps, `:focus-visible`, and modern CSS
selectors get the vendor prefixes and fallbacks they need for real-world Safari/iOS
quirks, not just an aspirational comment.

## What still needs manual verification (can't be fully automated)
- **Test on real devices where possible**, not just Chrome DevTools' device toolbar —
  iOS Safari in particular has meaningful differences from desktop Chrome (viewport
  units, video controls, date input rendering) that a simulated viewport won't surface.
  If real devices aren't available, BrowserStack or a similar cross-device testing
  service is the next best option.
- **Run Lighthouse's mobile audit** (Chrome DevTools → Lighthouse → Mobile) on the
  storefront, checkout, and lesson pages specifically — it flags tap-target sizing,
  viewport config, and layout shift issues directly.
- **Test the drag-and-drop reordering on an actual touchscreen**, not just with a mouse
  or DevTools' touch simulation — this is the single most likely interaction to behave
  subtly differently on a real device than in a simulator.
- **Verify the Tiptap toolbar at narrow widths** — it now wraps instead of overflowing,
  but check that wrapped rows still make sense visually with your final button set.
- **Check orientation changes** (portrait ↔ landscape) on tablets specifically, since
  a tablet in landscape often lands right at the `md:`/`lg:` breakpoint boundary where
  layouts can look transitional/awkward if not explicitly checked.
- **Print stylesheet**: implemented in `app/globals.css` (`@media print`). Site chrome
  (nav, footer, forms, video/audio players) is hidden via a `.no-print` utility class,
  and dark/colored backgrounds are forced to plain white with dark text to avoid
  wasting ink. **Study/lesson content is deliberately excluded** — printing it would
  hand someone a free copy of the physical book, which is a separately sold product.
  Lesson pages print only a short explanatory notice instead of their actual content
  (`.study-content-protected` in the same stylesheet). Worth being direct about the
  limit of this: it's a standard CSS print-hiding rule, respected by the normal
  File > Print flow — it is not DRM and cannot stop someone from disabling CSS or
  screenshotting, which is inherent to any web content, not a gap specific to this
  implementation.
