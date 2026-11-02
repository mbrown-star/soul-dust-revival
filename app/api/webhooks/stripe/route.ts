import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { handleCheckoutCompleted } from "@/lib/stripe/webhook-handlers";
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
    event = stripe.webhooks.constructEvent(
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
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, req.nextUrl.origin);
      break;
    // Add more cases as needed: invoice.paid, charge.refunded, etc.
  }

  return NextResponse.json({ received: true });
}
