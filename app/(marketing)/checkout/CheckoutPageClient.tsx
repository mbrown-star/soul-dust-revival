"use client";

import { useState, useId } from "react";
import { useCart, lineKey } from "@/lib/cart/CartContext";
import { COUNTRIES } from "@/lib/data/countries";
import Link from "next/link";

// `loggedIn` is passed in from the server (see page.tsx's getSession() call)
// rather than re-checked here with the browser Supabase client's own
// getUser(). Checking it independently client-side caused real, reproducible
// false negatives: the nav bar's server-verified session would say logged
// in, while this page's separate client-side getUser() call moments later
// said logged out -- most plausibly because Supabase rotates refresh tokens
// on each use, and proxy.ts's middleware already refreshes the session for
// this same request, so the client's own refresh attempt right after can
// find the prior refresh token already consumed. Trusting the single
// server-verified value removes the race entirely, matching how /account
// already does this (see AccountPageClient.tsx).
export default function CheckoutPageClient({ initialLoggedIn }: { initialLoggedIn: boolean }) {
  const { items, totalCents, hasDigital, removeItem } = useCart();
  const [country, setCountry] = useState("");
  const loggedIn = initialLoggedIn;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countryId = useId();

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, variant: i.variant })),
        country,
      }),
    });

    const data = (await res.json()) as { message?: string; url?: string };

    if (!res.ok) {
      setError(data.message ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    window.location.href = data.url!;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 sm:py-20 text-center">
        <h1 className="font-display font-bold text-2xl text-ink mb-2">Checkout</h1>
        <p className="font-serif text-ink">Your cart is empty.</p>
      </div>
    );
  }

  // Every order needs an account before proceeding: digital content unlocks
  // in the app, and so does a printed book's digital edition.
  if (!loggedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 sm:py-20 text-center space-y-4">
        <h1 className="font-display font-bold text-2xl text-ink">Checkout</h1>
        <p className="font-serif text-ink">
          {hasDigital
            ? "Your cart includes digital content, which requires an account."
            : "Your book comes with its digital edition in the Soul Dust Revival app, so we'll set up your account first. It only takes your email."}
        </p>
        {/* Two distinct actions rather than one ambiguous "sign in or sign up"
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
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    );
  }

  const canSubmit = !!country;

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-16 space-y-6">
      <h1 className="font-display font-bold text-2xl text-ink">Checkout</h1>

      <ul className="space-y-3" aria-label="Cart items">
        {items.map((item) => (
          <li key={lineKey(item.productId, item.variant)} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-moss/20 pb-3">
            <div>
              <p className="font-sans font-medium text-ink">{item.title}</p>
              <p className="font-sans text-sm text-moss">
                Qty {item.quantity} · {item.format}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-sans text-ink">${((item.priceCents * item.quantity) / 100).toFixed(2)}</span>
              <button
                onClick={() => removeItem(item.productId, item.variant)}
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

      {/* Required for every order — including digital-only
          purchases that never go through Stripe's shipping-address
          collection — since data-protection handling depends on the
          buyer's country regardless of what they bought. See PRIVACY.md. */}
      <div>
        <label htmlFor={countryId} className="block font-sans text-sm font-medium text-ink mb-1">
          Country <span aria-hidden="true" className="text-error">*</span>
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
        <p role="alert" className="font-sans text-error text-sm">
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
