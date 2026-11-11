import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { deleteAccount } from "@/lib/account/deleteAccount";

/**
 * Fulfills a GDPR Art. 17 / CCPA deletion request for the calling user's
 * own account. This is a genuinely destructive, irreversible action —
 * the client is expected to have already confirmed intent before calling this.
 *
 * Design choice, documented in PRIVACY.md: orders are NOT deleted. Financial
 * records often have their own legal retention requirements independent of
 * a deletion request, which is a real legal question this code can't
 * resolve on its own — so orders are kept, and an account with orders is
 * anonymized rather than removed, since removing it would break the users.id
 * foreign key those rows depend on. See lib/account/deleteAccount.ts.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Don't let the only admin delete themselves — that would lock the whole
  // admin section with no one left able to restore access. Same guard
  // rationale as the "can't change your own role" rule in /admin/users.
  if (user.role === "admin") {
    const otherAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, session.userId)));

    if (otherAdmins.length === 0) {
      return NextResponse.json(
        {
          error: "last_admin",
          message: "You're the only admin. Promote another admin before deleting this account.",
        },
        { status: 400 }
      );
    }
  }

  const { authDeleted } = await deleteAccount(session.userId);
  if (!authDeleted) {
    // The DB side is already cleared at this point — surface the auth
    // deletion failure clearly rather than claiming full success.
    return NextResponse.json(
      { error: "auth_deletion_failed", message: "Your data was cleared, but removing login access failed — contact support." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
