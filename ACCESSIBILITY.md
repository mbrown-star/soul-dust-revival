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
  keyboard users can always see where they are (WCAG 2.4.7).
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
- `alt` text is a **required field in the admin UI** wherever an image can be attached
  (product images, study cover images, in-lesson image blocks) — the save button is
  disabled until it's filled in, rather than defaulting to an empty `alt=""` and hoping
  someone fills it in later (WCAG 1.1.1).

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

**Rich text content (Tiptap editor)**
- Output is real semantic HTML (`<h2>`, `<ul>`, `<a>`, etc.), not styled `<div>`s, so
  heading structure and list semantics survive into what screen readers announce
  (WCAG 1.3.1).
- Sanitized with DOMPurify on both write and render (see `SECURITY.md`) — sanitization
  preserves these semantic tags rather than stripping them to plain text.

**Menus**
- The block-type picker (`AddBlockButton`) uses proper `aria-haspopup`/`aria-expanded`/
  `role="menu"`/`role="menuitem"` semantics, closes on Escape, and returns focus to the
  trigger button after a selection — standard WAI-ARIA menu-button behavior.

## What still needs manual verification (can't be fully automated)
- **Color contrast of any custom brand colors.** Structural UI uses near-black on white,
  which passes comfortably. But callout blocks (`components/study/LessonBlock.tsx`) let
  an admin pick *any* background color via a free color picker — there's a reminder
  in the admin UI, but nothing programmatically blocks a low-contrast combination.
  Check every callout color choice against its text color at 4.5:1 (body text) or 3:1
  (large text) before publishing.
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
  a common source of subtle screen reader issues that automated checkers miss.
- **Run automated audits regularly**: axe DevTools or Lighthouse in Chrome DevTools, and
  WAVE (wave.webaim.org), on every major page — storefront, checkout, study/lesson pages,
  and the full admin authoring flow. These catch a meaningful chunk of issues but not
  everything; they're a floor, not a substitute for manual testing.
- **Manual keyboard-only pass**: unplug the mouse and try to complete a full purchase,
  and a full lesson-authoring flow, using only Tab/Shift+Tab/Enter/Space/Arrow keys.
