import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { entitlements, journeyEnrollments, journeys, responses } from "@/lib/db/schema";
import { createJourneyFixture } from "@/lib/testing/journeyFixture";
import { addDays, todayIn, weekdayOf } from "@/lib/journey/schedule";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST, PATCH } = await import("./route");
const { POST: postProgress } = await import("@/app/api/progress/route");
const { POST: postResponse } = await import("@/app/api/responses/route");
const { getSession } = await import("@/lib/auth/session");

function request(method: string, body: unknown, url = "https://example.com/api/journey/enrollment") {
  return new NextRequest(url, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("/api/journey/enrollment", () => {
  let f: Awaited<ReturnType<typeof createJourneyFixture>>;

  beforeEach(async () => {
    f = await createJourneyFixture();
    vi.mocked(getSession).mockResolvedValue(f.reader);
  });
  afterEach(async () => {
    await f.cleanup();
    vi.mocked(getSession).mockReset();
  });

  async function enrollment(userId = f.reader.userId) {
    const db = await getDb();
    return db.query.journeyEnrollments.findFirst({
      where: and(eq(journeyEnrollments.userId, userId), eq(journeyEnrollments.journeyId, f.journey.id)),
    });
  }

  it("begins the Journey: stop 1 now, the next on his Journey day", async () => {
    const res = await POST(request("POST", { journeyId: f.journey.id, weekday: 4, timeZone: "America/Chicago" }));
    expect(res.status).toBe(200);
    const row = await enrollment();
    expect(row).toMatchObject({ weekday: 4, timeZone: "America/Chicago", openedThrough: 0 });
    expect(weekdayOf(row!.nextOpensOn)).toBe(4);
  });

  it("refuses a second begin, an unknown time zone, and bad input", async () => {
    const body = { journeyId: f.journey.id, weekday: 1, timeZone: "UTC" };
    expect((await POST(request("POST", body))).status).toBe(200);
    expect((await POST(request("POST", body))).status).toBe(409);
    expect((await POST(request("POST", { ...body, timeZone: "Mars/Olympus" }))).status).toBe(400);
    expect((await POST(request("POST", { ...body, weekday: 7 }))).status).toBe(400);
    expect((await POST(request("POST", { ...body, extra: true }))).status).toBe(400);
  });

  it("refuses a reader who doesn't own every Part", async () => {
    const db = await getDb();
    await db.delete(entitlements).where(eq(entitlements.productId, f.productIds.partTwo));
    expect((await POST(request("POST", { journeyId: f.journey.id, weekday: 1, timeZone: "UTC" }))).status).toBe(403);
    expect(await enrollment()).toBeUndefined();
  });

  it("refuses an unpublished Journey to a reader", async () => {
    const db = await getDb();
    await db.update(journeys).set({ published: false }).where(eq(journeys.id, f.journey.id));
    expect((await POST(request("POST", { journeyId: f.journey.id, weekday: 1, timeZone: "UTC" }))).status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(request("POST", { journeyId: f.journey.id, weekday: 1, timeZone: "UTC" }))).status).toBe(401);
  });

  it("changes the Journey day without opening a stop early", async () => {
    const today = todayIn("UTC");
    // Stop 1 opened today: the next can't open for a week, whatever the day.
    await f.enroll({ weekday: weekdayOf(today), openedThrough: 0, nextOpensOn: today });
    const newDay = weekdayOf(addDays(today, 1));
    const res = await PATCH(request("PATCH", { journeyId: f.journey.id, weekday: newDay }));
    expect(res.status).toBe(200);
    const row = await enrollment();
    expect(row!.openedThrough).toBe(1);
    expect(row!.weekday).toBe(newDay);
    expect(row!.nextOpensOn >= addDays(today, 7)).toBe(true);
  });

  it("can't change the day of a Journey not begun", async () => {
    expect((await PATCH(request("PATCH", { journeyId: f.journey.id, weekday: 1 }))).status).toBe(404);
  });
});

describe("reader API routes refuse a Journey stop that isn't open", () => {
  let f: Awaited<ReturnType<typeof createJourneyFixture>>;

  beforeEach(async () => {
    f = await createJourneyFixture();
    vi.mocked(getSession).mockResolvedValue(f.reader);
    await f.enroll({ weekday: 1, openedThrough: 0, nextOpensOn: addDays(todayIn("UTC"), 7) });
  });
  afterEach(async () => {
    await f.cleanup();
    vi.mocked(getSession).mockReset();
  });

  it("won't record progress on a future stop", async () => {
    const res = await postProgress(
      request("POST", { lessonId: f.stopIds[1], status: "completed" }, "https://example.com/api/progress")
    );
    expect(res.status).toBe(403);
    expect(
      (
        await postProgress(request("POST", { lessonId: f.stopIds[0], status: "completed" }, "https://example.com/api/progress"))
      ).status
    ).toBe(200);
  });

  it("won't save an answer on a future stop", async () => {
    const res = await postResponse(
      request("POST", { contentBlockId: f.questionBlockIds[0], answerText: "Early" }, "https://example.com/api/responses")
    );
    expect(res.status).toBe(403);
    const db = await getDb();
    expect(await db.select().from(responses).where(eq(responses.contentBlockId, f.questionBlockIds[0]!))).toHaveLength(0);
  });
});
