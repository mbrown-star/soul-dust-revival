import { CoverTooLargeError, NoCoverImageFoundError } from "./bookCover";
import { IMMUTABLE_CACHE_CONTROL } from "@/lib/r2/cacheControl";

// Same ceiling the old server-side cover routes enforced.
const MAX_COVER_PDF_BYTES = 25 * 1024 * 1024;

export type CoverUploadTarget = "product" | "study";

type UploadSlot = { uploadUrl: string; publicUrl: string };

export type UploadedBookCover = {
  coverPdfUrl: string | null;
  backImageUrl: string | null;
  frontImageUrl: string;
  backWidth: number;
  backHeight: number;
  frontWidth: number;
  frontHeight: number;
};

/** An error whose message is meant to be shown to the admin as-is. */
export class CoverUploadError extends Error {}

async function put(slot: UploadSlot, body: Blob, contentType: string) {
  const res = await fetch(slot.uploadUrl, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType, "Cache-Control": IMMUTABLE_CACHE_CONTROL },
  });
  if (!res.ok) throw new CoverUploadError("Upload to storage failed. Please try again.");
}

/**
 * Splits a full-wrap KDP cover PDF in the admin's own browser and uploads
 * the results straight to R2 through server-issued upload links. A product
 * keeps the source PDF and both covers; a study keeps only the front cover.
 */
export async function uploadBookCoverPdf(file: File, target: CoverUploadTarget): Promise<UploadedBookCover> {
  if (file.type !== "application/pdf") throw new CoverUploadError("File must be a PDF.");
  if (file.size > MAX_COVER_PDF_BYTES) throw new CoverUploadError("File must be under 25MB.");

  // Loaded on demand so pdf.js only ships to an admin actually uploading a cover.
  const { splitBookCoverInBrowser } = await import("./splitBookCoverInBrowser");
  let split: Awaited<ReturnType<typeof splitBookCoverInBrowser>>;
  try {
    split = await splitBookCoverInBrowser(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof NoCoverImageFoundError || err instanceof CoverTooLargeError) {
      throw new CoverUploadError(err.message);
    }
    throw new CoverUploadError("Couldn't read that file as a cover PDF.");
  }

  const res = await fetch("/api/admin/cover-upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
  if (!res.ok) throw new CoverUploadError("Couldn't start the upload. Please try again.");
  const slots = (await res.json()) as { source?: UploadSlot; back?: UploadSlot; front: UploadSlot };

  await Promise.all([
    slots.source ? put(slots.source, file, "application/pdf") : null,
    slots.back ? put(slots.back, split.back, "image/jpeg") : null,
    put(slots.front, split.front, "image/jpeg"),
  ]);

  return {
    coverPdfUrl: slots.source?.publicUrl ?? null,
    backImageUrl: slots.back?.publicUrl ?? null,
    frontImageUrl: slots.front.publicUrl,
    backWidth: split.backWidth,
    backHeight: split.backHeight,
    frontWidth: split.frontWidth,
    frontHeight: split.frontHeight,
  };
}
