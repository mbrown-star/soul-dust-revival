import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above this file's imports, so the mock factory can't
// close over a plain top-level const -- vi.hoisted lifts this alongside it.
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: "email-id" }, error: null }),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendOrderConfirmationEmail } from "./send";

describe("sendOrderConfirmationEmail", () => {
  const originalFrom = process.env.RESEND_FROM_EMAIL;

  beforeEach(() => {
    process.env.RESEND_FROM_EMAIL = "orders@souldustrevival.com";
    sendMock.mockClear();
  });

  afterEach(() => {
    process.env.RESEND_FROM_EMAIL = originalFrom;
  });

  const baseParams = {
    to: "buyer@example.com",
    orderId: "12345678-abcd-1234-abcd-123456789012",
    totalCents: 2900,
    items: [{ title: "Study One", priceCents: 2900 }],
    appUrl: "https://souldustrevival.com",
  };
  const digitalParams = { ...baseParams, composition: "digital_only" as const, hasWebAppAccess: true };

  it("sends with the display name wrapped around the env address", async () => {
    await sendOrderConfirmationEmail(digitalParams);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Soul Dust Revival <orders@souldustrevival.com>" })
    );
  });

  it("does not send when there is no recipient", async () => {
    await sendOrderConfirmationEmail({ ...digitalParams, to: "" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("includes a login link for digital/mixed orders with web app access", async () => {
    await sendOrderConfirmationEmail(digitalParams);
    const html = sendMock.mock.calls[0]![0].html as string;
    expect(html).toContain("/login?next=/studies");
  });

  it("omits the login link when there is no web app access", async () => {
    await sendOrderConfirmationEmail({
      ...baseParams,
      composition: "physical_only",
      hasWebAppAccess: false,
    });
    const html = sendMock.mock.calls[0]![0].html as string;
    expect(html).not.toContain("/login?next=/studies");
  });

  it("shows the shipping note for physical and mixed orders, not digital-only", async () => {
    await sendOrderConfirmationEmail({ ...baseParams, composition: "physical_only", hasWebAppAccess: false });
    expect(sendMock.mock.calls[0]![0].html).toContain("Shipping details");

    sendMock.mockClear();
    await sendOrderConfirmationEmail(digitalParams);
    expect(sendMock.mock.calls[0]![0].html).not.toContain("Shipping details");
  });

  it("escapes HTML in item titles to prevent stored-content XSS in the email body", async () => {
    await sendOrderConfirmationEmail({
      ...digitalParams,
      items: [{ title: `<script>alert('xss')</script>`, priceCents: 100 }],
    });
    const html = sendMock.mock.calls[0]![0].html as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("formats cent amounts as dollars", async () => {
    await sendOrderConfirmationEmail({
      ...digitalParams,
      totalCents: 123456,
      items: [{ title: "Item", priceCents: 123456 }],
    });
    const html = sendMock.mock.calls[0]![0].html as string;
    expect(html).toContain("$1234.56");
  });

  it("truncates the displayed order id to its first 8 characters", async () => {
    await sendOrderConfirmationEmail(digitalParams);
    const html = sendMock.mock.calls[0]![0].html as string;
    expect(html).toContain(`Order #${baseParams.orderId.slice(0, 8)}`);
    expect(html).not.toContain(baseParams.orderId);
  });
});
