import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { roleUpdateSchema } from "@/lib/validation/schemas";
import { listUsersForAdmin } from "@/lib/admin/listUsers";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allUsers = await listUsersForAdmin();

  return NextResponse.json(allUsers);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = roleUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { userId, role } = parsed.data;

  // An admin can't change their own role through this UI — prevents the
  // easy-to-make mistake of accidentally demoting yourself and losing
  // access to the admin section with no one else able to restore it. If a
  // role genuinely needs to change for the account you're logged in as,
  // have a different admin do it, or update it directly in the database.
  if (userId === session.userId) {
    return NextResponse.json(
      { error: "cannot_change_own_role", message: "Ask another admin to change your own role." },
      { status: 400 }
    );
  }

  const [updated] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning();
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(updated);
}
