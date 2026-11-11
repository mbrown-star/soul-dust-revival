import {
  CONTACT_SCREENSHOT_MAX_BYTES,
  CONTACT_SCREENSHOTS_MAX_COUNT,
  CONTACT_SCREENSHOTS_TOTAL_MAX_BYTES,
  formatMegabytes,
} from "@/lib/uploads/limits";

/**
 * Screenshot rules for the Contact form, shared by the browser (so the
 * person gets a clear message before sending) and the route (which is what
 * actually enforces them). Nothing here touches storage: screenshots are
 * attached to the email and never saved.
 */

export type ScreenshotType = "png" | "jpeg" | "gif" | "webp";

/** What the file picker offers. The route still checks the bytes themselves. */
export const ACCEPTED_SCREENSHOT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const MIME_BY_TYPE: Record<ScreenshotType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function screenshotMimeType(type: ScreenshotType): string {
  return MIME_BY_TYPE[type];
}

/**
 * The image type from the file's first bytes, or null when it isn't one we
 * take. The browser-supplied Content-Type and filename are the sender's to
 * choose, so neither decides what gets attached.
 */
export function detectScreenshotType(bytes: Uint8Array): ScreenshotType | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith([0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "gif"; // "GIF8"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // "RIFF....WEBP"
  return null;
}

/** The count and size problem with a set of screenshots, or null if they fit. */
export function screenshotLimitsMessage(files: { size: number }[]): string | null {
  if (files.length > CONTACT_SCREENSHOTS_MAX_COUNT) {
    return `You can attach up to ${CONTACT_SCREENSHOTS_MAX_COUNT} screenshots.`;
  }
  if (files.some((f) => f.size > CONTACT_SCREENSHOT_MAX_BYTES)) {
    return `Each screenshot can be up to ${formatMegabytes(CONTACT_SCREENSHOT_MAX_BYTES)}.`;
  }
  if (files.some((f) => f.size === 0)) {
    return "One of the screenshots is empty.";
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > CONTACT_SCREENSHOTS_TOTAL_MAX_BYTES) {
    return `Screenshots can total up to ${formatMegabytes(CONTACT_SCREENSHOTS_TOTAL_MAX_BYTES)}.`;
  }
  return null;
}
