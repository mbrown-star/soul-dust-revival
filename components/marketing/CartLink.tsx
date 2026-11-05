"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";

export function CartLink() {
  const { items } = useCart();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <Link
      href="/checkout"
      className="text-parchment/80 hover:text-gold focus:outline-none focus:text-gold p-1 -m-1"
    >
      Cart{count > 0 && <span aria-label={`, ${count} items`}> ({count})</span>}
    </Link>
  );
}
