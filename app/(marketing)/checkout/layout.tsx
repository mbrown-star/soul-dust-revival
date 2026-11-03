import type { Metadata } from "next";

// `page.tsx` here is a "use client" file (needs cart/auth state at mount), and
// route segment config is silently ignored there -- this layout carries the
// title without touching the page. /checkout/success overrides this with its
// own `metadata` export, since it's a separate (server) page underneath.
export const metadata: Metadata = {
  title: "Checkout",
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
