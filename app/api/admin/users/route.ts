import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  adminUserCreateSchema,
  adminUserDeleteSchema,
  adminUserUpdateSchema,
  roleUpdateSchema,
} from "@/lib/validation/schemas";
import { blockEmail, isEmailBlocked } from "@/lib/auth/blockedEmails";
import { deleteAccount } from "@/lib/account/deleteAccount";
import { listUsersForAdmin } from "@/lib/admin/listUsers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { sendAccountCreatedEmail } from "@/lib/email/send";
import { appOrigin } from "@/lib/domains";

const BLOCKED_EMAIL_RESPONSE = {
  error: "email_blocked",
  message: "That email is blocked. Unblock it under Blocked emails first.",
};

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

  if (await isEmailBlocked(email)) return NextResponse.json(BLOCKED_EMAIL_RESPONSE, { status: 409 });

  // Sign-in is code-only (AuthForm + verifyOtp), so there's no password to
  // set and no invite link to send. createUser makes the Supabase Auth
  // account already confirmed, and the new user signs in at /login with an
  // emailed code. (inviteUserByEmail was used before; its emailed link
  // needed a link-handling sign-in path that no longer exists.) Our own
  // users.id always mirrors the Supabase auth UID (see lib/auth/recordLogin.ts),
  // so this is also where that id is minted.
  const serviceClient = createSupabaseServiceRoleClient();
  const { data, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError || !data.user) {
    // Supabase returns a 422 ("email_exists") for a duplicate email; surface
    // that as a clean conflict rather than a generic 500.
    const status = createError?.status === 422 ? 409 : 500;
    return NextResponse.json(
      { error: "create_failed", message: createError?.message ?? "Could not create that user." },
      { status }
    );
  }

  let created: typeof users.$inferSelect;
  try {
    const db = await getDb();
    const [row] = await db
      .insert(users)
      .values({ id: data.user.id, email, role, fullName: fullName ?? null, country: country ?? null })
      .returning();
    if (!row) throw new Error("insert returned no row");
    created = row;
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

  // The account exists either way; a mail failure shouldn't undo it. Report
  // it so the admin knows to tell the person themselves.
  let welcomeEmailSent = true;
  try {
    await sendAccountCreatedEmail({
      to: email,
      loginUrl: `${appOrigin() ?? req.nextUrl.origin}/login`,
    });
  } catch (err) {
    welcomeEmailSent = false;
    console.error("Account-created email failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ...created, welcomeEmailSent }, { status: 201 });
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
  const db = await getDb();

  const existing = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (email !== undefined && email.toLowerCase() !== existing.email.toLowerCase() && (await isEmailBlocked(email))) {
    return NextResponse.json(BLOCKED_EMAIL_RESPONSE, { status: 409 });
  }

  // Keep Supabase Auth's email in sync with our own table — otherwise the
  // user's sign-in code keeps going to their old address while the
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

  const db = await getDb();
  const [updated] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning();
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(updated);
}

/**
 * Deletes another user's account (lib/account/deleteAccount.ts), and with
 * `block` also blocks their email from signing in or signing up again.
 */
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = adminUserDeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { userId, block, reason } = parsed.data;

  if (userId === session.userId) {
    return NextResponse.json(
      { error: "cannot_delete_self", message: "Delete your own account from your Account page." },
      { status: 400 }
    );
  }

  const db = await getDb();
  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // One click shouldn't be able to remove another admin; demoting first is a
  // deliberate second step (and the role change is its own audit point).
  if (target.role === "admin") {
    return NextResponse.json(
      { error: "cannot_delete_admin", message: "Change their role from Admin first, then delete them." },
      { status: 400 }
    );
  }

  const result = await deleteAccount(userId);

  // After the delete, not before: blocking an email whose account still
  // exists bans that account, and deleting it would then free the email.
  // Blocking a deleted email holds the ban on a fresh placeholder instead.
  let blocked = null;
  let authWarning = result.authDeleted ? null : "Their data was removed, but deleting their sign-in account failed.";
  if (block) {
    const blockResult = await blockEmail({ email: target.email, reason, blockedByUserId: session.userId });
    blocked = { ...blockResult.row, createdAt: blockResult.row.createdAt?.toISOString() ?? null };
    if (blockResult.authWarning) {
      authWarning = `The email is blocked here, but the sign-in ban failed: ${blockResult.authWarning}`;
    }
  }

  return NextResponse.json({ ok: true, usersRow: result.usersRow, blocked, authWarning });
}
