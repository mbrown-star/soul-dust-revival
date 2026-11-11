// The largest file each direct-to-R2 upload will accept. The server signs
// every upload link for the file's exact byte count (lib/r2/upload.ts), so R2
// itself refuses a body of any other size; these caps decide which sizes the
// server is willing to sign. The browser checks them first only so the admin
// gets a clear message instead of a refused request.
//
// Video and audio don't go through here: they go to Cloudflare Stream, whose
// own limit is lib/validation/schemas.ts STREAM_UPLOAD_MAX_BYTES.

const MB = 1024 * 1024;

/** Product, bundle, social and lesson images. */
export const IMAGE_UPLOAD_MAX_BYTES = 20 * MB;
/** WebVTT captions: plain text, so even hours of captions are well under this. */
export const CAPTIONS_UPLOAD_MAX_BYTES = 2 * MB;
/** Leader resource PDFs (guides, notes). */
export const RESOURCE_PDF_UPLOAD_MAX_BYTES = 100 * MB;
/** A study resource PDF (a companion catalog or guide readers download). */
export const STUDY_RESOURCE_UPLOAD_MAX_BYTES = 100 * MB;
/** A full-wrap KDP cover PDF (the same ceiling the old server-side cover routes had). */
export const COVER_PDF_UPLOAD_MAX_BYTES = 25 * MB;
/** One cover crop, a JPEG made in the admin's browser from that PDF. */
export const COVER_IMAGE_UPLOAD_MAX_BYTES = 30 * MB;

/** "20 MB", for messages. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / MB;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** The message shown when a file is over a cap, or null if it fits. */
export function oversizeMessage(size: number, maxBytes: number): string | null {
  if (size <= maxBytes) return null;
  return `This file is ${formatMegabytes(size)}; the limit here is ${formatMegabytes(maxBytes)}.`;
}

// Contact form screenshots. These aren't stored anywhere: the route attaches
// them to the email it sends (app/api/contact/route.ts). Resend refuses an
// email over 40 MB after base64 encoding (which adds a third), so the total
// stays well under that.
/** How many screenshots one contact message may carry. */
export const CONTACT_SCREENSHOTS_MAX_COUNT = 5;
/** One screenshot. */
export const CONTACT_SCREENSHOT_MAX_BYTES = 10 * MB;
/** All of one message's screenshots together. */
export const CONTACT_SCREENSHOTS_TOTAL_MAX_BYTES = 20 * MB;
