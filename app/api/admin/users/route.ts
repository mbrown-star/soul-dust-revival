import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { adminUserCreateSchema, adminUserUpdateSchema, roleUpdateSchema } from "@/lib/validation/schemas";
import { listUsersForAdmin } from "@/lib/admin/listUsers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allUsers = await listUsersForAdmin();

  return NextResponse.json(allUsers);
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = adminUserCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { email, role, fullName, country } = parsed.data;

  // This app only supports magic-link auth, so there's no password to set
  // here — inviteUserByEmail creates the Supabase Auth account and emails
  // the new user a sign-in link. Our own users.id always mirrors the
  // Supabase auth UID (see app/auth/callback/route.ts), so this is also
  // where that id is minted.
  const serviceClient = createSupabaseServiceRoleClient();
  const { data, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${req.nextUrl.origin}/auth/callback`,
  });
  if (inviteError || !data.user) {
    // Supabase returns a 422/"already registered" for a duplicate email;
    // surface that as a clean conflict rather than a generic 500.
    const status = inviteError?.status === 422 ? 409 : 500;
    return NextResponse.json(
      { error: "invite_failed", message: inviteError?.message ?? "Could not invite that user." },
      { status }
    );
  }

  try {
    const [created] = await db
      .insert(users)
      .values({ id: data.user.id, email, role, fullName: fullName ?? null, country: country ?? null })
      .returning();
    if (!created) throw new Error("insert returned no row");

    return NextResponse.json(created, { status: 201 });
  } catch {
    // Roll back the just-created auth account rather than leave an
    // orphaned login with no corresponding app-side row — e.g. a race
    // where users.email's unique constraint trips on the insert.
    await serviceClient.auth.admin.deleteUser(data.user.id);
    return NextResponse.json(
      { error: "create_failed", message: "Could not create that user." },
      { status: 409 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = adminUserUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { userId, email, fullName, country } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Keep Supabase Auth's email in sync with our own table — otherwise the
  // user's magic-link sign-in keeps going to their old address while the
  // admin UI shows the new one.
  if (email !== undefined && email !== existing.email) {
    const serviceClient = createSupabaseServiceRoleClient();
    const { error } = await serviceClient.auth.admin.updateUserById(userId, { email });
    if (error) {
      const status = error.status === 422 ? 409 : 500;
      return NextResponse.json({ error: "email_update_failed", message: error.message }, { status });
    }
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (email !== undefined) updates.email = email;
  if (fullName !== undefined) updates.fullName = fullName;
  if (country !== undefined) updates.country = country;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_fields", message: "Nothing to update." }, { status: 400 });
  }

  try {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json(updated);
  } catch {
    // users.email is unique — this is the db-side check for a race with
    // another concurrent edit, on top of the Supabase Auth check above.
    return NextResponse.json({ error: "email_taken", message: "That email is already in use." }, { status: 409 });
  }
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
