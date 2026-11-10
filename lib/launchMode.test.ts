import { afterEach, describe, expect, it, vi } from "vitest";

// Like lib/domains.test.ts: the mode is read once at module scope (it's a
// build-time value), so each case re-imports after setting the env.
const ORIGINAL = process.env.NEXT_PUBLIC_LAUNCH_MODE;
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

async function load(mode: string | undefined) {
  vi.resetModules();
  if (mode === undefined) delete process.env.NEXT_PUBLIC_LAUNCH_MODE;
  else process.env.NEXT_PUBLIC_LAUNCH_MODE = mode;
  return import("./launchMode");
}

afterEach(() => {
  redirect.mockReset();
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_LAUNCH_MODE;
  else process.env.NEXT_PUBLIC_LAUNCH_MODE = ORIGINAL;
});

describe("launch mode", () => {
  it("is the full site when unset", async () => {
    const { isSneakPeek, closedInSneakPeek } = await load(undefined);
    expect(isSneakPeek()).toBe(false);
    closedInSneakPeek();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("is the full site when set to full", async () => {
    const { isSneakPeek } = await load("full");
    expect(isSneakPeek()).toBe(false);
  });

  it("locked-lesson wording says 'at launch and purchase' on the sneak-peek site", async () => {
    const { lockedLessonNote } = await load("sneak_peek");
    expect(lockedLessonNote("Week 4")).toBe("Week 4 unlocks at launch and purchase");
    expect(lockedLessonNote()).toBe("Unlocks at launch and purchase");
    expect(lockedLessonNote("362 more days", { plural: true })).toBe("362 more days unlock at launch and purchase");
  });

  it("locked-lesson wording says 'with purchase' on the full site", async () => {
    const { lockedLessonNote } = await load(undefined);
    expect(lockedLessonNote("Day 4")).toBe("Day 4 unlocks with purchase");
    expect(lockedLessonNote()).toBe("Unlocks with purchase");
  });

  it("sneak_peek closes store pages by sending the visitor home", async () => {
    const { isSneakPeek, closedInSneakPeek } = await load("sneak_peek");
    expect(isSneakPeek()).toBe(true);
    closedInSneakPeek();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
