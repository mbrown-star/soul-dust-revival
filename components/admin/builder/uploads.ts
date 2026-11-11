import { browserTusTransport, forgetUpload, rememberUpload, savedUpload, tusUpload, TusUploadError } from "./tusUpload";
import { IMMUTABLE_CACHE_CONTROL } from "@/lib/r2/cacheControl";

// Client-side upload helpers for the builder. Each checks every response and
// throws a readable Error, so a failed upload surfaces in the UI instead of
// leaving an "Uploading..." state stuck forever.

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string; error?: string };
    return data.message ?? fallback;
  } catch {
    return fallback;
  }
}

function extensionOf(file: File, fallback: string) {
  return file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || fallback;
}

/** Called with a 0-100 percentage as the file's bytes go out. */
export type UploadProgress = (percent: number) => void;

/**
 * Sends a request body with upload progress. fetch() can't report upload
 * progress, so this uses XMLHttpRequest; it resolves with the status code.
 */
function sendWithProgress(
  method: "PUT" | "POST",
  url: string,
  body: Blob | FormData,
  headers: Record<string, string>,
  onProgress?: UploadProgress
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("The upload didn't complete. Check your connection and try again."));
    xhr.send(body);
  });
}

async function presignedPut(
  endpoint: string,
  key: string | null,
  file: File,
  contentType: string,
  onProgress?: UploadProgress
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(key ? { key, contentType } : { contentType }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "This file type can't be uploaded here."));
  const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };

  // Cache-Control must match what the server signed (lib/r2/upload.ts).
  const status = await sendWithProgress(
    "PUT",
    uploadUrl,
    file,
    { "Content-Type": contentType, "Cache-Control": IMMUTABLE_CACHE_CONTROL },
    onProgress
  );
  if (status < 200 || status >= 300) throw new Error("The upload didn't complete. Check your connection and try again.");
  return publicUrl;
}

export const IMAGE_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function uploadImage(file: File, onProgress?: UploadProgress): Promise<string> {
  if (!IMAGE_UPLOAD_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  return presignedPut(
    "/api/admin/upload-url",
    `content/${crypto.randomUUID()}.${extensionOf(file, "img")}`,
    file,
    file.type,
    onProgress
  );
}

export async function uploadCaptions(file: File, onProgress?: UploadProgress): Promise<string> {
  if (!file.name.toLowerCase().endsWith(".vtt")) throw new Error("Captions must be a WebVTT (.vtt) file.");
  return presignedPut("/api/admin/captions-upload-url", null, file, "text/vtt", onProgress);
}

// Video and audio go to Cloudflare Stream as resumable (tus) uploads: any
// size up to Stream's own 30 GB limit, sent in chunks, and continued rather
// than restarted after a dropped connection -- or after a reload, when the
// same file is chosen again.
export const STREAM_UPLOAD_MAX_BYTES = 30 * 1024 * 1024 * 1024;

/** Uploads a video or audio file to Cloudflare Stream; resolves to its Stream UID. */
export async function uploadToStream(file: File, onProgress?: UploadProgress): Promise<string> {
  if (file.size > STREAM_UPLOAD_MAX_BYTES) {
    throw new Error(`This file is ${Math.round(file.size / 1024 / 1024 / 1024)} GB; the video host accepts up to 30 GB.`);
  }
  if (file.size === 0) throw new Error("This file is empty.");

  const saved = savedUpload(file);
  if (saved) {
    try {
      await tusUpload({ file, uploadUrl: saved.uploadUrl, transport: browserTusTransport, resume: true, onProgress });
      forgetUpload(file);
      return saved.uid;
    } catch (err) {
      // An expired link means starting a fresh upload; anything else is a
      // real failure, and the saved link stays so a retry can continue.
      if (!(err instanceof TusUploadError && err.expired)) throw err;
      forgetUpload(file);
    }
  }

  const res = await fetch("/api/admin/stream-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size, name: file.name }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't start the upload."));
  const { uploadUrl, uid } = (await res.json()) as { uploadUrl: string; uid: string };
  rememberUpload(file, { uploadUrl, uid });

  await tusUpload({ file, uploadUrl, transport: browserTusTransport, onProgress });
  forgetUpload(file);
  return uid;
}
