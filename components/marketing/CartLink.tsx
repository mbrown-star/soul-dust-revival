"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";
import { marketingUrl } from "@/lib/domains";

export function CartLink() {
  const { items } = useCart();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <Link
      href={marketingUrl("/checkout")}
      className="text-parchment/80 hover:text-gold focus:outline-none focus:text-gold p-1 -m-1"
    >
      Cart{count > 0 && <span aria-label={`, ${count} items`}> ({count})</span>}
    </Link>
  );
}
