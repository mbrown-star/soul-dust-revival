import { NextRequest, NextResponse } from "next/server";
import { isValidCronRequest } from "@/lib/social/cronAuth";
import { getDb } from "@/lib/db/client";
import { socialPostTargets, socialPostMetrics } from "@/lib/db/schema";
import { eq, isNotNull, and } from "drizzle-orm";
import { fetchMetrics } from "@/lib/social/metrics";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDb();
  const published = await db
    .select()
    .from(socialPostTargets)
    .where(and(eq(socialPostTargets.status, "published"), isNotNull(socialPostTargets.externalPostId)));

  let succeeded = 0;
  let failed = 0;

  for (const target of published) {
    if (!target.externalPostId) continue;
    try {
      const metrics = await fetchMetrics(target.platform, target.externalPostId);
      await db.insert(socialPostMetrics).values({ targetId: target.id, ...metrics });
      succeeded += 1;
    } catch {
      // A single platform's metrics endpoint being down/rate-limited
      // shouldn't stop the rest of the batch from being fetched.
      failed += 1;
    }
  }

  return NextResponse.json({ succeeded, failed });
}
