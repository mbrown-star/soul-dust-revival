import type { Metadata } from "next";

// `page.tsx` here renders a "use client" cart/checkout form (needs client
// state at mount), so this layout carries the title rather than the page
// itself. /checkout/success overrides this with its own `metadata` export,
// since it's a separate (server) page underneath.
export const metadata: Metadata = {
  title: "Checkout",
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
