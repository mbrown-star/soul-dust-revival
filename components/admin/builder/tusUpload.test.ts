import { describe, expect, it } from "vitest";
import { tusUpload, TusUploadError, type TusResult, type TusTransport } from "./tusUpload";

const MB = 1024 * 1024;

/**
 * A fake Stream tus endpoint: accepts chunks at the current offset, and can
 * be told to fail some PATCHes (dropped connection, partial receipt, ...).
 */
function fakeServer(size: number, { start = 0 } = {}) {
  let offset = start;
  const patches: { offset: number; bytes: number }[] = [];
  const failures: ((at: number, bytes: number) => TusResult | null)[] = [];
  const transport: TusTransport = {
    async patch(_url, at, chunk, onChunkProgress) {
      const fail = failures.shift();
      const result = fail?.(at, chunk.size);
      if (result) return result;
      if (at !== offset) return { status: 409, offset: null };
      patches.push({ offset: at, bytes: chunk.size });
      onChunkProgress(chunk.size);
      offset = at + chunk.size;
      return { status: 204, offset };
    },
    async head() {
      return { status: 200, offset };
    },
  };
  return {
    transport,
    patches,
    failNext: (f: (at: number, bytes: number) => TusResult | null) => failures.push(f),
    setOffset: (o: number) => (offset = o),
    get offset() {
      return offset;
    },
    size,
  };
}

const noWait = () => Promise.resolve();
const file = (bytes: number) => new Blob([new Uint8Array(bytes)]);

describe("tusUpload", () => {
  it("sends a large file in equal chunks with a smaller last one, reporting progress to 100%", async () => {
    const server = fakeServer(12 * MB);
    const progress: number[] = [];
    await tusUpload({ file: file(12 * MB), uploadUrl: "u", transport: server.transport, chunkBytes: 5 * MB, onProgress: (p) => progress.push(p), wait: noWait });
    expect(server.patches).toEqual([
      { offset: 0, bytes: 5 * MB },
      { offset: 5 * MB, bytes: 5 * MB },
      { offset: 10 * MB, bytes: 2 * MB },
    ]);
    expect(server.offset).toBe(12 * MB);
    expect(progress.at(-1)).toBe(100);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("continues an earlier upload from the offset the server reports", async () => {
    const server = fakeServer(12 * MB, { start: 5 * MB });
    await tusUpload({ file: file(12 * MB), uploadUrl: "u", transport: server.transport, chunkBytes: 5 * MB, resume: true, wait: noWait });
    expect(server.patches.map((p) => p.offset)).toEqual([5 * MB, 10 * MB]);
  });

  it("after a dropped connection mid-chunk, picks up from what actually arrived", async () => {
    const server = fakeServer(10 * MB);
    // The first chunk's connection drops after 3 MB reached the server.
    server.failNext((at) => {
      server.setOffset(at + 3 * MB);
      return { status: 0, offset: null };
    });
    const waits: number[] = [];
    await tusUpload({
      file: file(10 * MB),
      uploadUrl: "u",
      transport: server.transport,
      chunkBytes: 5 * MB,
      wait: async (ms) => void waits.push(ms),
    });
    expect(waits).toEqual([1000]);
    expect(server.patches.map((p) => p.offset)).toEqual([3 * MB, 8 * MB]);
    expect(server.offset).toBe(10 * MB);
  });

  it("re-syncs after an offset conflict and after a 5xx", async () => {
    const server = fakeServer(10 * MB);
    server.failNext(() => ({ status: 409, offset: null }));
    server.failNext(() => ({ status: 503, offset: null }));
    await tusUpload({ file: file(10 * MB), uploadUrl: "u", transport: server.transport, chunkBytes: 5 * MB, wait: noWait });
    expect(server.offset).toBe(10 * MB);
  });

  it("retries a 204 that didn't move the upload forward", async () => {
    const server = fakeServer(5 * MB);
    server.failNext(() => ({ status: 204, offset: 0 }));
    await tusUpload({ file: file(5 * MB), uploadUrl: "u", transport: server.transport, chunkBytes: 5 * MB, wait: noWait });
    expect(server.offset).toBe(5 * MB);
  });

  it("reports an expired link so the caller can start a fresh upload", async () => {
    const server = fakeServer(5 * MB);
    server.failNext(() => ({ status: 404, offset: null }));
    const err = await tusUpload({ file: file(5 * MB), uploadUrl: "u", transport: server.transport, wait: noWait }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TusUploadError);
    expect((err as TusUploadError).expired).toBe(true);
  });

  it("stops on a refusal it can't fix, and after too many failures in a row", async () => {
    const refused = fakeServer(5 * MB);
    refused.failNext(() => ({ status: 413, offset: null }));
    await expect(tusUpload({ file: file(5 * MB), uploadUrl: "u", transport: refused.transport, wait: noWait })).rejects.toThrow(/HTTP 413/);

    const flaky = fakeServer(5 * MB);
    for (let i = 0; i < 4; i++) flaky.failNext(() => ({ status: 0, offset: null }));
    await expect(
      tusUpload({ file: file(5 * MB), uploadUrl: "u", transport: flaky.transport, maxRetries: 3, wait: noWait })
    ).rejects.toThrow(/kept failing/);
  });
});
