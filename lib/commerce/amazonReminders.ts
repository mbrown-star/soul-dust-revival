import crypto from "crypto";
import { and, count, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { amazonReminders } from "@/lib/db/schema";
import { findClaimableProduct } from "@/lib/commerce/digitalEdition";
import { isEmailBlocked, normalizeEmail } from "@/lib/auth/blockedEmails";

/**
 * "Email me the claim link" from the Buy on Amazon modal. Amazon never tells
 * us who bought, so a buyer unlocks the digital edition on /claim with their
 * order number; this sends them that link before they go, so they can find
 * it when the order arrives.
 *
 * The address is typed, not proven, so the endpoint must not become a way to
 * make us email someone repeatedly: the message is fixed (nothing the
 * visitor typed appears in it), and these limits apply. Over a limit the
 * request still reports success, without sending, so it can't be used to
 * learn anything about an address.
 */
export const REMINDER_LIMITS = {
  /** The same title to the same address, per day. */
  perEmailAndProduct: 1,
  /** Any titles to the same address, per day. */
  perEmail: 3,
  /** Requests from one visitor (IP), per hour; over it they're told to wait. */
  perIpHour: 10,
};
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Rows are only needed for the daily limits; anything older is deleted. */
const KEEP_MS = 7 * DAY_MS;

/**
 * A keyed hash, so the table holds no email address or IP. Keyed with a
 * sub-key of TOKEN_ENCRYPTION_KEY (derived, not the encryption key itself),
 * so the hashes can't be reversed by guessing addresses without the key.
 */
export function reminderHash(kind: "email" | "ip", value: string): string {
  const b64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const subKey = crypto.createHmac("sha256", Buffer.from(b64, "base64")).update("amazon-reminders-v1").digest();
  return crypto.createHmac("sha256", subKey).update(`${kind}:${value}`).digest("hex");
}

export type ReminderResult =
  | { status: "send"; product: { id: string; slug: string; title: string }; email: string }
  | { status: "skip" }
  | { status: "not_claimable" }
  | { status: "too_many_from_ip" };

/**
 * Decides whether to send, and records the request when it will be sent.
 * The caller sends the email, and calls `forgetReminder` if sending fails
 * so a retry isn't counted against the limits.
 */
export async function requestAmazonReminder(
  db: Db,
  input: { productId: string; email: string; ip: string },
  now = new Date()
): Promise<ReminderResult & { reminderId?: string }> {
  const product = await findClaimableProduct(db, input.productId);
  if (!product) return { status: "not_claimable" };

  const email = normalizeEmail(input.email);
  const emailHash = reminderHash("email", email);
  const ipHash = reminderHash("ip", input.ip);
  const dayAgo = new Date(now.getTime() - DAY_MS);

  return db.transaction(async (tx) => {
    await tx.delete(amazonReminders).where(lt(amazonReminders.createdAt, new Date(now.getTime() - KEEP_MS)));

    const [fromIp] = await tx
      .select({ n: count() })
      .from(amazonReminders)
      .where(and(eq(amazonReminders.ipHash, ipHash), gte(amazonReminders.createdAt, new Date(now.getTime() - HOUR_MS))));
    if ((fromIp?.n ?? 0) >= REMINDER_LIMITS.perIpHour) return { status: "too_many_from_ip" as const };

    const [toEmail] = await tx
      .select({ n: count() })
      .from(amazonReminders)
      .where(and(eq(amazonReminders.emailHash, emailHash), gte(amazonReminders.createdAt, dayAgo)));
    const [toEmailForProduct] = await tx
      .select({ n: count() })
      .from(amazonReminders)
      .where(
        and(
          eq(amazonReminders.emailHash, emailHash),
          eq(amazonReminders.productId, product.id),
          gte(amazonReminders.createdAt, dayAgo)
        )
      );
    if ((toEmail?.n ?? 0) >= REMINDER_LIMITS.perEmail || (toEmailForProduct?.n ?? 0) >= REMINDER_LIMITS.perEmailAndProduct) {
      return { status: "skip" as const };
    }
    // A blocked address gets nothing, and the response doesn't say so.
    if (await isEmailBlocked(email)) return { status: "skip" as const };

    const [row] = await tx
      .insert(amazonReminders)
      .values({ emailHash, ipHash, productId: product.id, createdAt: now })
      .returning({ id: amazonReminders.id });
    return {
      status: "send" as const,
      product: { id: product.id, slug: product.slug, title: product.title },
      email,
      reminderId: row?.id,
    };
  });
}

/** Undo the record of a reminder whose email didn't go out. */
export async function forgetReminder(db: Db, reminderId: string): Promise<void> {
  await db.delete(amazonReminders).where(eq(amazonReminders.id, reminderId));
}
