import { extractImages, getDocumentProxy } from "unpdf";
import { PhotonImage, crop } from "@cf-wasm/photon";

export class NoCoverImageFoundError extends Error {
  constructor() {
    super(
      "This PDF doesn't contain a single embedded cover image. Export/flatten the KDP cover as a raster image (not vector text/shapes) and try again."
    );
    this.name = "NoCoverImageFoundError";
  }
}

export class CoverTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoverTooLargeError";
  }
}

// No real KDP full-wrap cover (back + spine + front, for any trim size this
// project sells) needs a page anywhere near this physically large -- this is
// a coarse, pre-decode guard against a crafted PDF declaring a huge page
// specifically to force a large allocation inside pdf.js's own image decode,
// which runs before any of our own checks get a chance to run.
const MAX_PAGE_POINTS_PER_SIDE = 60 * 72; // 60 inches, in PDF points (72/inch)

// The real use for these images is a web product photo/gallery, not a print
// file -- there's no reason to process print-resolution pixel counts. This
// bounds the RGBA buffers this function allocates on top of whatever pdf.js
// already decoded (see the module-level comment below for why this doesn't
// fully close the gap on its own).
//
// This was originally 50 megapixels, sized for a local/Node memory budget --
// found live, via wrangler tail, that Cloudflare Workers has a hard 128MB
// memory ceiling per isolate, fixed on every plan (unlike the CPU time
// limit, there is no config to raise it). At peak, this pipeline holds
// several full-size buffers alive at once: the decoded source image, its
// RGBA conversion, a copy inside Photon's WASM memory, both crop outputs
// (back + front), and JPEG-encoding scratch space -- roughly 4-5x a single
// RGBA buffer's size. 50 megapixels is 200MB of RGBA alone, which exceeds
// the ceiling before any of those other buffers even exist. A real KDP
// cover PDF (300 DPI print resolution) routinely decodes well above even
// this new, much lower cap -- that's expected and intentional: this feature
// was never meant to process print-resolution files, and the error message
// below says so. toRgba() below no longer copies the already-4-channel
// case (the common one), which removed one of those full-size buffers --
// raised slightly from this fix's first, more conservative value (4
// megapixels) to account for that, while staying well short of the ceiling.
const MAX_PIXELS = 6_000_000; // 6 megapixels -- a ~24MB RGBA buffer

// We don't collect page count/paper type from the admin, so the exact spine
// width (which depends on both) isn't known -- a plain 50/50 split left a
// visible sliver of the spine in both the back and front crops. Instead of
// cutting exactly at the midpoint, each crop stops this fraction of the
// full image width short of it, discarding a band centered on the midpoint
// that's wide enough to clear the spine for any trim/page-count this project
// sells (checked against this project's own cover-spine math: the widest
// spine relative to a full wrap's width is well under 5%). This is still an
// estimate, not true spine detection -- a very long/thick book could in
// principle have a wider spine than this margin covers.
const SPINE_MARGIN_FRACTION = 0.04;

/**
 * Splits a full-wrap book cover PDF (back cover + spine + front cover, all
 * on one page, as KDP's print-cover template produces) into two JPEG
 * images: the left side (back cover) and the right side (front cover), each
 * stopping short of the midpoint by SPINE_MARGIN_FRACTION so the spine
 * itself doesn't bleed into either crop.
 *
 * Security note: a malicious PDF could in principle declare an embedded
 * image's pixel dimensions far larger than its physical page size (the
 * image XObject's own /Width and /Height, not the page's MediaBox, drive
 * how many bytes pdf.js decodes) to force a large allocation purely from
 * calling unpdf's extractImages(), before this function's own MAX_PIXELS
 * check ever runs. The MAX_PAGE_POINTS_PER_SIDE check below only rules out
 * the common case of an absurdly large physical page; it is not a complete
 * guarantee against a hostile XObject on a small page. The route that calls
 * this already requires admin auth and caps the uploaded file to 25MB.
 */
export async function splitBookCoverPdf(
  pdfBytes: Uint8Array
): Promise<{ back: Uint8Array; front: Uint8Array }> {
  const pdf = await getDocumentProxy(pdfBytes);
  const page = await pdf.getPage(1);
  // page.view is always a 4-element [x1,y1,x2,y2] tuple per pdf.js's own
  // contract; TS just types it as number[] since it comes from a JS lib.
  const [x1, y1, x2, y2] = page.view as [number, number, number, number];
  if (Math.abs(x2 - x1) > MAX_PAGE_POINTS_PER_SIDE || Math.abs(y2 - y1) > MAX_PAGE_POINTS_PER_SIDE) {
    throw new CoverTooLargeError("This PDF's page size is implausibly large for a book cover.");
  }

  const images = await extractImages(pdf, 1);

  // KDP cover PDFs are flattened raster artwork -- a vector-based cover
  // (live text/shapes, no embedded bitmap) isn't supported by this
  // extraction approach and needs to be flagged rather than silently
  // producing a blank/wrong result.
  const image = images[0];
  if (!image) {
    throw new NoCoverImageFoundError();
  }

  if (image.width * image.height > MAX_PIXELS) {
    throw new CoverTooLargeError(
      `This cover image is too high-resolution to process (${image.width}x${image.height}). Please re-export it at a lower resolution -- this only needs to look good on a web product page, not in print.`
    );
  }

  const rgba = toRgba(image.data, image.channels, image.width, image.height);
  const photonImage = new PhotonImage(rgba, image.width, image.height);

  try {
    const midpoint = Math.floor(image.width / 2);
    const margin = Math.round(image.width * SPINE_MARGIN_FRACTION);
    const backImage = crop(photonImage, 0, 0, Math.max(1, midpoint - margin), image.height);
    const frontImage = crop(
      photonImage,
      Math.min(image.width - 1, midpoint + margin),
      0,
      image.width,
      image.height
    );

    try {
      return {
        back: backImage.get_bytes_jpeg(90),
        front: frontImage.get_bytes_jpeg(90),
      };
    } finally {
      backImage.free();
      frontImage.free();
    }
  } finally {
    photonImage.free();
  }
}

/**
 * Photon's PhotonImage constructor expects 4-channel (RGBA) raw pixels;
 * unpdf can hand back 1 (grayscale), 3 (RGB), or 4 channels depending on
 * the embedded image's color space, so grayscale/RGB need expanding first.
 *
 * The already-4-channel case returns a *view* over the same underlying
 * buffer, not a copy -- `new Uint8Array(data)` (a Uint8ClampedArray) looked
 * harmless but actually clones the whole buffer, needlessly doubling this
 * function's peak memory for what's typically the common case (most KDP
 * covers are already flattened to RGB/RGBA). Every byte in a
 * Uint8ClampedArray and a Uint8Array is identical; only out-of-range
 * *writes* clamp differently, and this function never writes back into it.
 */
function toRgba(data: Uint8ClampedArray, channels: 1 | 3 | 4, width: number, height: number): Uint8Array {
  if (channels === 4) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  const out = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    if (channels === 1) {
      out[j] = out[j + 1] = out[j + 2] = data[i]!;
    } else {
      out[j] = data[i]!;
      out[j + 1] = data[i + 1]!;
      out[j + 2] = data[i + 2]!;
    }
    out[j + 3] = 255;
  }
  return out;
}
