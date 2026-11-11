import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { blockedEmailCreateSchema, blockedEmailDeleteSchema } from "@/lib/validation/schemas";
import {
  blockEmail,
  findUserByEmail,
  listBlockedEmails,
  normalizeEmail,
  unblockEmail,
  type BlockedEmailRow,
} from "@/lib/auth/blockedEmails";

/**
 * Emails that can't be used to sign in or sign up. Blocking an email that
 * belongs to an existing account keeps that account's data and bans it;
 * to remove the account too, use Delete on /admin/users. See
 * lib/auth/blockedEmails.ts for how a block is enforced.
 */

function serialize(row: BlockedEmailRow) {
  return { ...row, createdAt: row.createdAt?.toISOString() ?? null };
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await listBlockedEmails();
  return NextResponse.json(rows.map(serialize));
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = blockedEmailCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { email, reason } = parsed.data;

  if (normalizeEmail(email) === normalizeEmail(session.email)) {
    return NextResponse.json({ error: "cannot_block_self", message: "You can't block your own email." }, { status: 400 });
  }
  const owner = await findUserByEmail(email);
  if (owner?.role === "admin") {
    return NextResponse.json(
      { error: "cannot_block_admin", message: "That email belongs to an admin. Change their role first." },
      { status: 400 }
    );
  }

  const result = await blockEmail({ email, reason, blockedByUserId: session.userId });
  return NextResponse.json(
    {
      ...serialize(result.row),
      alreadyBlocked: result.alreadyBlocked,
      authWarning: result.authWarning
        ? `Blocked here, but the sign-in ban failed: ${result.authWarning}`
        : null,
    },
    { status: result.alreadyBlocked ? 200 : 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = blockedEmailDeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await unblockEmail(parsed.data.id);
  if (!result.ok) {
    return NextResponse.json({ error: "unblock_failed", message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
