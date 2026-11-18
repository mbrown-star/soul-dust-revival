/** The current section's mark in a top nav bar (public and admin), so the
 *  two read as one system. Pair it with aria-current="page". */
export const activeNavLinkClass = "text-gold border-b-2 border-gold";

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
