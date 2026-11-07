import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postLessonProgress, pendingLessonProgressPings } from "./lessonProgress";

describe("postLessonProgress", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the lesson id and status, and returns true on a 2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const result = await postLessonProgress("lesson-1", "completed");

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/progress",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ lessonId: "lesson-1", status: "completed" }),
      })
    );
  });

  // Real regression this guards: a non-2xx response (401/403/validation
  // error) resolves normally rather than throwing -- a caller checking only
  // for a thrown exception would treat a failed write as a success.
  it("returns false on a non-2xx response without throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(postLessonProgress("lesson-1", "completed")).resolves.toBe(false);
  });

  it("returns false on a genuine network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(postLessonProgress("lesson-1", "completed")).resolves.toBe(false);
  });
});

describe("pendingLessonProgressPings", () => {
  it("is a shared map callers can use to coordinate against the mount-time ping", async () => {
    pendingLessonProgressPings.clear();
    const ping = Promise.resolve(true);
    pendingLessonProgressPings.set("lesson-1", ping);

    expect(pendingLessonProgressPings.get("lesson-1")).toBe(ping);
    expect(await pendingLessonProgressPings.get("lesson-1")).toBe(true);
  });
});
