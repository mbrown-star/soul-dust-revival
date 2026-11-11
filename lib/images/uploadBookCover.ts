import { CoverTooLargeError, NoCoverImageFoundError } from "./bookCover";
import { putToSlot, requestUploadSlots, UploadError, type UploadSlot } from "@/lib/r2/browserUpload";
import { COVER_IMAGE_UPLOAD_MAX_BYTES, COVER_PDF_UPLOAD_MAX_BYTES, oversizeMessage } from "@/lib/uploads/limits";

export type CoverUploadTarget = "product" | "study";

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
  try {
    await putToSlot(slot, body, contentType);
  } catch {
    throw new CoverUploadError("Upload to storage failed. Please try again.");
  }
}

/**
 * Splits a full-wrap KDP cover PDF in the admin's own browser and uploads
 * the results straight to R2 through server-issued upload links. A product
 * keeps the source PDF and both covers; a study keeps only the front cover.
 */
export async function uploadBookCoverPdf(file: File, target: CoverUploadTarget): Promise<UploadedBookCover> {
  if (file.type !== "application/pdf") throw new CoverUploadError("File must be a PDF.");
  const pdfTooBig = oversizeMessage(file.size, COVER_PDF_UPLOAD_MAX_BYTES);
  if (pdfTooBig) throw new CoverUploadError(pdfTooBig);

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

  const cropTooBig = [split.front, split.back]
    .map((crop) => oversizeMessage(crop.size, COVER_IMAGE_UPLOAD_MAX_BYTES))
    .find(Boolean);
  if (cropTooBig) throw new CoverUploadError(`A cover image made from this PDF is too large. ${cropTooBig}`);

  // Each link is signed for that file's exact size (lib/r2/upload.ts).
  const sizes =
    target === "product"
      ? { source: file.size, back: split.back.size, front: split.front.size }
      : { front: split.front.size };
  let slots: { source?: UploadSlot; back?: UploadSlot; front: UploadSlot };
  try {
    slots = await requestUploadSlots("/api/admin/cover-upload-urls", { target, sizes });
  } catch (err) {
    throw new CoverUploadError(err instanceof UploadError ? err.message : "Couldn't start the upload. Please try again.");
  }

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
