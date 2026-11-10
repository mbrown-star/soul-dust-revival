import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type OrderConfirmationParams = {
  to: string;
  orderId: string;
  composition: "physical_only" | "digital_only" | "mixed";
  hasWebAppAccess: boolean;
  totalCents: number;
  items: { title: string; priceCents: number }[];
  appUrl: string; // origin of the app, for the login link
};

/**
 * Sends the order confirmation email via Resend, with content tailored to
 * the order's composition:
 * - physical_only: order + shipping summary, no login prompt
 * - digital_only / mixed: order summary + a link to log in and access content
 */
export async function sendOrderConfirmationEmail(params: OrderConfirmationParams) {
  if (!params.to) return; // no email to send to (shouldn't happen, but don't crash)

  const itemsHtml = params.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0;">${escapeHtml(item.title)}</td><td style="padding:4px 0;text-align:right;">$${(item.priceCents / 100).toFixed(2)}</td></tr>`
    )
    .join("");

  const loginSection = params.hasWebAppAccess
    ? `<p style="margin-top:24px;">
         <a href="${params.appUrl}/login?next=/library" style="background:#171717;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
           Log in to access your content
         </a>
       </p>`
    : "";

  const shippingNote =
    params.composition !== "digital_only"
      ? `<p style="color:#666;font-size:14px;">Shipping details are on your order confirmation page.</p>`
      : "";

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
      <h2>Thank you for your order</h2>
      <p style="color:#666;">Order #${params.orderId.slice(0, 8)}</p>
      <table style="width:100%;border-top:1px solid #eee;border-bottom:1px solid #eee;margin:16px 0;">
        ${itemsHtml}
        <tr><td style="padding-top:8px;font-weight:600;">Total</td><td style="padding-top:8px;font-weight:600;text-align:right;">$${(params.totalCents / 100).toFixed(2)}</td></tr>
      </table>
      ${shippingNote}
      ${loginSection}
    </div>
  `;

  await resend.emails.send({
    from: `Soul Dust Revival <${process.env.RESEND_FROM_EMAIL}>`,
    to: params.to,
    subject: "Your order confirmation",
    html,
  });
}

/**
 * Tells someone an admin just created an account for them. Deliberately has
 * no sign-in link or token in it: sign-in is code-only (a clickable sign-in
 * link gets consumed by mail security scanners before the person clicks),
 * so this just points them at the login page, where they request a code
 * like everyone else.
 */
export async function sendAccountCreatedEmail(params: { to: string; loginUrl: string }) {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
      <h2>You've been added to Soul Dust Revival</h2>
      <p style="color:#666;">An account has been created for ${escapeHtml(params.to)}.</p>
      <p style="color:#666;">To sign in, go to the login page and enter this email address. We'll email you a code to type in -- there's no password to set.</p>
      <p style="margin-top:24px;">
        <a href="${params.loginUrl}" style="background:#1a120c;color:#fefdfa;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
          Go to the login page
        </a>
      </p>
    </div>
  `;

  await resend.emails.send({
    from: `Soul Dust Revival <${process.env.RESEND_FROM_EMAIL}>`,
    to: params.to,
    subject: "Your Soul Dust Revival account is ready",
    html,
  });
}

const FOUNDER_EMAIL = "brad.bird@souldustrevival.com";

type BundleShipmentNotificationParams = {
  orderId: string;
  customerEmail: string;
  shippingName: string | null;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  bundles: { title: string; quantity: number }[];
};

/**
 * A physical bundle has no automated fulfillment pipeline behind it (it's
 * always Stripe-only, never Amazon -- see app/api/admin/bundles/route.ts),
 * so a human has to pack and ship it. This is that human's only signal that
 * one was just bought, sent straight to the founder rather than left to be
 * noticed in the admin Reports area.
 */
export async function sendBundleShipmentNotificationEmail(params: BundleShipmentNotificationParams) {
  const bundlesHtml = params.bundles
    .map((b) => `<li>${escapeHtml(b.title)}${b.quantity > 1 ? ` × ${b.quantity}` : ""}</li>`)
    .join("");

  const addressLines = [
    params.shippingName,
    params.shippingLine1,
    params.shippingLine2,
    [params.shippingCity, params.shippingState, params.shippingPostalCode].filter(Boolean).join(", "),
    params.shippingCountry,
  ].filter((line): line is string => Boolean(line));

  const addressHtml = addressLines.length
    ? addressLines.map((line) => escapeHtml(line)).join("<br/>")
    : "<em>No shipping address on file for this order.</em>";

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
      <h2>A bundle order needs to ship</h2>
      <p style="color:#666;">Order #${params.orderId.slice(0, 8)} · ${escapeHtml(params.customerEmail)}</p>
      <ul>${bundlesHtml}</ul>
      <p style="font-weight:600;">Ship to:</p>
      <p>${addressHtml}</p>
    </div>
  `;

  await resend.emails.send({
    from: `Soul Dust Revival <${process.env.RESEND_FROM_EMAIL}>`,
    to: FOUNDER_EMAIL,
    subject: `Bundle purchase to ship — order #${params.orderId.slice(0, 8)}`,
    html,
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
