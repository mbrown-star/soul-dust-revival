import type { Metadata } from "next";
import { closedInSneakPeek } from "@/lib/launchMode";

// `page.tsx` here renders a "use client" cart/checkout form (needs client
// state at mount), so this layout carries the title rather than the page
// itself. /checkout/success overrides this with its own `metadata` export,
// since it's a separate (server) page underneath.
export const metadata: Metadata = {
  title: "Checkout",
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  // Covers /checkout/success too -- the store is closed on the sneak-peek site.
  closedInSneakPeek();
  return children;
}
