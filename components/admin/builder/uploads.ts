import { browserTusTransport, forgetUpload, rememberUpload, savedUpload, tusUpload, TusUploadError } from "./tusUpload";
import { errorMessage, uploadFileToR2, type UploadProgress } from "@/lib/r2/browserUpload";
import { CAPTIONS_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_BYTES } from "@/lib/uploads/limits";

// Client-side upload helpers for the builder. Each checks every response and
// throws a readable Error, so a failed upload surfaces in the UI instead of
// leaving an "Uploading..." state stuck forever.

export const IMAGE_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function uploadImage(file: File, onProgress?: UploadProgress): Promise<string> {
  if (!IMAGE_UPLOAD_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  return uploadFileToR2({
    endpoint: "/api/admin/upload-url",
    request: { folder: "content" },
    file,
    contentType: file.type,
    maxBytes: IMAGE_UPLOAD_MAX_BYTES,
    onProgress,
  });
}

export async function uploadCaptions(file: File, onProgress?: UploadProgress): Promise<string> {
  if (!file.name.toLowerCase().endsWith(".vtt")) throw new Error("Captions must be a WebVTT (.vtt) file.");
  return uploadFileToR2({
    endpoint: "/api/admin/captions-upload-url",
    request: {},
    file,
    contentType: "text/vtt",
    maxBytes: CAPTIONS_UPLOAD_MAX_BYTES,
    onProgress,
  });
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
