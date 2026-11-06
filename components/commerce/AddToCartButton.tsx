"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart/CartContext";

export function AddToCartButton({
  productId,
  title,
  priceCents,
  format,
  variant,
  label,
}: {
  productId: string;
  title: string;
  priceCents: number;
  format: "physical" | "digital";
  // Set only for a format "both" product's physical/digital button — see
  // CartItem's own doc comment in lib/cart/CartContext.tsx.
  variant?: "physical" | "digital";
  label?: string;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function handleClick() {
    addItem({ productId, title, priceCents, format, variant });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className="font-sans font-semibold bg-ink text-parchment rounded-lg px-6 py-3 hover:bg-dusk focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
      >
        {label ?? "Buy Now"}
      </button>
      {/* Confirms the click for screen reader users too — a silent state
          change on a button click is otherwise only perceivable visually. */}
      <p role="status" aria-live="polite" className="font-sans text-sm text-moss mt-2 h-5">
        {added ? "Added to cart" : ""}
      </p>
    </div>
  );
}
