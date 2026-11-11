import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { entitlements, journeys } from "@/lib/db/schema";
import { getJourneyAccess, getLessonAccess } from "@/lib/entitlements/check";
import { createJourneyFixture } from "@/lib/testing/journeyFixture";
import { addDays, todayIn } from "./schedule";
import { loadJourneyProgress } from "./load";
import { journeyLessonNav } from "./nav";

// The Journey's pacing, enforced in getLessonAccess -- the one check every
// reader page and reader API route uses. Real local test database.
describe("The Journey's pacing in getLessonAccess", () => {
  let f: Awaited<ReturnType<typeof createJourneyFixture>>;
  const today = todayIn("UTC");

  beforeEach(async () => {
    f = await createJourneyFixture();
  });
  afterEach(async () => {
    await f.cleanup();
  });

  const access = (stop: number, session = f.reader) => {
    const lesson = f.lessons[stop]!;
    const study = lesson.studyId === f.studyOne.id ? f.studyOne : f.studyTwo;
    return getLessonAccess(session, study, lesson);
  };

  it("locks every stop until the reader begins", async () => {
    const result = await access(0);
    expect(result.allowed).toBe(false);
    expect(result.journeyLock).toEqual({ journeyHref: `/journey/${f.journey.slug}`, reason: "not_started" });
  });

  it("opens only the first stop on the day he begins", async () => {
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn: addDays(today, 7) });
    expect((await access(0)).allowed).toBe(true);
    const second = await access(1);
    expect(second.allowed).toBe(false);
    expect(second.journeyLock).toMatchObject({ reason: "waiting", opensOn: addDays(today, 7) });
  });

  it("keeps a stop whose week has come locked until the one before it is done", async () => {
    // Begun three weeks ago: stops 0-3 have opened by date.
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn: addDays(today, -14) });
    expect((await access(0)).allowed).toBe(true);
    expect((await access(1)).journeyLock).toMatchObject({ reason: "earlier_stop" });

    await f.complete(0);
    expect((await access(1)).allowed).toBe(true);
    expect((await access(2)).journeyLock).toMatchObject({ reason: "earlier_stop" });
  });

  it("never opens a stop before its week, even with everything before it done", async () => {
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn: addDays(today, 3) });
    await f.complete(0);
    expect((await access(1)).journeyLock).toMatchObject({ reason: "waiting" });
  });

  it("paces across Parts: Part Two's threshold follows Part One's last week", async () => {
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn: addDays(today, -28) });
    await f.complete(0);
    await f.complete(1);
    expect((await access(3)).journeyLock).toMatchObject({ reason: "earlier_stop" });
    await f.complete(2);
    expect((await access(3)).allowed).toBe(true);
  });

  it("keeps a finished stop open to reread", async () => {
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn: addDays(today, 7) });
    await f.complete(0);
    expect((await access(0)).allowed).toBe(true);
  });

  it("doesn't pace an admin previewing", async () => {
    const result = await access(4, f.admin);
    expect(result).toEqual({ allowed: true, isAdminPreview: true, sampleOnly: false });
  });

  it("doesn't pace the Parts of an unpublished Journey", async () => {
    const db = await getDb();
    await db.update(journeys).set({ published: false }).where(eq(journeys.id, f.journey.id));
    expect((await access(4)).allowed).toBe(true);
  });

  it("doesn't pace a reader who owns only some Parts: he reads what he owns", async () => {
    const db = await getDb();
    await db.delete(entitlements).where(eq(entitlements.productId, f.productIds.partTwo));
    const result = await access(2);
    expect(result).toEqual({ allowed: true, isAdminPreview: false, sampleOnly: false });
  });

  it("keeps a stop finished before the Journey was switched on open, even before beginning", async () => {
    await f.complete(0);
    await f.complete(1);
    expect((await access(1)).allowed).toBe(true);
    expect((await access(2)).journeyLock).toMatchObject({ reason: "not_started" });
  });

  it("hands the page the Journey it loaded", async () => {
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn: addDays(today, 7) });
    const result = await access(0);
    expect(result.journey?.stops).toHaveLength(5);
  });

  it("requires every Part's entitlement to own the Journey", async () => {
    expect((await getJourneyAccess(f.reader, f.journey)).allowed).toBe(true);
    const db = await getDb();
    await db.delete(entitlements).where(eq(entitlements.productId, f.productIds.partTwo));
    expect((await getJourneyAccess(f.reader, f.journey)).allowed).toBe(false);
    expect((await getJourneyAccess(f.admin, f.journey)).allowed).toBe(true);
  });
});

describe("journeyLessonNav", () => {
  let f: Awaited<ReturnType<typeof createJourneyFixture>>;
  const today = todayIn("UTC");

  beforeEach(async () => {
    f = await createJourneyFixture();
  });
  afterEach(async () => {
    await f.cleanup();
  });

  it("links across Parts and labels thresholds by Part", async () => {
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn: addDays(today, -28) });
    for (const i of [0, 1, 2]) await f.complete(i);
    const db = await getDb();
    const progress = await loadJourneyProgress(db, f.journey, f.reader.userId);
    expect(progress.stops.map((s) => s.label)).toEqual(["Part One", "Week 1", "Week 2", "Part Two", "Week 3"]);

    const nav = journeyLessonNav(progress, f.stopIds[2]!, false)!;
    expect(nav.nextHref).toBe(`/studies/${f.studyTwo.slug}/${f.stopIds[3]}`);
    expect(nav.part.label).toBe("Part One — Out of the Dust");
  });

  it("says when the next stop opens and sends the reader home after finishing", async () => {
    const nextOpensOn = addDays(today, 5);
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn });
    const db = await getDb();
    const progress = await loadJourneyProgress(db, f.journey, f.reader.userId);
    const nav = journeyLessonNav(progress, f.stopIds[0]!, false)!;
    expect(nav.nextHref).toBeNull();
    expect(nav.nextLockNote).toMatch(/^Week 1 opens /);
    expect(nav.continueHref).toBe(`/journey/${f.journey.slug}`);
    expect(nav.pickerItems[1]).toMatchObject({ locked: true, group: "Part One — Out of the Dust" });
  });

  it("goes straight on to the next stop when its week has already come", async () => {
    await f.enroll({ weekday: 2, openedThrough: 0, nextOpensOn: addDays(today, -7) });
    const db = await getDb();
    const progress = await loadJourneyProgress(db, f.journey, f.reader.userId);
    const nav = journeyLessonNav(progress, f.stopIds[0]!, false)!;
    expect(nav.continueHref).toBe(`/studies/${f.studyOne.slug}/${f.stopIds[1]}`);
  });
});
