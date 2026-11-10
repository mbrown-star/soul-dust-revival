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

async function presignedPut(endpoint: string, key: string | null, file: File, contentType: string): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(key ? { key, contentType } : { contentType }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "This file type can't be uploaded here."));
  const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };

  // Cache-Control must match what the server signed (lib/r2/upload.ts).
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType, "Cache-Control": IMMUTABLE_CACHE_CONTROL },
  });
  if (!put.ok) throw new Error("The upload didn't complete. Check your connection and try again.");
  return publicUrl;
}

export const IMAGE_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function uploadImage(file: File): Promise<string> {
  if (!IMAGE_UPLOAD_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  return presignedPut("/api/admin/upload-url", `content/${crypto.randomUUID()}.${extensionOf(file, "img")}`, file, file.type);
}

export async function uploadCaptions(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith(".vtt")) throw new Error("Captions must be a WebVTT (.vtt) file.");
  return presignedPut("/api/admin/captions-upload-url", null, file, "text/vtt");
}

/** Uploads a video or audio file to Cloudflare Stream; resolves to its Stream UID. */
export async function uploadToStream(file: File): Promise<string> {
  const res = await fetch("/api/admin/stream-upload-url", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't start the upload."));
  const { uploadUrl, uid } = (await res.json()) as { uploadUrl: string; uid: string };

  const formData = new FormData();
  formData.append("file", file);
  const upload = await fetch(uploadUrl, { method: "POST", body: formData });
  if (!upload.ok) throw new Error("The upload didn't complete. Check your connection and try again.");
  return uid;
}
