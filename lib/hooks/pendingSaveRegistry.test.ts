import { describe, it, expect, vi } from "vitest";
import { trackPendingSave, awaitPendingSave } from "./pendingSaveRegistry";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("pendingSaveRegistry", () => {
  it("awaitPendingSave resolves immediately when nothing is tracked for that key", async () => {
    await expect(awaitPendingSave("never-tracked")).resolves.toBeUndefined();
  });

  it("awaitPendingSave waits for a tracked promise to settle", async () => {
    const { promise, resolve } = deferred<void>();
    trackPendingSave("lesson-1", promise);

    const order: string[] = [];
    const waiter = awaitPendingSave("lesson-1").then(() => order.push("waited"));
    order.push("before-resolve");
    resolve();
    await waiter;

    expect(order).toEqual(["before-resolve", "waited"]);
  });

  it("does not reject when the tracked save itself rejects", async () => {
    const { promise, reject } = deferred<void>();
    trackPendingSave("lesson-2", promise);
    reject(new Error("network error"));

    await expect(awaitPendingSave("lesson-2")).resolves.toBeUndefined();
  });

  it("stops tracking a save once it settles, so a later await is a no-op", async () => {
    const { promise, resolve } = deferred<void>();
    trackPendingSave("lesson-3", promise);
    resolve();
    await vi.waitFor(async () => {
      await awaitPendingSave("lesson-3");
    });

    // A second, independent save under the same key starts fresh.
    let secondResolved = false;
    const second = new Promise<void>((res) =>
      setTimeout(() => {
        secondResolved = true;
        res();
      }, 10)
    );
    trackPendingSave("lesson-3", second);
    await awaitPendingSave("lesson-3");
    expect(secondResolved).toBe(true);
  });
});
