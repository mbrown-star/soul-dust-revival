"use client";

import { createContext, useContext, useSyncExternalStore, ReactNode } from "react";

export type CartItem = {
  productId: string;
  title: string;
  priceCents: number;
  format: "physical" | "digital";
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  totalCents: number;
  hasDigital: boolean;
  hasPhysical: boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "cart";

// Module-level store (the cart is a single, page-wide singleton) read via
// useSyncExternalStore instead of hydrating in a useEffect + setState, which
// both trips react-hooks/set-state-in-effect and risks a hydration mismatch
// since localStorage isn't available during the server render.
let cartItems: CartItem[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) cartItems = JSON.parse(stored);
  } catch {
    // Corrupted or inaccessible storage — fall back to an empty cart.
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
  } catch {
    // Storage unavailable (private browsing, quota) — cart still works in-memory.
  }
}

function setItems(updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) {
  cartItems = typeof updater === "function" ? updater(cartItems) : updater;
  persist();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  hydrateFromStorage();
  return cartItems;
}

function getServerSnapshot() {
  return cartItems; // always [] on the server
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function addItem(item: Omit<CartItem, "quantity">, quantity = 1) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { ...item, quantity }];
    });
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) return removeItem(productId);
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)));
  }

  function clear() {
    setItems([]);
  }

  const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
  const hasDigital = items.some((i) => i.format === "digital");
  const hasPhysical = items.some((i) => i.format === "physical");

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clear, totalCents, hasDigital, hasPhysical }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
