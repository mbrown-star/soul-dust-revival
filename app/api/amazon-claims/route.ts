import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { amazonClaimSchema } from "@/lib/validation/schemas";
import { claimDigitalEdition } from "@/lib/commerce/amazonClaims";

/**
 * /claim's form: a signed-in reader unlocks the digital edition of a printed
 * copy they bought on Amazon, by its order number. Signed in first, so the
 * email is one they've proven they own (the sign-in code), and nothing here
 * creates an account or sends email for an address someone typed.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = amazonClaimSchema.safeParse(json);
  if (!parsed.success) {
    const orderIssue = parsed.error.issues.find((issue) => issue.path[0] === "orderNumber");
    return NextResponse.json(
      { error: "invalid_input", message: orderIssue?.message ?? "Please choose a title and enter your order number." },
      { status: 400 }
    );
  }

  const db = await getDb();
  const result = await claimDigitalEdition(db, {
    userId: session.userId,
    productId: parsed.data.productId,
    orderNumber: parsed.data.orderNumber,
  });

  switch (result.status) {
    case "not_claimable":
      return NextResponse.json(
        { error: "not_claimable", message: "That title doesn't come with a digital edition to claim." },
        { status: 400 }
      );
    case "order_used":
      return NextResponse.json(
        {
          error: "order_used",
          message:
            "That order number has already been used to claim this title. If that wasn't you, please contact us and we'll sort it out.",
        },
        { status: 409 }
      );
    case "too_many":
      return NextResponse.json(
        {
          error: "too_many",
          message: "That's a lot of claims for one day. Please contact us and we'll unlock the rest for you.",
        },
        { status: 429 }
      );
    case "already_owned":
      return NextResponse.json({ status: "already_owned", productTitle: result.productTitle, ready: result.ready });
    case "claimed":
      revalidatePath("/library");
      return NextResponse.json({ status: "claimed", productTitle: result.productTitle, ready: result.ready });
  }
}
