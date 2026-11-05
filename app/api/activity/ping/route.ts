import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { loginEvents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Called periodically by ActivityHeartbeat while an authenticated user has
 * a page open. Updates the most recent login_events row's lastActiveAt,
 * which is what the admin engagement report uses to approximate session
 * duration (lastActiveAt - loginAt). See the report page for the honest
 * caveat on how approximate this is — there's no persistent connection
 * (no websocket) telling us the exact moment someone closes a tab.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();

  const mostRecent = await db.query.loginEvents.findFirst({
    where: eq(loginEvents.userId, session.userId),
    orderBy: desc(loginEvents.loginAt),
  });

  if (mostRecent) {
    await db
      .update(loginEvents)
      .set({ lastActiveAt: new Date() })
      .where(eq(loginEvents.id, mostRecent.id));
  }

  return NextResponse.json({ ok: true });
}
