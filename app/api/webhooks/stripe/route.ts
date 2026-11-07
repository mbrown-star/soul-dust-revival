import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { handleCheckoutCompleted } from "@/lib/stripe/webhook-handlers";
import { appOrigin } from "@/lib/domains";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  // Explicit check rather than relying on Stripe's SDK to throw on a
  // null/missing header — functionally the try/catch below would have
  // caught that too, but an explicit guard is clearer about what's actually
  // being validated and doesn't depend on incidental SDK error behavior.
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // Cloudflare Workers has no Node `crypto` sync HMAC path the Stripe SDK's
    // webhook signature verification needs -- `constructEvent` throws
    // `CryptoProviderOnlySupportsAsyncError` there every time (its own
    // message literally says "Use `await constructEventAsync(...)` instead"),
    // which this try/catch was swallowing into a generic 400 "Invalid
    // signature" on every real webhook delivery. Confirmed live: a real test
    // purchase completed on Stripe's side, but the order stayed "pending"
    // forever and no entitlement was ever granted, since Stripe's webhook
    // call was rejected before `handleCheckoutCompleted` ever ran.
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    // Log the real reason signature verification failed — silently discarding
    // it makes a misconfigured STRIPE_WEBHOOK_SECRET or a genuine spoofing
    // attempt indistinguishable from each other in production.
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      // appOrigin() (the real app subdomain, once the marketing/app split --
      // lib/domains.ts -- is configured) rather than req.nextUrl.origin: the
      // webhook request's own origin is incidental (today, the .workers.dev
      // fallback used to dodge Cloudflare Access on the custom domain -- see
      // CLAUDE.md's 2026-11-10 entries), not where a customer should log in.
      // Falls back to req.nextUrl.origin, today's behavior, until the split
      // is configured.
      //
      // Trade-off, deliberate: once NEXT_PUBLIC_APP_HOSTNAME is set, this
      // always prefers it over the (proven-reachable) request origin, with
      // no fallback if it's set but not yet actually live or reachable (DNS
      // not propagated, Cloudflare Access still gating it, etc.) -- the
      // whole point of this fix is to stop depending on the webhook's
      // incidental origin, which the fallback would reintroduce. This is why
      // the deploy plan requires registering and verifying the app subdomain
      // is reachable with no Access gate *before* setting this env var, not
      // after -- see the plan's "Out of scope" section.
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
        appOrigin() ?? req.nextUrl.origin
      );
      break;
    // Add more cases as needed: invoice.paid, charge.refunded, etc.
  }

  return NextResponse.json({ received: true });
}
