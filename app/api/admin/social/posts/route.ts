import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { socialPosts, socialPostTargets } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { socialPostCreateSchema, socialPostTargetUpdateSchema } from "@/lib/validation/schemas";
import { PLATFORM_LIMITS } from "@/lib/data/socialPlatforms";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = socialPostCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  // Per-platform character limit — enforced here, not just shown live in
  // the composer, since the composer's live count is a UX aid, not the
  // actual gate. Any request that skipped/bypassed the UI still gets
  // checked against the platform's real limit before it's ever scheduled.
  for (const target of body.targets) {
    if (body.body.length > PLATFORM_LIMITS[target.platform]) {
      return NextResponse.json(
        {
          error: "over_character_limit",
          message: `Post is ${body.body.length} characters, over ${target.platform}'s ${PLATFORM_LIMITS[target.platform]}-character limit.`,
        },
        { status: 400 }
      );
    }
  }

  // Instagram's API has no text-only post type — this must be caught before
  // scheduling, not discovered as a failure at publish time days later.
  if (body.targets.some((t) => t.platform === "instagram") && !body.imageUrl) {
    return NextResponse.json(
      { error: "instagram_requires_image", message: "Instagram posts require an image." },
      { status: 400 }
    );
  }

  // At most one target per platform per post — scheduling the same post
  // twice to the same platform is almost certainly a mistake, not intent.
  const platformsRequested = body.targets.map((t) => t.platform);
  if (new Set(platformsRequested).size !== platformsRequested.length) {
    return NextResponse.json({ error: "duplicate_platform" }, { status: 400 });
  }

  for (const target of body.targets) {
    if (target.frequency === "weekly" && typeof target.dayOfWeek !== "number") {
      return NextResponse.json(
        { error: "day_of_week_required", message: "Weekly posts need a day of week." },
        { status: 400 }
      );
    }
  }

  const db = await getDb();
  const [post] = await db
    .insert(socialPosts)
    .values({
      body: body.body,
      imageUrl: body.imageUrl,
      imageAlt: body.imageAlt,
      sourceType: body.sourceType,
      aiPrompt: body.aiPrompt,
      createdByUserId: session.userId,
    })
    .returning();

  if (!post) return NextResponse.json({ error: "post_creation_failed" }, { status: 500 });

  await db.insert(socialPostTargets).values(
    body.targets.map((t) => {
      const parts = t.timeOfDay.split(":").map(Number);
      const hours = parts[0];
      const minutes = parts[1];
      // Already guaranteed by socialPostTargetInputSchema's HH:MM regex —
      // this check exists purely so TypeScript (correctly, under
      // noUncheckedIndexedAccess) doesn't have to just trust that.
      if (hours === undefined || minutes === undefined) {
        throw new Error(`Malformed timeOfDay: ${t.timeOfDay}`);
      }
      const firstRun = new Date(t.startDate);
      firstRun.setUTCHours(hours, minutes, 0, 0);

      return {
        postId: post.id,
        platform: t.platform,
        frequency: t.frequency,
        dayOfWeek: t.dayOfWeek ?? null,
        timeOfDay: t.timeOfDay,
        nextRunAt: firstRun,
        endDate: t.endDate ? new Date(t.endDate) : null,
        status: "scheduled" as const,
      };
    })
  );

  return NextResponse.json({ postId: post.id });
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = await getDb();

  const allPosts = await db.select().from(socialPosts).orderBy(desc(socialPosts.createdAt)).limit(100);

  // Scoped to just the posts this page displays, rather than the whole
  // targets table -- that table only grows as more posts/platforms get
  // scheduled, while this route always returns at most the 100 most recent posts.
  const postIds = allPosts.map((p) => p.id);
  const allTargets =
    postIds.length === 0 ? [] : await db.select().from(socialPostTargets).where(inArray(socialPostTargets.postId, postIds));

  const withTargets = allPosts.map((post) => ({
    ...post,
    targets: allTargets.filter((t) => t.postId === post.id),
  }));

  return NextResponse.json(withTargets);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = socialPostTargetUpdateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const [updated] = await db
    .update(socialPostTargets)
    .set({ status: parsed.data.status })
    .where(eq(socialPostTargets.id, parsed.data.id))
    .returning();

  return NextResponse.json(updated);
}
