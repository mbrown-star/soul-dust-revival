"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart/CartContext";

export function AddToCartButton({
  productId,
  title,
  priceCents,
  format,
}: {
  productId: string;
  title: string;
  priceCents: number;
  format: "physical" | "digital";
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function handleClick() {
    addItem({ productId, title, priceCents, format });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className="font-sans font-semibold bg-ink text-parchment rounded-lg px-6 py-3 hover:bg-dusk focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
      >
        Buy Now
      </button>
      {/* Confirms the click for screen reader users too — a silent state
          change on a button click is otherwise only perceivable visually. */}
      <p role="status" aria-live="polite" className="font-sans text-sm text-moss mt-2 h-5">
        {added ? "Added to cart" : ""}
      </p>
    </div>
  );
}
