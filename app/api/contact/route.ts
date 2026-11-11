import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { contactMessageSchema } from "@/lib/validation/schemas";
import { detectScreenshotType, screenshotLimitsMessage } from "@/lib/contact/screenshots";
import { CONTACT_SCREENSHOTS_TOTAL_MAX_BYTES, formatMegabytes } from "@/lib/uploads/limits";
import { sendContactMessageEmail } from "@/lib/email/send";

// Room for the largest allowed set of screenshots plus the text fields and
// multipart framing. A larger body is refused before it's read.
const MAX_BODY_BYTES = CONTACT_SCREENSHOTS_TOTAL_MAX_BYTES + 1024 * 1024;

/**
 * The Contact page's form: name, email, message and up to a few screenshots,
 * emailed to CONTACT_INBOX (lib/email/send.ts). Signed-in readers only, which
 * is who the page is linked for, and which keeps anonymous spam (and
 * anonymous 20 MB uploads) off an endpoint that sends email.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: `Screenshots can total up to ${formatMegabytes(CONTACT_SCREENSHOTS_TOTAL_MAX_BYTES)}.` },
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_input", message: "We couldn't read that form." }, { status: 400 });
  }

  const textField = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };
  const parsed = contactMessageSchema.safeParse({
    name: textField("name"),
    email: textField("email"),
    message: textField("message"),
    page: textField("page"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the form.";
    return NextResponse.json({ error: "invalid_input", message }, { status: 400 });
  }

  const files = form.getAll("screenshots");
  if (files.some((f) => typeof f === "string")) {
    return NextResponse.json({ error: "invalid_input", message: "Screenshots must be files." }, { status: 400 });
  }
  const screenshotFiles = files as File[];
  const limitsMessage = screenshotLimitsMessage(screenshotFiles);
  if (limitsMessage) return NextResponse.json({ error: "invalid_screenshots", message: limitsMessage }, { status: 400 });

  // Attachment names are ours (screenshot-1.png, ...), from the bytes' real
  // type: the sender's filename and Content-Type aren't trusted.
  const screenshots: { filename: string; content: string }[] = [];
  for (const [i, file] of screenshotFiles.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectScreenshotType(bytes);
    if (!type) {
      return NextResponse.json(
        { error: "invalid_screenshots", message: "Screenshots must be PNG, JPEG, WebP or GIF images." },
        { status: 400 }
      );
    }
    screenshots.push({
      filename: `screenshot-${i + 1}.${type === "jpeg" ? "jpg" : type}`,
      content: Buffer.from(bytes).toString("base64"),
    });
  }

  try {
    await sendContactMessageEmail({
      ...parsed.data,
      pageUrl: parsed.data.page ?? null,
      accountEmail: session.email,
      screenshots,
    });
  } catch (err) {
    // Logged without the message itself or the person's details.
    console.error("contact email failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json(
      { error: "send_failed", message: "Your message didn't send. Please try again in a few minutes." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
