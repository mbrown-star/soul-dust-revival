import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { socialPublishNowSchema } from "@/lib/validation/schemas";
import { claimAndPublish, type PublishOutcome } from "@/lib/social/publishClaimed";

/**
 * "Publish now": publishes the given targets immediately instead of waiting
 * for the next scheduled run. Admin only. Each target is claimed atomically,
 * so a click that races the cron (or a second click) can't post twice; a
 * target that's already sending or published comes back as not available.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = socialPublishNowSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const results: PublishOutcome[] = [];
  for (const targetId of new Set(parsed.data.targetIds)) {
    const outcome = await claimAndPublish(targetId, "now");
    results.push(outcome ?? { targetId, ok: false, error: "This post is already sending or published." });
  }
  return NextResponse.json({ results });
}
