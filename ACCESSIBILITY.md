# Accessibility Notes

## Standard targeted
There is no single official U.S. regulatory technical standard for private-business
websites under the ADA yet — but the Department of Justice has repeatedly pointed to
**WCAG 2.1 Level AA** as the practical benchmark in its guidance and in ADA settlements,
and it's also what Section 508 (federal) compliance is built on. This scaffold targets
**WCAG 2.1 AA** throughout. This is engineering guidance, not legal advice — have counsel
review before launch if ADA compliance is a hard requirement for the business, since
actual legal exposure depends on specifics (who you serve, revenue, jurisdiction) that
are outside what code can determine.

## What's implemented

**Navigation & structure**
- Skip-to-content link, first focusable element on every page (`app/layout.tsx`) — lets
  keyboard and screen reader users bypass repeated nav (WCAG 2.4.1).
- Semantic `<main>` landmark wrapping page content.
- Visible focus indicator (`:focus-visible`) applied globally in `globals.css`, so
  keyboard users can always see where they are (WCAG 2.4.7). A few places opt out of
  the global ring for a different, still-visible indicator, each a deliberate exception
  rather than a site-wide change to focus styling: the site nav (`SiteNav.tsx`,
  `CartLink.tsx`) and the admin nav (`app/admin/layout.tsx`) use a text-color-only
  change instead (`focus:text-gold`, the same color already used on hover); the
  homepage's featured-product tiles and blog teaser links (`app/(marketing)/page.tsx`)
  reuse their existing hover effect on focus too (`group-focus:` alongside
  `group-hover:` — the image scale, the title color change), since those tiles have no
  obvious text to recolor the way a plain link does.
- `prefers-reduced-motion` respected globally — animations/transitions collapse to
  near-zero duration for users who've asked their OS for that (WCAG 2.3.3).

**Forms (checkout, login, admin product/study forms)**
- Every input has an associated `<label>` via `htmlFor`/`id` (or `aria-label`/
  `aria-labelledby` where a visible label would be redundant) — WCAG 1.3.1, 4.1.2.
- Required fields and validation errors use `aria-invalid` + `aria-describedby` linking
  the input to its error message, and errors are marked `role="alert"` so they're
  announced immediately rather than sitting silently on screen (WCAG 3.3.1, 4.1.3).
- Async status ("Uploading...", "Saved", "Redirecting...") uses `role="status"
  aria-live="polite"` — a screen reader user gets the same feedback a sighted user gets
  from watching the button change (WCAG 4.1.3).
- The login page moves focus to the confirmation message once the form is replaced by
  it, since focus would otherwise be silently dropped when the form unmounts
  (WCAG 2.4.3).

**Images**
- `alt` text is a **required field in the admin UI** for study cover images and
  in-lesson image blocks — the save button is disabled until it's filled in, rather
  than defaulting to an empty `alt=""` and hoping someone fills it in later
  (WCAG 1.1.1). Also enforced at the API layer so a direct API call can't skip the
  UI's guard — this specific gap (alt text shipped unwired) happened twice before per
  `AUDIT.md`.
  - **Product images (`imageUrl`/`backImageAlt` on `products`) are not enforced,
    for any product type — by explicit decision, widened 2026-11-05.** Book
    covers were exempted first (2026-11-05 earlier that day); the requirement
    was then dropped entirely rather than narrowed, so a non-book product's
    image can also be saved with no alt text. It's still encouraged in the admin
    UI, just not blocking. A missing alt renders as `alt=""` (decorative) on the
    storefront (`app/(marketing)/books/[slug]/page.tsx`, `CoverGallery.tsx`,
    product listing/detail pages) — a real, accepted accessibility trade-off for
    product images specifically, not a gap present anywhere else on the site.
- `components/commerce/CoverGallery.tsx` (book front/back cover gallery): each cover
  image gets its own distinct alt text when one is set; prev/next controls and the
  position dots are real `<button>`s with `aria-label`s, fully keyboard-operable;
  `prefers-reduced-motion` is respected for the scroll animation (both via CSS and a
  JS `matchMedia` check, since programmatic `scrollTo({behavior: "smooth"})` ignores
  the CSS declaration).

**Video & audio**
- Video blocks require a `.vtt` captions file before the admin UI treats the block as
  complete (WCAG 1.2.2). The `<video>` element renders a `<track kind="captions">` from
  it on the public side.
- Both video and audio blocks have a transcript field, rendered as a native
  `<details>/<summary>` disclosure on the public page — keyboard-operable and
  screen-reader-friendly with no custom ARIA needed (WCAG 1.2.1).

**Drag-and-drop lesson block reordering**
- This is one of the most commonly-missed accessibility gaps in admin UIs — a
  mouse/touch-only drag handle locks out anyone who can't operate that specific
  interaction. This scaffold addresses it two ways:
  - `@dnd-kit`'s `KeyboardSensor` is wired in, so the drag handle itself is operable via
    keyboard (Tab to it, Space to pick up, Arrow keys to move, Space to drop, Escape to
    cancel) — WCAG 2.1.1.
  - **Explicit Move Up / Move Down buttons** sit next to every block as a first-class
    alternative, not an afterthought — some users can navigate by keyboard but still find
    drag-style interactions (even keyboard-driven ones) awkward, so a direct action button
    is the more robust guarantee.
- Reorder results are announced via a `role="status" aria-live="polite"` region, since
  the visual reflow alone isn't perceivable to a screen reader user (WCAG 4.1.3).
- **Lesson builder (2026-11-10)**: the same handle + Move up/down pattern now lives in one
  shared `components/admin/builder/SortableRow.tsx`, used by every reorderable list in
  the admin: lesson blocks, a study's lesson list, and every list inside a Study week
  (sections, parts, stations, practices, prayer beats, paragraphs). In addition:
  - dnd-kit's drag announcements are replaced with readable ones (`dragAnnouncements()`).
    The defaults read out each item's database UUID ("Draggable item a55a02d0-… was moved
    over…").
  - The block palette is click-to-add (Enter/Space append the block). Only pointer drags
    start a drag there, so keyboard users never get trapped in a drag they didn't mean to
    start. Positional insertion by keyboard goes through the "+ Insert here" button
    between every pair of blocks.
  - Palette and insert buttons carry their visible text in their accessible names (WCAG
    2.5.3, found by the axe run below). The Study week's tabs follow the WAI-ARIA tabs
    pattern (arrow keys, `aria-selected`, roving tabindex), and each tab shows a count of
    required fields still empty.
  - Per-block save state is a live region, so a "Saved" or "Not saved" result is
    announced, not just shown.
  - Media lists inside a Study week are labelled groups (`role="group"` +
    `aria-labelledby`), so a screen reader announces which list a "+ Image" button belongs
    to. A builder tab can hold many of these lists.
  - `qa/e2e/specs/accessibility.spec.ts` runs axe on the block builder and on every tab of
    the week builder. `admin-studies.spec.ts` exercises a real keyboard drag (Space, arrow,
    Space) and a real pointer drag from the palette.

**Rich text content (Tiptap editor)**
- Output is real semantic HTML (`<h2>`, `<ul>`, `<a>`, etc.), not styled `<div>`s, so
  heading structure and list semantics survive into what screen readers announce
  (WCAG 1.3.1).
- Sanitized with DOMPurify on both write and render (see `SECURITY.md`) — sanitization
  preserves these semantic tags rather than stripping them to plain text.

**Menus**
- The block-type picker is now the lesson builder's palette (plain buttons in a labelled
  `<nav aria-label="Add a block">`) plus the inline "+ Insert here" toggles, which
  replaced `AddBlockButton`'s menu button in 2026-11-10.

**Callout background color — live contrast check**
- `ColorPicker.tsx` (used by `BlockEditor.tsx` for a callout's background) computes a real
  WCAG contrast ratio (`lib/color/contrast.ts`) against the two text colors that actually
  render on top of it in `LessonBlock.tsx` — the title (`ink`, inherited from `<body>`) and
  the body copy (`.prose`'s own default color, which is *not* `ink` — see the module's doc
  comment) — and shows a live, computed warning (`role="alert"` when it fails) instead of
  the static "remember to check this" reminder that used to sit next to the picker with no
  way to act on it. Not a hard block on saving (a callout is a stylistic choice, and a
  false positive from the two-fixed-text-color assumption is more costly here than for a
  required field like alt text) — this is advisory, surfaced where an admin will actually
  see it, computed from the real numbers rather than left to eyeballing.

**Standing automated accessibility suite (axe-core, part of the QA suite)**
`qa/e2e/specs/accessibility.spec.ts` (`npm run test:a11y`) runs axe-core against every
major public page, both reader shells (every tab of each, not just the default one — a
hidden-but-mounted tab panel is invisible to axe until actually switched to), and every
admin section, as `qa-user`/`qa-admin`. This replaces "axe DevTools run by hand
occasionally" with something that runs every time the QA suite runs and can't quietly
stop happening. It's still a floor: screen-reader-only issues, caption/transcript
accuracy, and anything behind a page a fixture doesn't cover are untouched by it — see
"What still needs manual verification" below.

The first real run found 4 contrast failures this pass fixed, all the same root cause —
`ember-700` text is calibrated to pass WCAG AA against a full-strength `parchment`/white
background (4.9–5.0:1) but drops to ~4.45:1 against the translucent tinted card
backgrounds (`bg-dusk/5`, `bg-ember-700/10`) several eyebrow labels and a status badge
sat on top of: the Devotional reader's "Lift Up Your Eyes" label, the Study reader's
"Going Deeper · The Greek" and "Bottom Line" labels, the admin Studies list's "Study" kind
badge, and the admin Social list's "scheduled" status badge. Fixed by recoloring the text
(`moss` for the eyebrow labels, `ink` for the two badges, both of which clear >6:1 against
the same backgrounds) rather than changing the backgrounds or the token itself — this is
specifically about `ember-700` on a *diluted* background, not a flaw in the token itself,
which still passes fine everywhere it sits on a full-strength background.

**Study reader sheets behave as modal dialogs (2026-11-12)**
The bottom sheets in the Study reader (a word study opened from the Passage tab, the week
picker; `components/study/Sheet.tsx`) are `role="dialog"` with `aria-modal`, but didn't
act like one: focus stayed on the page behind them and Escape did nothing. Now focus
moves to the sheet's Close button when it opens, Escape closes it, and focus returns to
whatever opened it (the underlined word, the breadcrumb). Covered by the Five Stations
week test in `qa/e2e/specs/study-reader.spec.ts`. Not done: a full focus trap (Tab can
still leave the sheet).

**Manual keyboard-only pass (checkout + admin lesson authoring)**
Driven by hand (Tab/Shift+Tab/Enter/Space/Arrow/Escape only, no mouse) against the local
QA dev server: a full guest physical-purchase checkout (add to cart → email → country →
"Proceed to payment") had a visible focus indicator at every step, correct tab order, no
keyboard traps, and the cart/add-to-cart `aria-live` confirmations fired correctly — no
findings. The admin lesson-authoring flow surfaced two real bugs, both fixed:
- **`AddBlockButton.tsx` didn't check `res.ok`** — a failed add-block request (a 403 from
  an expired session, a validation error, a network failure) was parsed and handed to
  `onAdd()` as if it were a real block. The resulting block's drag/move/delete controls
  then rendered as `"undefined block"` (`block.type` was `undefined` on the error body),
  confusing for a sighted admin and actively misleading for a screen reader user told to
  "move the undefined block," with no indication anything had actually failed. Fixed with
  a `try`/`catch` + `res.ok` check and a visible `role="alert"` error message — the same
  gap already flagged (not yet fixed) in 9 other admin files per the 2026-11-08 entry in
  CLAUDE.md; this is one of those nine, found live rather than by code review.
- **The Move Up/Down buttons could drop keyboard focus to `<body>`.** A button that
  becomes `disabled` right after being activated (e.g. "Move up" at the new position 1)
  can't hold focus, so the browser silently drops it to `<body>` — a keyboard user who
  just reordered a block loses their place in the page entirely and has to re-navigate
  from the top. Fixed in `SortableBlockList.tsx` by refocusing the moved block's own drag
  handle (never disabled, so always a stable thing to land on) after a move.
- **Confirmed working, no changes needed**: the `AddBlockButton` menu's full keyboard
  path (Tab into it, Escape closes and returns focus to the trigger); the `@dnd-kit`
  `KeyboardSensor` (Space to pick up, Arrow keys to move — a large card needs several
  presses to cross into the next item's position, which is expected, not a bug, and
  exactly why the Move Up/Down buttons exist as the lower-friction alternative — Space to
  drop, Escape to cancel and correctly revert); the `aria-live` reorder announcement.
- **Likely resolved 2026-11-10** (see below): every builder `DndContext` now gets a
  stable `id` from `useId()`, which is what dnd-kit derives its `DndDescribedBy-…` ids
  from. A production-build check of both builder pages logged no console errors or
  hydration warnings. That check didn't use `next dev`'s more verbose hydration diff, so
  re-confirm there. The original finding, kept for context: a real, reproducible React hydration
  mismatch on `/admin/studies/[id]/lessons/[lessonId]`, surfaced by the console while
  exercising this flow (confirmed on a fresh hard navigation, not a Fast-Refresh-only
  artifact). `@dnd-kit`'s own internal `aria-describedby="DndDescribedBy-N"` id numbering
  disagrees between the server-rendered and client-hydrated passes. A real fix means
  either pinning/wrapping `@dnd-kit`'s id generation to something stable across SSR and
  hydration or investigating further upstream — not something to patch blind. Severity is
  moderate: the description text itself is dnd-kit's own generic sortable instructions,
  not a visible content change, but "won't be patched up" per React's own message means
  the mismatched id persists until some other re-render touches that subtree.

## Automated audit run (axe-core, against the real dev server)
Ran axe-core directly against the running app (not just the `jsx-a11y` lint rules,
which only catch static-markup issues) across the homepage, `/books`, `/books/[slug]`,
`/login`, `/signup`, `/blog`, `/privacy`, `/checkout`, `/account`, and a 404 — chosen as
the storefront/checkout/account pages this file's own "run automated audits regularly"
item below calls for. Found and fixed three real, previously-missed issues:
- **No `<title>` on almost every page** (WCAG 2.4.2) — the root layout had no `metadata`
  export and no fallback. Only the 3 pages that happened to set their own title had one
  at all. Fixed with a title template in `app/layout.tsx` plus real per-page titles,
  including `generateMetadata` for dynamic/gated pages that mirrors each page's own
  entitlement/role check so a gated title can't leak to someone without access.
- **`ember` on `parchment` failed contrast** (3.96:1, needs 4.5:1) in ~20 places
  site-wide. Darkened the token to the smallest shade that clears it (confirmed with
  the user first, since brand colors are protected — see CLAUDE.md).
- **Two pages missing a heading in some render states** (`/checkout`'s empty-cart and
  login-required screens, `/account`'s loading state) — each has a correct `<h1>` in its
  main path, but these early returns didn't.

Also found `text-neutral-500` (a generic Tailwind gray, not a brand token) failing
contrast at 4.24:1 in 24 files — bumped to `text-neutral-600` (6.99:1) throughout.

This is a real automated pass, not exhaustive manual testing — the admin authoring
flow, leader section, and studies/lessons pages still need the full manual run this
file already calls for below (the gated pages weren't exercised beyond `generateMetadata`
without real auth), and no screen reader was used.

## What still needs manual verification (can't be fully automated)
- **Caption/transcript accuracy.** The system enforces that a captions file and
  transcript field *exist* — it can't verify they're actually accurate or complete.
  Auto-generated captions are usually not good enough on their own; budget for human
  review/correction.
- **Imported study documents** (`.docx`/`.pdf` — see the import feature) inherit
  whatever heading structure the source document had. The `.docx` path relies on Word's
  own Heading 1/2 styles, so verify the source document actually used real heading
  styles (not just bold, bigger text) — otherwise the imported HTML won't carry real
  `<h1>`/`<h2>` semantics either.
- **The Tiptap editor toolbar itself** — verify it with an actual screen reader
  (VoiceOver, NVDA, or JAWS), not just automated tooling. Rich text editor toolbars are
  a common source of subtle screen reader issues that automated checkers miss. This is
  now the single biggest gap in this file: nothing in this project has been checked with
  a real screen reader yet, only axe-core (a static/structural checker) and sighted
  keyboard-only passes.
- **The `@dnd-kit` hydration mismatch** flagged above — likely fixed 2026-11-10 (stable
  `DndContext` ids); re-confirm against `next dev`'s console once, then drop this item.
- **A `WAVE` (wave.webaim.org) pass** as a second automated opinion alongside axe-core —
  different tools catch different things, and `npm run test:a11y` only runs the one.

**Done, no longer open items**: color contrast of callout blocks (now a live, computed
check in `ColorPicker.tsx`, see above — still advisory, not a hard block, so a deliberately
chosen low-contrast color can still be saved); running automated audits regularly (now
`npm run test:a11y`, part of the standing QA suite, not a by-hand occasional task); the
manual keyboard-only pass through checkout and the admin lesson-authoring flow (done, see
above — though a *screen reader* pass through the same flows is still open, per above).
