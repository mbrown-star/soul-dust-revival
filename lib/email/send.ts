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
         <a href="${params.appUrl}/login?next=/studies" style="background:#171717;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
