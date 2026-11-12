import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { amazonReminderSchema } from "@/lib/validation/schemas";
import { forgetReminder, requestAmazonReminder } from "@/lib/commerce/amazonReminders";
import { sendAmazonClaimReminderEmail } from "@/lib/email/send";
import { marketingUrl } from "@/lib/domains";

/**
 * The Buy on Amazon modal: emails the visitor the link to claim the
 * digital edition once their Amazon order arrives. No sign-in needed (they
 * may not have an account yet), so lib/commerce/amazonReminders.ts limits
 * what one address or visitor can trigger, and the response never says
 * whether an email actually went: "ok" covers sent, already sent today,
 * and blocked.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = amazonReminderSchema.safeParse(json);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.find((issue) => issue.path[0] === "email");
    return NextResponse.json(
      { error: "invalid_input", message: emailIssue?.message ?? "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const db = await getDb();
  const result = await requestAmazonReminder(db, { ...parsed.data, ip });

  if (result.status === "not_claimable") {
    return NextResponse.json({ error: "not_claimable", message: "That title doesn't come with a digital edition." }, { status: 400 });
  }
  if (result.status === "too_many_from_ip") {
    return NextResponse.json(
      { error: "too_many", message: "That's a lot of requests. Please try again in an hour." },
      { status: 429 }
    );
  }
  if (result.status === "send") {
    const path = `/claim?product=${encodeURIComponent(result.product.slug)}`;
    const claimUrl = marketingUrl(path).startsWith("http") ? marketingUrl(path) : new URL(path, req.nextUrl.origin).toString();
    try {
      await sendAmazonClaimReminderEmail({ to: result.email, productTitle: result.product.title, claimUrl });
    } catch (err) {
      if (result.reminderId) await forgetReminder(db, result.reminderId);
      console.error("amazon reminder email failed", err instanceof Error ? err.message : "unknown");
      return NextResponse.json(
        { error: "send_failed", message: "We couldn't send the email just now. The claim page is souldustrevival.com/claim." },
        { status: 502 }
      );
    }
  }
  return NextResponse.json({ status: "ok" });
}
