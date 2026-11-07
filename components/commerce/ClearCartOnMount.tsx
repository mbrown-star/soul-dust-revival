"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart/CartContext";

/**
 * Clears the cart once the order confirmation page is reached -- `clear()`
 * has existed on CartContext since it was first written but had no caller
 * anywhere, so a completed purchase never emptied the cart (found live: the
 * item bought stayed in the cart after a real checkout completed). Only
 * runs here, not at checkout-redirect time, so a customer who cancels on
 * Stripe's own page and returns still finds their cart intact.
 */
export function ClearCartOnMount() {
  const { clear } = useCart();

  useEffect(() => {
    clear();
    // Only ever needs to fire once, on the very first mount of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
