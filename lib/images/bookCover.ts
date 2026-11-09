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

// Fallback only, used when findBorderClusters below can't find a genuine
// border at all (a cover design with no border frame, or whose palette
// doesn't contrast enough against its own background) -- we don't collect
// page count/paper type from the admin, so the exact spine width (which
// depends on both) isn't known, and a plain 50/50 split would leave a
// visible sliver of the spine in both the back and front crops. This stops
// each crop short of the midpoint by this fraction of the full image width
// instead, discarding a band centered on the midpoint that's wide enough to
// clear the spine for any trim/page-count this project sells. This is only
// ever a coarse guess, not real spine detection.
const SPINE_MARGIN_FRACTION = 0.06;

const BRIGHTNESS_THRESHOLD_DELTA = 120;

// How many of the sampled rows (see findBorderClusters) a column must be
// bright in to count as part of a genuine vertical border line, rather than
// a line of body text that only happens to cross one or two of them.
const ROW_CONSENSUS_FRACTION = 0.8;
const BORDER_SCAN_ROW_COUNT = 30;
// Corner flourishes some of these cover designs use sit right at the very
// top/bottom edge -- sampled rows stay this fraction of the height clear of
// both edges to avoid them.
const BORDER_SCAN_VERTICAL_MARGIN_FRACTION = 0.08;

type BorderCluster = { start: number; end: number };

/**
 * Finds every genuine vertical border stroke on the full page by sampling
 * many rows spread down the page's full height and keeping only the columns
 * that are brighter-than-background in nearly all of them -- a real
 * double-line border frame runs the entire height, so it lights up at the
 * same x position in every sampled row, while a line of body text only
 * crosses whichever one or two rows happen to land on it.
 *
 * Found live (2026-11-09): a single mid-height row (the previous approach)
 * routinely cuts straight through a cover's body-copy paragraphs or bullet
 * list, which produced dozens of spurious "bright" transitions with nothing
 * to do with the border at all. Per-row background is each row's own
 * median brightness rather than one fixed sample point, since a sample
 * point can itself land on text in some rows.
 *
 * Each real cover's border is a double line (two thin strokes a few pixels
 * apart) -- adjacent bright columns, and columns separated by a small gap,
 * are merged into one cluster representing that whole motif, so each side's
 * border is returned as a single {start, end} span.
 */
function findBorderClusters(rawPixels: Uint8Array, width: number, height: number): BorderCluster[] {
  const channels = 4;
  const verticalMargin = Math.round(height * BORDER_SCAN_VERTICAL_MARGIN_FRACTION);
  const usableHeight = Math.max(1, height - verticalMargin * 2);
  const rows: number[] = [];
  for (let i = 0; i < BORDER_SCAN_ROW_COUNT; i++) {
    rows.push(verticalMargin + Math.round((usableHeight * i) / (BORDER_SCAN_ROW_COUNT - 1)));
  }

  const brightnessAt = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return rawPixels[i]! + rawPixels[i + 1]! + rawPixels[i + 2]!;
  };

  const brightCount = new Array<number>(width).fill(0);
  const rowBrightness = new Array<number>(width);
  for (const y of rows) {
    for (let x = 0; x < width; x++) rowBrightness[x] = brightnessAt(x, y);
    const sorted = [...rowBrightness].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const threshold = median + BRIGHTNESS_THRESHOLD_DELTA;
    for (let x = 0; x < width; x++) {
      if (rowBrightness[x]! > threshold) brightCount[x] = brightCount[x]! + 1;
    }
  }

  const isConsistentlyBright = (x: number) => brightCount[x]! / rows.length >= ROW_CONSENSUS_FRACTION;
  const mergeGap = Math.round(width * 0.02);
  const clusters: BorderCluster[] = [];
  let x = 0;
  while (x < width) {
    if (!isConsistentlyBright(x)) {
      x++;
      continue;
    }
    let end = x;
    let gapRun = 0;
    let j = x + 1;
    while (j < width) {
      if (isConsistentlyBright(j)) {
        end = j;
        gapRun = 0;
      } else {
        gapRun++;
        if (gapRun > mergeGap) break;
      }
      j++;
    }
    clusters.push({ start: x, end });
    x = j;
  }
  return clusters;
}

/**
 * Splits the full page's detected border clusters into each half's own
 * left/right border, by which side of the page's own midpoint each cluster
 * falls on. A half whose border wasn't reliably detected (fewer than 2
 * clusters on that side) returns null for that half, so the caller can fall
 * back to a plain spine-margin split instead of cropping somewhere wrong.
 */
function findHalfBorders(
  clusters: BorderCluster[],
  width: number
): { back: { left: BorderCluster; right: BorderCluster } | null; front: { left: BorderCluster; right: BorderCluster } | null } {
  const midpoint = Math.floor(width / 2);
  const leftHalf = clusters.filter((c) => c.start < midpoint);
  const rightHalf = clusters.filter((c) => c.start >= midpoint);
  return {
    back: leftHalf.length >= 2 ? { left: leftHalf[0]!, right: leftHalf[leftHalf.length - 1]! } : null,
    front: rightHalf.length >= 2 ? { left: rightHalf[0]!, right: rightHalf[rightHalf.length - 1]! } : null,
  };
}

/**
 * Splits a full-wrap book cover PDF (back cover + spine + front cover, all
 * on one page, as KDP's print-cover template produces) into two JPEG
 * images: the back cover and the front cover. Each half genuinely has its
 * own complete double-line border in the source art (confirmed directly
 * against several real covers, 2026-11-09) -- so each crop is drawn right at
 * that half's own real border, found via findBorderClusters/findHalfBorders
 * above, with the same small margin outside it the source art already has
 * on the border's far (trim) side. Falls back to a plain midpoint split
 * (SPINE_MARGIN_FRACTION) only when a half's border can't be reliably found
 * at all.
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
 *
 * `maxPixels` defaults to MAX_PIXELS, the figure sized for the admin route's
 * actual Cloudflare Workers memory ceiling (see the constant's own comment).
 * A caller that doesn't run inside that Workers isolate -- namely, a one-off
 * Node maintenance script re-processing an already-stored source PDF -- can
 * pass a much higher value, since the 128MB-per-isolate constraint this cap
 * exists for simply doesn't apply to a plain Node process.
 */
export async function splitBookCoverPdf(
  pdfBytes: Uint8Array,
  maxPixels: number = MAX_PIXELS
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

  if (image.width * image.height > maxPixels) {
    throw new CoverTooLargeError(
      `This cover image is too high-resolution to process (${image.width}x${image.height}). Please re-export it at a lower resolution -- this only needs to look good on a web product page, not in print.`
    );
  }

  const rgba = toRgba(image.data, image.channels, image.width, image.height);
  const photonImage = new PhotonImage(rgba, image.width, image.height);

  try {
    const fullRaw = photonImage.get_raw_pixels();
    const clusters = findBorderClusters(fullRaw, image.width, image.height);
    const { back: backBorder, front: frontBorder } = findHalfBorders(clusters, image.width);

    const midpoint = Math.floor(image.width / 2);
    const fallbackMargin = Math.round(image.width * SPINE_MARGIN_FRACTION);

    const backCropEnd = backBorder
      ? Math.min(image.width, backBorder.right.end + backBorder.left.start + 1)
      : Math.max(1, midpoint - fallbackMargin);
    const frontCropStart = frontBorder
      ? Math.max(0, frontBorder.left.start - (image.width - 1 - frontBorder.right.end))
      : Math.min(image.width - 1, midpoint + fallbackMargin);

    const backImage = crop(photonImage, 0, 0, backCropEnd, image.height);
    const frontImage = crop(photonImage, frontCropStart, 0, image.width, image.height);

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
