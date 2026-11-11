/**
 * A minimal tus (resumable upload) client for Cloudflare Stream, enough for
 * the builder's video/audio uploads: the file goes in fixed-size chunks to a
 * one-time upload URL our server reserved (/api/admin/stream-upload-url), and
 * after a failed chunk the upload asks the server how far it got and carries
 * on from there instead of starting over.
 *
 * Stream's chunk rules: at least 5 MiB (except a file's only/last chunk),
 * at most 200 MiB, the same size throughout, and a multiple of 256 KiB.
 * https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/
 */

export const TUS_CHUNK_BYTES = 50 * 1024 * 1024; // Cloudflare's recommended size for a reliable connection

export type TusResult = { status: number; offset: number | null };

/** How bytes actually travel; injected so the logic can be tested without a network. */
export type TusTransport = {
  patch(url: string, offset: number, chunk: Blob, onChunkProgress: (loadedBytes: number) => void): Promise<TusResult>;
  head(url: string): Promise<TusResult>;
};

export class TusUploadError extends Error {
  /** The upload URL is gone (expired, or finished elsewhere): start a new one. */
  constructor(message: string, readonly expired = false) {
    super(message);
  }
}

const RETRYABLE = (status: number) => status === 0 || status === 409 || status === 423 || status >= 500;

export async function tusUpload({
  file,
  uploadUrl,
  transport,
  resume = false,
  chunkBytes = TUS_CHUNK_BYTES,
  maxRetries = 6,
  onProgress,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  file: Blob;
  uploadUrl: string;
  transport: TusTransport;
  /** Ask the server for the current offset first (continuing an earlier upload). */
  resume?: boolean;
  chunkBytes?: number;
  maxRetries?: number;
  onProgress?: (percent: number) => void;
  wait?: (ms: number) => Promise<void>;
}): Promise<void> {
  const report = (bytes: number) => onProgress?.(file.size === 0 ? 100 : Math.min(100, Math.floor((bytes / file.size) * 100)));

  async function currentOffset(): Promise<number> {
    const res = await transport.head(uploadUrl);
    if (res.status === 404 || res.status === 410 || res.status === 403) {
      throw new TusUploadError("The upload link expired. Start the upload again.", true);
    }
    if (res.status < 200 || res.status >= 300 || res.offset == null) throw new TusUploadError("Couldn't check the upload's progress.");
    return res.offset;
  }

  let offset = resume ? await currentOffset() : 0;
  report(offset);
  let failures = 0;

  while (offset < file.size) {
    const end = Math.min(offset + chunkBytes, file.size);
    const start = offset;
    const res = await transport.patch(uploadUrl, start, file.slice(start, end), (loaded) => report(start + loaded));

    if (res.status === 204 && res.offset != null && res.offset > start) {
      offset = res.offset;
      failures = 0;
      report(offset);
      continue;
    }
    if (res.status === 404 || res.status === 410) throw new TusUploadError("The upload link expired. Start the upload again.", true);
    // (A 204 that didn't move the offset is retried too.)
    if (res.status !== 204 && !RETRYABLE(res.status)) {
      throw new TusUploadError(`The video host refused the upload (HTTP ${res.status}).`);
    }

    // A dropped connection or a server hiccup: back off, then ask where the
    // upload actually stands (the chunk may have partly arrived) and go on.
    failures += 1;
    if (failures > maxRetries) throw new TusUploadError("The upload kept failing. Check your connection, then choose the file again to continue.");
    await wait(Math.min(30_000, 1000 * 2 ** (failures - 1)));
    try {
      offset = await currentOffset();
    } catch (err) {
      if (err instanceof TusUploadError && err.expired) throw err;
      // Couldn't reach the server either; keep the offset and retry the chunk.
    }
  }
  report(file.size);
}

/** The real transport: XHR for PATCH (upload progress events), fetch for HEAD. */
export const browserTusTransport: TusTransport = {
  patch(url, offset, chunk, onChunkProgress) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PATCH", url);
      xhr.setRequestHeader("Tus-Resumable", "1.0.0");
      xhr.setRequestHeader("Upload-Offset", String(offset));
      xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
      xhr.upload.onprogress = (e) => onChunkProgress(e.loaded);
      xhr.onload = () => {
        const header = xhr.getResponseHeader("Upload-Offset");
        resolve({ status: xhr.status, offset: header == null ? null : Number(header) });
      };
      xhr.onerror = () => resolve({ status: 0, offset: null });
      xhr.ontimeout = () => resolve({ status: 0, offset: null });
      xhr.send(chunk);
    });
  },
  async head(url) {
    try {
      const res = await fetch(url, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0" } });
      const header = res.headers.get("Upload-Offset");
      return { status: res.status, offset: header == null ? null : Number(header) };
    } catch {
      return { status: 0, offset: null };
    }
  },
};

// ---- Continuing after a reload: remember an unfinished upload per file ----

type Saved = { uploadUrl: string; uid: string; savedAt: number };
// Under the one-time URL's own lifetime (lib/stream/upload.ts: 6 hours).
const SAVED_FOR_MS = 5 * 60 * 60 * 1000;
const keyFor = (file: File) => `sdr-stream-upload:${file.name}:${file.size}:${file.lastModified}`;

export function savedUpload(file: File): Saved | null {
  try {
    const raw = localStorage.getItem(keyFor(file));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    if (Date.now() - saved.savedAt > SAVED_FOR_MS) {
      localStorage.removeItem(keyFor(file));
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export function rememberUpload(file: File, saved: Omit<Saved, "savedAt">): void {
  try {
    localStorage.setItem(keyFor(file), JSON.stringify({ ...saved, savedAt: Date.now() }));
  } catch {
    // Private mode or storage full: the upload still works, it just can't continue after a reload.
  }
}

export function forgetUpload(file: File): void {
  try {
    localStorage.removeItem(keyFor(file));
  } catch {
    // ignore
  }
}
