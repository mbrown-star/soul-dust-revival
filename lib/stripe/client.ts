import Stripe from "stripe";

// Cloudflare Workers has no Node `https` module, which the Stripe SDK uses
// by default -- without an explicit fetch-based HTTP client, every Stripe
// API call hangs indefinitely on the deployed Worker (no error, no log
// line) instead of throwing, since the underlying request mechanism never
// resolves. Confirmed live: checkout hung forever on "Redirecting..." for
// both a digital and a guest/physical purchase, reproduced the same way on
// a fresh Foundations companion-book guest checkout.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});
