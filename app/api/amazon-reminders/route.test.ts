import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { amazonReminders, blockedEmails, products, studies } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const { POST } = await import("./route");
const { REMINDER_LIMITS, reminderHash, requestAmazonReminder } = await import("@/lib/commerce/amazonReminders");

function request(body: unknown, ip = "203.0.113.7") {
  return new NextRequest("https://example.com/api/amazon-reminders", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "cf-connecting-ip": ip },
  });
}

describe("Amazon claim reminders", () => {
  let db: Db;
  let bookId: string;
  let otherBookId: string;
  let noStudyId: string;
  let noLinkId: string;
  const productIds: string[] = [];
  const blocked: string[] = [];

  async function product(values: Partial<typeof products.$inferInsert>, withStudy: boolean) {
    const [row] = await db
      .insert(products)
      .values({
        type: "book",
        format: "physical",
        title: "Printed Book",
        slug: `reminder-test-${randomUUID()}`,
        priceCents: 1899,
        sellOnStripe: false,
        sellOnAmazon: true,
        amazonUrl: "https://www.amazon.com/dp/TEST",
        ...values,
      })
      .returning();
    productIds.push(row!.id);
    if (withStudy) await db.insert(studies).values({ productId: row!.id, title: "A study", slug: `reminder-study-${randomUUID()}` });
    return row!.id;
  }

  beforeEach(async () => {
    db = await getDb();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
    productIds.length = 0;
    bookId = await product({ title: "Colossians" }, true);
    otherBookId = await product({ title: "Ephesians" }, true);
    noStudyId = await product({ title: "No Study" }, false);
    noLinkId = await product({ title: "No Link Yet", amazonUrl: null }, true);
  });

  afterEach(async () => {
    await db.delete(amazonReminders).where(inArray(amazonReminders.productId, productIds));
    await db.delete(studies).where(inArray(studies.productId, productIds));
    await db.delete(products).where(inArray(products.id, productIds));
    if (blocked.length) await db.delete(blockedEmails).where(inArray(blockedEmails.email, blocked));
    blocked.length = 0;
  });

  it("emails the claim link for a claimable title, and stores no email address or IP", async () => {
    const email = `buyer-${randomUUID()}@example.com`;
    const res = await POST(request({ productId: bookId, email: `  ${email.toUpperCase()} ` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0]![0] as { to: string; subject: string; html: string };
    expect(sent.to).toBe(email);
    expect(sent.subject).toBe("Your digital edition of Colossians");
    const [slugRow] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, bookId));
    expect(sent.html).toContain(`/claim?product=${slugRow!.slug}`);

    const rows = await db.select().from(amazonReminders).where(eq(amazonReminders.productId, bookId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailHash).toBe(reminderHash("email", email));
    expect(rows[0]!.ipHash).toBe(reminderHash("ip", "203.0.113.7"));
    expect(JSON.stringify(rows)).not.toContain(email);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.7");
  });

  it("refuses a bad email and a title without a digital edition or a live Amazon link", async () => {
    expect((await POST(request({ productId: bookId, email: "not-an-email" }))).status).toBe(400);
    expect((await POST(request({ productId: bookId, email: "a@b.co", extra: 1 }))).status).toBe(400);
    expect((await POST(request({ productId: noStudyId, email: "a@b.co" }))).status).toBe(400);
    expect((await POST(request({ productId: noLinkId, email: "a@b.co" }))).status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends a title once a day per address, and at most a few a day, without saying so", async () => {
    const email = `buyer-${randomUUID()}@example.com`;
    expect((await POST(request({ productId: bookId, email }))).status).toBe(200);
    const again = await POST(request({ productId: bookId, email }));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ status: "ok" });
    expect(sendMock).toHaveBeenCalledTimes(1);

    // Other titles, up to the daily cap for the address.
    const extra = await Promise.all(
      Array.from({ length: REMINDER_LIMITS.perEmail }, (_, i) => product({ title: `Title ${i}` }, true))
    );
    for (const id of [otherBookId, ...extra]) await POST(request({ productId: id, email }));
    expect(sendMock).toHaveBeenCalledTimes(REMINDER_LIMITS.perEmail);
  });

  it("tells one visitor to wait after too many requests in an hour", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < REMINDER_LIMITS.perIpHour; i++) {
      expect((await POST(request({ productId: bookId, email: `b${i}-${randomUUID()}@example.com` }, ip))).status).toBe(200);
    }
    const res = await POST(request({ productId: bookId, email: `late-${randomUUID()}@example.com` }, ip));
    expect(res.status).toBe(429);
    expect(sendMock).toHaveBeenCalledTimes(REMINDER_LIMITS.perIpHour);
  });

  it("sends nothing to a blocked address, and answers the same", async () => {
    const email = `blocked-${randomUUID()}@example.com`;
    blocked.push(email);
    await db.insert(blockedEmails).values({ email });
    const res = await POST(request({ productId: bookId, email }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("lets a failed send be retried: it isn't counted", async () => {
    const email = `buyer-${randomUUID()}@example.com`;
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect((await POST(request({ productId: bookId, email }))).status).toBe(502);
    expect(await db.select().from(amazonReminders).where(eq(amazonReminders.productId, bookId))).toHaveLength(0);
    expect((await POST(request({ productId: bookId, email }))).status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("deletes requests older than a week as new ones arrive", async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await db.insert(amazonReminders).values({ emailHash: "x", ipHash: "y", productId: bookId, createdAt: old });
    await requestAmazonReminder(db, { productId: otherBookId, email: `buyer-${randomUUID()}@example.com`, ip: "192.0.2.1" });
    expect(await db.select().from(amazonReminders).where(eq(amazonReminders.productId, bookId))).toHaveLength(0);
  });
});
