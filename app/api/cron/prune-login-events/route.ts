import { NextRequest, NextResponse } from "next/server";
import { isValidCronRequest } from "@/lib/social/cronAuth";
import { db } from "@/lib/db/client";
import { loginEvents } from "@/lib/db/schema";
import { lt } from "drizzle-orm";

export const runtime = "nodejs";

// Retention window for login_events (timestamp + user agent per login — see
// PRIVACY.md). 13 months: covers a full year of year-over-year engagement
// reporting (admin/reports/engagement) plus a one-month buffer, while still
// giving indefinite retention a real ceiling, which GDPR Art. 5's
// data-minimization principle expects. Adjust here if the retention policy
// changes -- this is the only place the window is defined.
const RETENTION_MONTHS = 13;

export async function POST(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  const deleted = await db.delete(loginEvents).where(lt(loginEvents.loginAt, cutoff)).returning({ id: loginEvents.id });

  return NextResponse.json({ deleted: deleted.length, cutoff: cutoff.toISOString() });
}
