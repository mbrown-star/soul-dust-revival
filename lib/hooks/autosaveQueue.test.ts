import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveQueue } from "./autosaveQueue";

type Fields = { a: string; b: string };

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AutosaveQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces a burst of edits into one merged save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = new AutosaveQueue<Fields>(save, 600);

    queue.schedule({ a: "1" });
    queue.schedule({ a: "2" });
    queue.schedule({ b: "x" });
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ a: "2", b: "x" }, { keepalive: false });
    expect(queue.status).toBe("saved");
  });

  it("never runs two saves at once; edits made during a save go out after it", async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const queue = new AutosaveQueue<Fields>(save, 100);

    queue.schedule({ a: "1" });
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);

    queue.schedule({ a: "2" });
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1); // still waiting on the first

    first.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ a: "2" }, { keepalive: false });
  });

  it("keeps a failed patch for retry, merged under newer edits, without retrying on its own", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const statuses: string[] = [];
    const queue = new AutosaveQueue<Fields>(save, 50, (s) => statuses.push(s));

    queue.schedule({ a: "1", b: "1" });
    await vi.advanceTimersByTimeAsync(50);
    expect(queue.status).toBe("error");
    expect(queue.error).toBe("offline");

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);

    queue.schedule({ b: "2" });
    await queue.retry();
    expect(save).toHaveBeenLastCalledWith({ a: "1", b: "2" }, { keepalive: false });
    expect(queue.status).toBe("saved");
    expect(statuses).toContain("error");
  });

  it("flush sends immediately, with keepalive when asked, and does nothing when there's nothing pending", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = new AutosaveQueue<Fields>(save, 10_000);

    await queue.flush({ keepalive: true });
    expect(save).not.toHaveBeenCalled();

    queue.schedule({ a: "1" });
    await queue.flush({ keepalive: true });
    expect(save).toHaveBeenCalledWith({ a: "1" }, { keepalive: true });
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("uses the save function set most recently", async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const queue = new AutosaveQueue<Fields>(first, 10);
    queue.setSave(second);

    queue.schedule({ a: "1" });
    await vi.advanceTimersByTimeAsync(10);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
