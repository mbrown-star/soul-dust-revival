"use client";

import { useState, useEffect, useId } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { COUNTRIES } from "@/lib/data/countries";
import Link from "next/link";

export default function CheckoutPage() {
  const { items, totalCents, hasDigital, removeItem } = useCart();
  const [guestEmail, setGuestEmail] = useState("");
  const [country, setCountry] = useState("");
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const countryId = useId();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setLoggedIn(!!data.user));
  }, []);

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        guestEmail: hasDigital ? undefined : guestEmail,
        country,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.message ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    window.location.href = data.url;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 sm:py-20 text-center">
        <h1 className="font-display font-bold text-2xl text-ink mb-2">Checkout</h1>
        <p className="font-serif text-ink">Your cart is empty.</p>
      </div>
    );
  }

  // Digital content in the cart requires an account before proceeding.
  if (hasDigital && loggedIn === false) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 sm:py-20 text-center space-y-4">
        <h1 className="font-display font-bold text-2xl text-ink">Checkout</h1>
        <p className="font-serif text-ink">
          Your cart includes digital content, which requires an account.
        </p>
        {/* Two distinct actions rather than one ambiguous "log in or sign up"
            link — a first-time buyer (the common case here) needs signup,
            not login, and the two now behave differently under the hood
            (see AuthForm: signup can create an account, login cannot). */}
        <div className="flex flex-col gap-3 items-center">
          <Link
            href={`/signup?next=/checkout`}
            className="font-sans font-semibold inline-block bg-ink text-parchment rounded-lg px-6 py-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
          >
            Sign up to continue
          </Link>
          <Link
            href={`/login?next=/checkout`}
            className="font-sans text-sm underline text-moss focus:outline-none focus:ring-2 focus:ring-ink rounded"
          >
            Already have an account? Log in
          </Link>
        </div>
      </div>
    );
  }

  const canSubmit = !!country && (hasDigital || loggedIn || !!guestEmail);

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-16 space-y-6">
      <h1 className="font-display font-bold text-2xl text-ink">Checkout</h1>

      <ul className="space-y-3" aria-label="Cart items">
        {items.map((item) => (
          <li key={item.productId} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-moss/20 pb-3">
            <div>
              <p className="font-sans font-medium text-ink">{item.title}</p>
              <p className="font-sans text-sm text-moss">
                Qty {item.quantity} · {item.format}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-sans text-ink">${((item.priceCents * item.quantity) / 100).toFixed(2)}</span>
              <button
                onClick={() => removeItem(item.productId)}
                aria-label={`Remove ${item.title} from cart`}
                className="font-sans text-sm text-moss focus:outline-none focus:ring-2 focus:ring-ink rounded p-2 -m-2"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-between font-sans font-semibold text-lg text-ink">
        <span>Total</span>
        <span>${(totalCents / 100).toFixed(2)}</span>
      </div>

      {!hasDigital && !loggedIn && (
        <div>
          <label htmlFor={emailId} className="block font-sans text-sm font-medium text-ink mb-1">
            Email (for order confirmation)
          </label>
          <input
            id={emailId}
            type="email"
            required
            className="w-full border border-moss/30 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
        </div>
      )}

      {/* Required for every order — including guest and digital-only
          purchases that never go through Stripe's shipping-address
          collection — since data-protection handling depends on the
          buyer's country regardless of what they bought. See PRIVACY.md. */}
      <div>
        <label htmlFor={countryId} className="block font-sans text-sm font-medium text-ink mb-1">
          Country <span aria-hidden="true" className="text-ember">*</span>
          <span className="sr-only"> (required)</span>
        </label>
        <select
          id={countryId}
          required
          className="w-full border border-moss/30 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-ink"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="" disabled>
            Select your country
          </option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="font-sans text-xs text-moss mt-1">
          Used to apply the right data-protection rules for your region.
        </p>
      </div>

      {/* Errors announced immediately to screen readers, since the message
          otherwise appears silently between a click and a failed redirect
          (WCAG 3.3.1 Error Identification, 4.1.3 Status Messages). */}
      {error && (
        <p role="alert" className="font-sans text-ember text-sm">
          {error}
        </p>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading || !canSubmit}
        className="font-sans font-semibold w-full bg-ink text-parchment rounded-lg p-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
      >
        {loading ? "Redirecting..." : "Proceed to payment"}
      </button>
    </div>
  );
}
