import { IMMUTABLE_CACHE_CONTROL } from "./cacheControl";
import { oversizeMessage } from "@/lib/uploads/limits";

// The browser half of every direct-to-R2 upload: ask one of our
// /api/admin/*upload-url* routes for a link signed for this file's exact size,
// then PUT the file to it. Every step checks its response and throws an
// UploadError whose message can be shown to the admin as-is, so a refused or
// failed upload never leaves an "Uploading..." state stuck.

/** An upload failure whose message is meant for the admin. */
export class UploadError extends Error {}

/** Called with a 0-100 percentage as the file's bytes go out. */
export type UploadProgress = (percent: number) => void;

export type UploadSlot = { uploadUrl: string; publicUrl: string };

const FAILED = "The upload didn't complete. Check your connection and try again.";

/** The readable message from one of our JSON error responses, if it has one. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: unknown };
    return typeof data.message === "string" ? data.message : fallback;
  } catch {
    return fallback;
  }
}

/** POSTs a JSON request for upload link(s) and returns the parsed response. */
export async function requestUploadSlots<T>(endpoint: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new UploadError(FAILED);
  }
  if (!res.ok) throw new UploadError(await errorMessage(res, "This file can't be uploaded here."));
  return (await res.json()) as T;
}

/**
 * PUTs a file to a presigned link. Uses XMLHttpRequest because fetch() can't
 * report upload progress. Cache-Control must match what the server signed
 * (lib/r2/upload.ts); the browser sets Content-Length from the body itself,
 * and R2 refuses it if that isn't the size the link was signed for.
 */
export function putToSlot(slot: UploadSlot, body: Blob, contentType: string, onProgress?: UploadProgress): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", slot.uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(FAILED)));
    xhr.onerror = () => reject(new UploadError(FAILED));
    xhr.send(body);
  });
}

/**
 * Uploads one file through an upload-link route and resolves to its public
 * URL. `request` is the route's input minus `size`, which comes from the file.
 */
export async function uploadFileToR2({
  endpoint,
  request,
  file,
  contentType,
  maxBytes,
  onProgress,
}: {
  endpoint: string;
  request: Record<string, unknown>;
  file: Blob;
  contentType: string;
  maxBytes: number;
  onProgress?: UploadProgress;
}): Promise<string> {
  if (file.size === 0) throw new UploadError("This file is empty.");
  const tooBig = oversizeMessage(file.size, maxBytes);
  if (tooBig) throw new UploadError(tooBig);

  const slot = await requestUploadSlots<UploadSlot>(endpoint, { ...request, contentType, size: file.size });
  await putToSlot(slot, file, contentType, onProgress);
  return slot.publicUrl;
}
