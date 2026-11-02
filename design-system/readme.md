# Study Platform Design System

A design system distilled from **[`mbrown-star/study-platform-scaffold`](https://github.com/mbrown-star/study-platform-scaffold)** — a Next.js app combining a commerce storefront (books, digital study access) with a gated, interactive study app (magic-link login, lessons made of flexible content blocks, progress tracking) and an internal admin console for managing products and study content.

Explore the source repo further for implementation detail this design system doesn't cover (data model, auth, payments, accessibility rationale) — see its own `README.md`, `SECURITY.md`, and `ACCESSIBILITY.md`.

**No Figma or slide deck was attached** — everything here is distilled directly from the application source code.

## Product context

Three surfaces, one codebase:
1. **Storefront** — browse and buy physical books and digital "study access" products; cart persists client-side; digital items require an account, physical-only carts allow guest checkout.
2. **Study App** — the gated product itself: a study is an ordered list of lessons, each lesson an ordered list of content blocks (text, image, video, audio, question, callout/color-block). Progress and free-text question responses are tracked per user.
3. **Admin Console** — internal tool for managing products and authoring/importing study content, including a drag-and-drop (or keyboard up/down) lesson block editor.

Content is study/devotional in nature — block labels in source include "Key Verse," "Reflection," and "Prayer Prompt" — but the platform itself is generic (any structured course/study content would fit the same model).

**No brand name, logo, or visual identity is defined anywhere in the source** — the app renders on Tailwind's default neutral palette and the OS system font, with zero custom colors, type, or imagery. This design system therefore documents the *de facto* visual system the code already expresses (flat, border-based, ink-on-white, one amber accent used for devotional callouts) rather than inventing a brand. See "Caveats" at the bottom.

## Content fundamentals

How copy is written in source, with examples:

- **Direct and functional, never marketing-voiced.** Buttons say exactly what happens: "Proceed to payment," "Send login link," "Save product," "Import document" — never "Get started" or "Let's go."
- **"You/your" for the reader, plain first-person only in confirmations.** "Check your email for a login link." / "Your cart includes digital content, which requires an account." / "Thank you for your order."
- **Sentence case throughout**, no title-case headers, no ALL CAPS except the small uppercase-tracked block-type label in the admin editor ("TEXT", "CALLOUT").
- **No exclamation points, no emoji, no hype.** The warmest line in the whole app is "Thank you for your order" — everything else is procedural: "No products yet.", "Your cart is empty.", "Order #a1b2c3d4."
- **Errors are specific and calm**, never jokey: "Alt text is required whenever an image is attached (WCAG 1.1.1)." / "Captions are required for video content (WCAG 1.2.2)."
- **Devotional content (the actual study material) uses short, plain labels** as section titles rather than icons or decoration: "Key Verse," "Reflection," "Prayer Prompt" — the label does the work, no visual flourish needed.
- **Admin/system copy is transparent about mechanism**, not just outcome: ".docx files split into lessons using the document's own heading styles (most reliable)." This "explain the how" habit shows up repeatedly — it trusts the reader with detail rather than hiding it.

## Visual foundations

- **Color**: near-monochrome. Ink (`neutral-900` `#171717`) on white, with a light neutral scale (`50`/`100`/`200`) for subtle fills and borders. The only chromatic color is **amber** (`#fef3c7`), and only as the *default* (fully overridable) background for devotional callout blocks — it is not a brand accent applied elsewhere. Semantic red (errors) and a warm amber-700/green-700 pairing (warning/success) appear only as small inline text, never as filled badges or buttons.
- **Type**: a single sans stack, the OS system font (`system-ui, -apple-system, sans-serif`) — no serif, no display face, no custom webfont anywhere. Weights are just `normal`/`medium`/`semibold`; sizes follow Tailwind's default scale (12–30px). Headings are always `semibold`, never `bold`.
- **Spacing**: Tailwind's default 4px-based scale. Layouts are narrow and centered — `max-w-sm` (384px) for login, `max-w-xl` (576px) for checkout/success, `max-w-2xl` (672px) for the lesson reading column, `max-w-4xl` (896px) for the admin shell. Nothing is full-bleed; there's no marketing hero pattern.
- **Backgrounds**: flat white or very light neutral fills only. No gradients, no photography, no illustration, no repeating patterns or textures anywhere in source.
- **Animation**: minimal and functional only — a `transition-all` on the progress-bar fill width, `focus`/`hover` transitions for interactive states, and a `prefers-reduced-motion` media query that hard-disables all animation/transition duration for users who ask for it. No entrance animations, no bounce, no page transitions.
- **Hover states**: subtle background shift only — interactive rows (`ProductRow`, admin list items, tab-style menu items) go to `neutral-50` on hover. Buttons have no distinct hover treatment defined in source beyond the browser default; disabled state is the one clearly defined non-default state (opacity 50%, `cursor: default`).
- **Press/active states**: not explicitly styled in source; treat as inheriting the hover treatment.
- **Borders over shadows.** Nearly everything is delineated with a 1px `neutral-200` border and `rounded-lg` (8px) corners — cards, form fields, list dividers, buttons. The *only* shadow in the entire codebase is a `shadow-lg` on the one floating popover menu (admin "+ Add block"); shadows are not a general elevation system here.
- **Focus states**: highly deliberate and consistent — every interactive element gets a visible `2px solid` dark-ink outline with `2px` offset on focus, applied globally via `:focus-visible`, plus a skip-to-content link. This is clearly an accessibility-first codebase (see `ACCESSIBILITY.md`) and focus visibility should never be compromised in derived work.
- **Transparency/blur**: none used anywhere in source.
- **Imagery**: none exists in the codebase (no product photography, illustrations, or stock imagery shipped) — every image is user-uploaded at runtime (product photos, study cover images, lesson images) via Cloudflare R2. Placeholder treatment for a missing image is a flat `neutral-100` box, no icon or pattern inside it.
- **Corner radii**: `rounded-lg` (8px) is the dominant radius for cards/fields/buttons; `rounded-full` for the progress bar and circular fills; a smaller `rounded` (4px) shows up only on tiny inline chips (thumbnail crops, keyboard-shortcut buttons).
- **Cards**: no shadow, 1px `neutral-200` border, `rounded-lg`, white or transparent background, generous internal padding (16–20px). List rows use a divider (`divide-y`) instead of individual card borders when stacked.
- **Layout rules**: single-column, centered, no fixed/sticky chrome except the admin's simple top nav; no sidebar in the customer-facing app.

## Iconography

**No icon library, icon font, or SVG icon set exists in source** (`package.json` has no `lucide-react`, `heroicons`, or similar dependency). The handful of "icons" in the entire app are plain Unicode glyphs set directly in text: `⠿` (braille pattern, drag handle), `↑`/`↓` (reorder buttons), `✓` (inline success confirmation, e.g. "Captions uploaded ✓"), `+` (add-block trigger), and a plain `×`-style text "Remove" link rather than a close icon. **No emoji are used anywhere.** If richer iconography is needed going forward, the closest CDN match to this plain, geometric, low-decoration style would be **Lucide** (thin stroke, minimal) — flagged here as a substitution, not something present in source. See `guidelines/iconography.card.html`.

## Assets

`assets/` is intentionally empty. **No logo, wordmark, illustration, or photography exists anywhere in the source repository** — product/cover images are user-uploaded content, not brand assets. Per design-system convention, no logo was invented; wherever a mark would go, render the plain product name in the system font instead (see `ui_kits/*/index.html` headers, which do exactly this).

## Components

Grouped by concern under `components/`:

**Forms** (`components/forms/`) — `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `ColorPicker`
**Feedback** (`components/feedback/`) — `ProgressBar`, `Callout`, `StatusMessage`
**Navigation** (`components/navigation/`) — `Tabs`
**Data display** (`components/data-display/`) — `Badge`, `ProductRow`

### Intentional additions
The source has no standalone component library — these are extracted from recurring patterns across `ProductForm`, `StudyForm`, `BlockEditor`, `NewStudyTabs`, admin list pages, etc. Two small additions beyond a literal line-for-line extraction:
- `Button` variants `secondary`/`ghost`/`danger` — source only ever uses one solid-ink button; these cover common secondary/destructive actions in the same visual language.
- `Badge`/`StatusMessage` as named components — source inlines this pattern (plain colored text) ad hoc each time; named here for reuse.

## UI kits

`ui_kits/storefront/`, `ui_kits/study-app/`, `ui_kits/admin/` — one per product surface above, each an interactive click-through built from the components above. See each kit's own `README.md`.

## Foundations

`tokens/` (colors, typography, spacing, borders — all `@import`ed from root `styles.css`) and `guidelines/` (specimen cards, visible in the Design System tab). No custom webfont: the source uses the OS system-font stack, so no font files were needed and no substitution was made.

## Index

- `styles.css` — global stylesheet entry point (import this)
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `borders.css`
- `guidelines/` — foundation specimen cards (colors, type, spacing, borders, focus ring, iconography, buttons, callout colors)
- `components/forms/`, `components/feedback/`, `components/navigation/`, `components/data-display/` — reusable primitives, each `<Name>.jsx` + `<Name>.d.ts` + `<Name>.prompt.md`
- `ui_kits/storefront/`, `ui_kits/study-app/`, `ui_kits/admin/` — interactive product recreations
- `assets/` — intentionally empty (see Iconography — no logo, imagery, or icon assets exist in source)
- `SKILL.md` — portable skill file for use in Claude Code or elsewhere

## Caveats & how to help

- **No brand identity exists in the source.** Every color, spacing, and type value here is lifted directly from Tailwind defaults and inline styles in the app code — there is no proprietary palette, logo, or typeface to recreate. If this platform has a real brand (name, logo, colors, fonts) that isn't in this codebase, please share it and this system can be corrected to match it exactly rather than approximating "generic Tailwind."
- **No screenshots or a live deployment were available** — everything was read from source, per the instructions, so there's nothing to visually cross-check against; flag anything here that doesn't match what you've actually seen running.
- Ask to iterate on any UI kit screen, add missing screens (e.g. product detail, admin lesson-import flow in full), or push the palette/type further once real brand input arrives.
