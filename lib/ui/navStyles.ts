// A top-bar nav link (public and admin), so the two read as one system. No
// ring/box on focus -- focus is still visible (WCAG 2.4.7) via the same
// text-color change used for hover.
const navLinkBase = "hover:text-gold focus:outline-none focus:text-gold p-1 -m-1";
export const navLinkClass = `${navLinkBase} text-parchment/80`;
/** The current section's link in a top nav bar: gold text and a gold
 *  underline. Pair it with aria-current="page". Its own class rather than
 *  navLinkClass + "text-gold": Tailwind emits text-parchment/80 after
 *  text-gold, so the appended gold never showed (only the underline did). */
export const navLinkActiveClass = `${navLinkBase} text-gold border-b-2 border-gold`;

/** A block-level row inside a nav dropdown panel (the public Profile menu,
 *  and the public and admin mobile hamburger menus): its own padding and a
 *  44px touch target, as opposed to the inline top-bar link treatment. */
const navMenuItemBase =
  "flex items-center min-h-[44px] px-4 hover:bg-parchment/10 hover:text-gold focus:outline-none focus:text-gold";
export const navMenuItemClass = `${navMenuItemBase} text-parchment/90`;
/** The current section's row in a nav dropdown. Its own class, not
 *  navMenuItemClass + "text-gold": Tailwind emits text-parchment/90 after
 *  text-gold, so appending the gold never actually showed. */
export const navMenuItemActiveClass = `${navMenuItemBase} text-gold`;
