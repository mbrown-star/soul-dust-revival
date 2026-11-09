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

// Fallback only, used when findVerticalBorderClusters below can't find a
// genuine border at all (a cover design with no border frame, or whose
// palette doesn't contrast enough against its own background) -- we don't
// collect page count/paper type from the admin, so the exact spine width
// (which depends on both) isn't known, and a plain 50/50 split would leave a
// visible sliver of the spine in both the back and front crops. This stops
// each crop short of the midpoint by this fraction of the full image width
// instead, discarding a band centered on the midpoint that's wide enough to
// clear the spine for any trim/page-count this project sells. This is only
// ever a coarse guess, not real spine detection.
const SPINE_MARGIN_FRACTION = 0.06;

// Fallback only, used for a half whose vertical (left/right) border WAS
// found but whose horizontal (top/bottom) border wasn't -- just past that
// border's own inner (spine-facing) edge, not mirrored from its outer-edge
// margin. Found live (2026-11-09, later): a real cover ("Revive Me") has an
// outer trim margin much wider, proportionally, than its actual spine --
// mirroring that wide outer margin onto the spine side overshot past the
// OTHER half's own border entirely, bleeding the spine's own rotated title
// text into both crops. This cushion is only ever a few percent of the full
// width -- enough to include the border's own double line cleanly, never
// enough to reach into the spine's actual content on any real cover seen so
// far (spine gaps observed between ~2% and ~11% of full width). When the
// horizontal border IS also found, the real equalized-margin path below
// (equalizeHalfBorder) supersedes this entirely.
const INNER_BORDER_CUSHION_FRACTION = 0.01;

const BRIGHTNESS_THRESHOLD_DELTA = 120;

// How many of the sampled scan lines (see findBrightClusters) a position
// must be bright in to count as part of a genuine double-line border
// stroke, rather than a line of body text that only happens to cross one or
// two of them.
const LINE_CONSENSUS_FRACTION = 0.8;
const BORDER_SCAN_LINE_COUNT = 30;
// Corner flourishes some of these cover designs use sit right at the very
// edge of whatever axis is being scanned -- sampled scan lines stay this
// fraction of that axis's own length clear of both its ends to avoid them.
const BORDER_SCAN_MARGIN_FRACTION = 0.08;

type BorderCluster = { start: number; end: number };

/**
 * Shared core for both the vertical-line finder (findVerticalBorderClusters,
 * which samples rows to find border columns) and the horizontal-line finder
 * (findHorizontalBorderClusters, which samples columns to find border rows)
 * below -- the two are exact duals of each other, just with the "sample"
 * and "scan" axes swapped. Samples `BORDER_SCAN_LINE_COUNT` evenly-spaced
 * lines along the scan axis (within [scanRangeStart, scanRangeStart +
 * scanRangeLength)) and keeps only the sample-axis positions that are
 * brighter than that scan line's own median in nearly all of them -- a real
 * double-line border frame runs the full length of whichever axis it's
 * parallel to, so it lights up at the same position in every sampled line,
 * while a line of body text only crosses whichever one or two sampled lines
 * happen to land on it. Per-line background is that line's own median
 * brightness rather than one fixed sample point, since a sample point can
 * itself land on text in some lines.
 *
 * Each real cover's border is a double line (two thin strokes a few pixels
 * apart) -- adjacent bright positions, and positions separated by a small
 * gap, are merged into one cluster representing that whole motif, so each
 * side's border is returned as a single {start, end} span.
 */
function findBrightClusters(
  sampleLength: number,
  scanRangeStart: number,
  scanRangeLength: number,
  brightnessAt: (samplePos: number, scanPos: number) => number
): BorderCluster[] {
  const scanMargin = Math.round(scanRangeLength * BORDER_SCAN_MARGIN_FRACTION);
  const usableScanLength = Math.max(1, scanRangeLength - scanMargin * 2);
  const scanPositions: number[] = [];
  for (let i = 0; i < BORDER_SCAN_LINE_COUNT; i++) {
    scanPositions.push(scanRangeStart + scanMargin + Math.round((usableScanLength * i) / (BORDER_SCAN_LINE_COUNT - 1)));
  }

  const brightCount = new Array<number>(sampleLength).fill(0);
  const lineBrightness = new Array<number>(sampleLength);
  for (const scanPos of scanPositions) {
    for (let s = 0; s < sampleLength; s++) lineBrightness[s] = brightnessAt(s, scanPos);
    const sorted = [...lineBrightness].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const threshold = median + BRIGHTNESS_THRESHOLD_DELTA;
    for (let s = 0; s < sampleLength; s++) {
      if (lineBrightness[s]! > threshold) brightCount[s] = brightCount[s]! + 1;
    }
  }

  const isConsistentlyBright = (s: number) => brightCount[s]! / scanPositions.length >= LINE_CONSENSUS_FRACTION;
  const mergeGap = Math.round(sampleLength * 0.02);
  const clusters: BorderCluster[] = [];
  let s = 0;
  while (s < sampleLength) {
    if (!isConsistentlyBright(s)) {
      s++;
      continue;
    }
    let end = s;
    let gapRun = 0;
    let j = s + 1;
    while (j < sampleLength) {
      if (isConsistentlyBright(j)) {
        end = j;
        gapRun = 0;
      } else {
        gapRun++;
        if (gapRun > mergeGap) break;
      }
      j++;
    }
    clusters.push({ start: s, end });
    s = j;
  }
  return clusters;
}

/** Finds every genuine vertical border stroke (a left/right border edge) on the full page. */
function findVerticalBorderClusters(rawPixels: Uint8Array, width: number, height: number): BorderCluster[] {
  const channels = 4;
  const brightnessAt = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return rawPixels[i]! + rawPixels[i + 1]! + rawPixels[i + 2]!;
  };
  return findBrightClusters(width, 0, height, (x, y) => brightnessAt(x, y));
}

/**
 * Finds every genuine horizontal border stroke (a top/bottom border edge)
 * within one half's own border interior -- sample columns are restricted to
 * [xRangeStart, xRangeEnd) (that half's own detected left/right border
 * interior, not the full page) so a column landing in the spine or in the
 * OTHER half's content can never be mistaken for this half's own top/bottom
 * border.
 */
function findHorizontalBorderClusters(
  rawPixels: Uint8Array,
  width: number,
  height: number,
  xRangeStart: number,
  xRangeEnd: number
): BorderCluster[] {
  const channels = 4;
  const brightnessAt = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return rawPixels[i]! + rawPixels[i + 1]! + rawPixels[i + 2]!;
  };
  return findBrightClusters(height, xRangeStart, Math.max(1, xRangeEnd - xRangeStart), (y, x) => brightnessAt(x, y));
}

/**
 * Splits the full page's detected vertical border clusters into each half's
 * own left/right border, by which side of the page's own midpoint each
 * cluster falls on. A half whose border wasn't reliably detected (fewer
 * than 2 clusters on that side) returns null for that half, so the caller
 * can fall back to a plain spine-margin split instead of cropping somewhere
 * wrong.
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

type CropBounds = { x0: number; y0: number; x1: number; y1: number };

/**
 * Given one half's own detected left/right border and (optionally) its own
 * detected top/bottom border, computes a crop that centers the border
 * rectangle with an EQUAL margin on all four sides -- not just a safe,
 * non-overlapping margin on the spine side (the 2026-11-09 fix), but a
 * margin that matches on every side so the border reads as genuinely
 * centered in the final web image, per the user's explicit requirement
 * (2026-11-09, latest).
 *
 * The margin used is the SMALLEST of whatever's naturally available on each
 * side -- never invented space, since that would risk cropping into real
 * content. `innerBudgetMax` bounds how far the crop may extend past the
 * border on the spine-facing side specifically (the one side with no hard
 * page-edge boundary of its own), capped by the caller to never reach the
 * other half's own border or content. `isSpineOnLeft` says which side of
 * this half's left/right border pair faces the spine (true for the front
 * cover's own left border, false for the back cover's own right border) --
 * the OTHER side of that pair always faces the true page edge (a hard
 * boundary: x=0 for the back cover, x=width-1 for the front cover).
 *
 * Falls back to the pre-equalization behavior (a fixed small cushion past
 * the spine-facing edge, full page height) when this half's own top/bottom
 * border couldn't be reliably found -- equalizing against an unknown
 * vertical margin isn't possible, so this degrades gracefully to the
 * already-tested, still-safe prior fix rather than guessing.
 */
function equalizeHalfBorder(
  vertical: { left: BorderCluster; right: BorderCluster },
  horizontal: { top: BorderCluster; bottom: BorderCluster } | null,
  width: number,
  height: number,
  isSpineOnLeft: boolean,
  innerBudgetMax: number
): CropBounds {
  const trimMargin = isSpineOnLeft ? width - 1 - vertical.right.end : vertical.left.start;

  if (!horizontal) {
    // innerBudgetMax already reflects the caller's cushion-or-tighter
    // policy (see splitBookCoverPdf) -- nothing further to cap it by here.
    return isSpineOnLeft
      ? { x0: Math.max(0, vertical.left.start - innerBudgetMax), y0: 0, x1: width, y1: height }
      : { x0: 0, y0: 0, x1: Math.min(width, vertical.right.end + innerBudgetMax), y1: height };
  }

  const topMargin = horizontal.top.start;
  const bottomMargin = height - 1 - horizontal.bottom.end;
  // The smallest of all four natural margins becomes the ONE margin applied
  // to every side -- this is what guarantees the border rectangle ends up
  // centered, even if it means cropping away a little of a side that
  // naturally had more room to spare than the tightest side did.
  const margin = Math.min(trimMargin, topMargin, bottomMargin, innerBudgetMax);

  return {
    x0: Math.max(0, vertical.left.start - margin),
    y0: Math.max(0, horizontal.top.start - margin),
    x1: Math.min(width, vertical.right.end + margin + 1),
    y1: Math.min(height, horizontal.bottom.end + margin + 1),
  };
}

/**
 * Splits a full-wrap book cover PDF (back cover + spine + front cover, all
 * on one page, as KDP's print-cover template produces) into two JPEG
 * images: the back cover and the front cover. Each half genuinely has its
 * own complete double-line border in the source art (confirmed directly
 * against several real covers, 2026-11-09) -- so each crop is drawn right at
 * that half's own real border (found via findVerticalBorderClusters/
 * findHalfBorders, and findHorizontalBorderClusters for its top/bottom
 * edges), with an EQUAL margin outside the border on all four sides
 * (equalizeHalfBorder) so the border rectangle always reads as genuinely
 * centered in the final image, per the user's explicit requirement
 * (2026-11-09, latest) -- not just a margin wide enough to avoid bleeding
 * into the spine (the 2026-11-09, later fix this supersedes). Falls back to
 * a plain midpoint split (SPINE_MARGIN_FRACTION) only when a half's
 * vertical border can't be reliably found at all, or to the prior fix's
 * fixed spine-side cushion when only its horizontal (top/bottom) border
 * can't be found. Defensively clamped so the two crops can never overlap
 * even on an unusually narrow spine.
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
): Promise<{
  back: Uint8Array;
  front: Uint8Array;
  backWidth: number;
  backHeight: number;
  frontWidth: number;
  frontHeight: number;
}> {
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
    const clusters = findVerticalBorderClusters(fullRaw, image.width, image.height);
    const { back: backBorder, front: frontBorder } = findHalfBorders(clusters, image.width);

    const midpoint = Math.floor(image.width / 2);
    const fallbackMargin = Math.round(image.width * SPINE_MARGIN_FRACTION);

    // The spine-facing side's margin budget: the small, fixed cushion
    // (INNER_BORDER_CUSHION_FRACTION) is the PREFERRED value here, not half
    // the real spine gap -- there's no way to know where the spine's own
    // content (e.g. a rotated title) actually sits within that gap, so
    // using up to half of it as a target (rather than just a safety
    // ceiling) risks reaching deep enough to bleed it into the crop, found
    // live against a real cover whose spine title text sits centered in the
    // gap (2026-11-09, latest). The real spine gap is only consulted as a
    // hard ceiling, for the rare pathological case where the spine itself
    // is narrower than the fixed cushion -- never as the thing being
    // equalized toward.
    const innerCushion = Math.round(image.width * INNER_BORDER_CUSHION_FRACTION);
    const spineGap = backBorder && frontBorder ? frontBorder.left.start - backBorder.right.end : null;
    const backInnerBudget = spineGap != null ? Math.min(innerCushion, Math.floor(spineGap / 2)) : innerCushion;
    const frontInnerBudget = spineGap != null ? Math.min(innerCushion, Math.ceil(spineGap / 2)) : innerCushion;

    const backHorizontal = backBorder
      ? toTopBottom(findHorizontalBorderClusters(fullRaw, image.width, image.height, backBorder.left.end + 1, backBorder.right.start))
      : null;
    const frontHorizontal = frontBorder
      ? toTopBottom(findHorizontalBorderClusters(fullRaw, image.width, image.height, frontBorder.left.end + 1, frontBorder.right.start))
      : null;

    const backBounds: CropBounds = backBorder
      ? equalizeHalfBorder(backBorder, backHorizontal, image.width, image.height, false, backInnerBudget)
      : { x0: 0, y0: 0, x1: Math.max(1, midpoint - fallbackMargin), y1: image.height };
    const frontBounds: CropBounds = frontBorder
      ? equalizeHalfBorder(frontBorder, frontHorizontal, image.width, image.height, true, frontInnerBudget)
      : { x0: Math.min(image.width - 1, midpoint + fallbackMargin), y0: 0, x1: image.width, y1: image.height };

    // Defensive: the two crops must never overlap (or touch) along the x
    // axis, regardless of how narrow a real spine turns out to be relative
    // to the margins computed above -- split whatever gap is left right
    // down the middle instead. (The two halves' y-axis crops are
    // independent of each other and can never overlap this way.)
    let backCropEnd = backBounds.x1;
    let frontCropStart = frontBounds.x0;
    if (frontCropStart <= backCropEnd) {
      const splitPoint = Math.floor((backCropEnd + frontCropStart) / 2);
      backCropEnd = splitPoint;
      frontCropStart = splitPoint + 1;
    }

    const backImage = crop(photonImage, backBounds.x0, backBounds.y0, backCropEnd, backBounds.y1);
    const frontImage = crop(photonImage, frontCropStart, frontBounds.y0, frontBounds.x1, frontBounds.y1);

    try {
      return {
        back: backImage.get_bytes_jpeg(90),
        front: frontImage.get_bytes_jpeg(90),
        backWidth: backImage.get_width(),
        backHeight: backImage.get_height(),
        frontWidth: frontImage.get_width(),
        frontHeight: frontImage.get_height(),
      };
    } finally {
      backImage.free();
      frontImage.free();
    }
  } finally {
    photonImage.free();
  }
}

/** `findHorizontalBorderClusters`'s first and last cluster as {top, bottom}, or null when fewer than 2 were found. */
function toTopBottom(clusters: BorderCluster[]): { top: BorderCluster; bottom: BorderCluster } | null {
  return clusters.length >= 2 ? { top: clusters[0]!, bottom: clusters[clusters.length - 1]! } : null;
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
