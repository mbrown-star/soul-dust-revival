// The book-cover crop logic, shared by the admin's browser (which does the
// real uploads -- see splitBookCoverInBrowser.ts) and Node (the reprocess
// script and tests -- see splitBookCoverPdf.ts). Deliberately free of any
// image-encoding dependency so both can import it: it only extracts the
// embedded cover bitmap from the PDF and decides where to crop.
import { extractImages, getDocumentProxy } from "unpdf";

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

// The KDP trim sizes this project's covers are built on, with each one's
// exact gap from the trim line to the border's OUTER gold line, per the
// design-system cover build (confirmed 2026-11-10). The box isn't centered
// left-to-right in the source -- the spine-side gap is wider by exactly the
// bleed, a quirk of that build script -- which doesn't matter here, since
// the crop is drawn around the box itself, not around the trim panel.
export type TrimSpec = {
  name: "6x9" | "8.5x11";
  trimWidthIn: number;
  trimHeightIn: number;
  foreEdgeGapIn: number;
  spineGapIn: number;
  topGapIn: number;
  bottomGapIn: number;
};

export const KNOWN_TRIMS: readonly TrimSpec[] = [
  { name: "6x9", trimWidthIn: 6, trimHeightIn: 9, foreEdgeGapIn: 0.3, spineGapIn: 0.43, topGapIn: 0.475, bottomGapIn: 0.475 },
  { name: "8.5x11", trimWidthIn: 8.5, trimHeightIn: 11, foreEdgeGapIn: 0.475, spineGapIn: 0.6, topGapIn: 0.605, bottomGapIn: 0.605 },
];

// KDP's full-wrap cover template adds this bleed on every outer edge (not
// the spine), so a cover page is (trim height + 2 x bleed) tall.
const KDP_BLEED_IN = 0.125;
// The fixed margin kept outside the border's outer line on all four sides,
// identical on every cover. Smaller than the narrowest real gap (0.30in,
// 6x9 fore-edge), so it can never reach the spine or past the trim.
export const DISPLAY_MARGIN_IN = 0.15;
const PAGE_HEIGHT_MATCH_TOLERANCE_IN = 0.02;
// The embedded image must span the whole page for page inches to map onto
// image pixels -- checked by requiring the same pixels-per-inch on both axes.
const SCALE_MATCH_TOLERANCE = 0.005;
// How far a detected border line may sit from where the trim geometry says
// it should be and still be trusted over the geometry.
const EDGE_SNAP_TOLERANCE_IN = 0.08;
// Columns/rows this far inside the box are sampled when looking for its
// top/bottom lines, clear of the box's own vertical double lines.
const HORIZONTAL_SCAN_INSET_IN = 0.25;

export type CoverSplitMethod = "trim-geometry" | "border-detection" | "midpoint-fallback";

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

export type CropBounds = { x0: number; y0: number; x1: number; y1: number };

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
    // policy (see detectedBorderBounds) -- nothing further to cap it by here.
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

/** The known trim whose page height (trim + bleed) matches this page, or null. */
function matchKnownTrim(pageWidthIn: number, pageHeightIn: number): TrimSpec | null {
  return (
    KNOWN_TRIMS.find(
      (t) =>
        Math.abs(pageHeightIn - (t.trimHeightIn + 2 * KDP_BLEED_IN)) <= PAGE_HEIGHT_MATCH_TOLERANCE_IN &&
        pageWidthIn >= 2 * t.trimWidthIn + 2 * KDP_BLEED_IN
    ) ?? null
  );
}

/** The cluster edge nearest `expected` within `tolerance`, else `expected` itself. */
function snapEdge(expected: number, clusters: BorderCluster[], side: "start" | "end", tolerance: number): number {
  let best = expected;
  let bestDistance = Infinity;
  for (const c of clusters) {
    const distance = Math.abs(c[side] - expected);
    if (distance <= tolerance && distance < bestDistance) {
      best = c[side];
      bestDistance = distance;
    }
  }
  return best;
}

type SplitBounds = { back: CropBounds; front: CropBounds };

/**
 * The primary path, for a cover built on one of KNOWN_TRIMS: the page size
 * identifies the trim, the image's pixels-per-inch maps the known border
 * positions onto exact pixels, each edge is snapped onto the real line found
 * in the art when one sits close enough (guarding against rounding in the
 * spec figures), and the crop is the border's outer line plus exactly
 * DISPLAY_MARGIN_IN on every side. Every cover of a given trim therefore
 * comes out the same shape with the same margin. Returns null when the page
 * isn't a known trim or the image doesn't span the page, so the caller falls
 * back to pure border detection.
 */
function trimGeometryBounds(
  rawPixels: Uint8Array,
  width: number,
  height: number,
  pageWidthIn: number,
  pageHeightIn: number,
  verticalClusters: BorderCluster[]
): (SplitBounds & { trim: TrimSpec["name"] }) | null {
  const trim = matchKnownTrim(pageWidthIn, pageHeightIn);
  if (!trim) return null;

  const ppiX = width / pageWidthIn;
  const ppiY = height / pageHeightIn;
  if (Math.abs(ppiX - ppiY) / ppiY > SCALE_MATCH_TOLERANCE) return null;

  const toX = (inches: number) => Math.round(inches * ppiX);
  const toY = (inches: number) => Math.round(inches * ppiY);
  const snapX = EDGE_SNAP_TOLERANCE_IN * ppiX;
  const snapY = EDGE_SNAP_TOLERANCE_IN * ppiY;
  const marginX = toX(DISPLAY_MARGIN_IN);
  const marginY = toY(DISPLAY_MARGIN_IN);

  const expectedTop = toY(KDP_BLEED_IN + trim.topGapIn);
  const expectedBottom = toY(KDP_BLEED_IN + trim.trimHeightIn - trim.bottomGapIn) - 1;

  const panel = (expectedLeft: number, expectedRight: number): CropBounds => {
    const left = snapEdge(expectedLeft, verticalClusters, "start", snapX);
    const right = snapEdge(expectedRight, verticalClusters, "end", snapX);
    const inset = toX(HORIZONTAL_SCAN_INSET_IN);
    const horizontal = findHorizontalBorderClusters(rawPixels, width, height, left + inset, right - inset);
    const top = snapEdge(expectedTop, horizontal, "start", snapY);
    const bottom = snapEdge(expectedBottom, horizontal, "end", snapY);
    return {
      x0: Math.max(0, left - marginX),
      y0: Math.max(0, top - marginY),
      x1: Math.min(width, right + marginX + 1),
      y1: Math.min(height, bottom + marginY + 1),
    };
  };

  // Back cover: fore-edge on its left, spine on its right. Front cover: the
  // mirror image, measured in from the page's right edge so the (unknown,
  // page-count-dependent) spine width never enters the calculation.
  const back = panel(
    toX(KDP_BLEED_IN + trim.foreEdgeGapIn),
    toX(KDP_BLEED_IN + trim.trimWidthIn - trim.spineGapIn) - 1
  );
  const front = panel(
    toX(pageWidthIn - KDP_BLEED_IN - trim.trimWidthIn + trim.spineGapIn),
    toX(pageWidthIn - KDP_BLEED_IN - trim.foreEdgeGapIn) - 1
  );
  return { back, front, trim: trim.name };
}

/**
 * The fallback path, for a cover on an unrecognized page size: finds each
 * half's double-line border purely from the art and equalizes its margin
 * (equalizeHalfBorder), or falls back further to a plain spine-margin split
 * when a half's border can't be found at all.
 */
function detectedBorderBounds(
  rawPixels: Uint8Array,
  width: number,
  height: number,
  verticalClusters: BorderCluster[]
): SplitBounds & { method: CoverSplitMethod } {
  const { back: backBorder, front: frontBorder } = findHalfBorders(verticalClusters, width);

  const midpoint = Math.floor(width / 2);
  const fallbackMargin = Math.round(width * SPINE_MARGIN_FRACTION);

  // The spine-facing side's margin budget: the small, fixed cushion
  // (INNER_BORDER_CUSHION_FRACTION) is the PREFERRED value here, not half
  // the real spine gap -- there's no way to know where the spine's own
  // content (e.g. a rotated title) actually sits within that gap, so using
  // up to half of it as a target (rather than just a safety ceiling) risks
  // bleeding it into the crop (found live against "Revive Me", 2026-11-09).
  const innerCushion = Math.round(width * INNER_BORDER_CUSHION_FRACTION);
  const spineGap = backBorder && frontBorder ? frontBorder.left.start - backBorder.right.end : null;
  const backInnerBudget = spineGap != null ? Math.min(innerCushion, Math.floor(spineGap / 2)) : innerCushion;
  const frontInnerBudget = spineGap != null ? Math.min(innerCushion, Math.ceil(spineGap / 2)) : innerCushion;

  const backHorizontal = backBorder
    ? toTopBottom(findHorizontalBorderClusters(rawPixels, width, height, backBorder.left.end + 1, backBorder.right.start))
    : null;
  const frontHorizontal = frontBorder
    ? toTopBottom(findHorizontalBorderClusters(rawPixels, width, height, frontBorder.left.end + 1, frontBorder.right.start))
    : null;

  return {
    back: backBorder
      ? equalizeHalfBorder(backBorder, backHorizontal, width, height, false, backInnerBudget)
      : { x0: 0, y0: 0, x1: Math.max(1, midpoint - fallbackMargin), y1: height },
    front: frontBorder
      ? equalizeHalfBorder(frontBorder, frontHorizontal, width, height, true, frontInnerBudget)
      : { x0: Math.min(width - 1, midpoint + fallbackMargin), y0: 0, x1: width, y1: height },
    method: backBorder && frontBorder ? "border-detection" : "midpoint-fallback",
  };
}

export type CoverImage = {
  rgba: Uint8Array;
  width: number;
  height: number;
  pageWidthIn: number;
  pageHeightIn: number;
};

/**
 * Extracts the flattened cover bitmap from a full-wrap KDP cover PDF (back
 * cover + spine + front cover on one page) as RGBA pixels, plus the page's
 * physical size, which computeCoverCrops needs to recognize the trim.
 *
 * Security note: a malicious PDF could declare an embedded image's pixel
 * dimensions far larger than its physical page (the image XObject's own
 * /Width and /Height drive how much pdf.js decodes), forcing a large
 * allocation inside extractImages() before the `maxPixels` check here runs.
 * MAX_PAGE_POINTS_PER_SIDE only rules out an absurdly large physical page.
 * Only admins can upload a cover PDF, and the upload runs in their own
 * browser tab, so the worst case is crashing that tab.
 */
export async function extractCoverImage(pdfBytes: Uint8Array, maxPixels: number): Promise<CoverImage> {
  // In a browser, pdf.js would otherwise hand decoded images back as
  // ImageBitmaps rather than raw pixels, which extractImages() skips --
  // turning these off makes the browser decode exactly as Node does.
  const pdf = await getDocumentProxy(pdfBytes, { isOffscreenCanvasSupported: false, isImageDecoderSupported: false });
  const page = await pdf.getPage(1);
  // page.view is always a 4-element [x1,y1,x2,y2] tuple per pdf.js's own
  // contract; TS just types it as number[] since it comes from a JS lib.
  const [x1, y1, x2, y2] = page.view as [number, number, number, number];
  const pageWidthPoints = Math.abs(x2 - x1);
  const pageHeightPoints = Math.abs(y2 - y1);
  if (pageWidthPoints > MAX_PAGE_POINTS_PER_SIDE || pageHeightPoints > MAX_PAGE_POINTS_PER_SIDE) {
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
      `This cover image is too high-resolution to process (${image.width}x${image.height}). Please re-export it at a lower resolution.`
    );
  }

  return {
    rgba: toRgba(image.data, image.channels, image.width, image.height),
    width: image.width,
    height: image.height,
    pageWidthIn: pageWidthPoints / 72,
    pageHeightIn: pageHeightPoints / 72,
  };
}

export type CoverCrops = {
  back: CropBounds;
  front: CropBounds;
  method: CoverSplitMethod;
  trim: TrimSpec["name"] | null;
};

/**
 * Decides where to cut the back and front covers out of a full-wrap cover,
 * so each shows its double-line border box with an equal margin all the
 * way around. Bounds are pixel rectangles, x0/y0 inclusive and x1/y1
 * exclusive.
 *
 * A cover on one of KNOWN_TRIMS (identified from the page size) is cropped
 * from that trim's exact border geometry (trimGeometryBounds) -- same shape
 * and same physical margin for every cover of that trim. Anything else falls
 * back to detecting the border from the art alone (detectedBorderBounds).
 * Either way the two crops are clamped so they can never overlap, even on
 * an unusually narrow spine.
 */
export function computeCoverCrops(cover: CoverImage): CoverCrops {
  const { rgba, width, height, pageWidthIn, pageHeightIn } = cover;
  const clusters = findVerticalBorderClusters(rgba, width, height);
  const geometry = trimGeometryBounds(rgba, width, height, pageWidthIn, pageHeightIn, clusters);
  const { back, front, method, trim } = geometry
    ? { ...geometry, method: "trim-geometry" as const }
    : { ...detectedBorderBounds(rgba, width, height, clusters), trim: null };

  // The two halves' y-axis crops are independent and can't overlap; along x,
  // split whatever gap is left down the middle if they'd touch.
  if (front.x0 <= back.x1) {
    const splitPoint = Math.floor((back.x1 + front.x0) / 2);
    return { back: { ...back, x1: splitPoint }, front: { ...front, x0: splitPoint + 1 }, method, trim };
  }
  return { back, front, method, trim };
}

/** `findHorizontalBorderClusters`'s first and last cluster as {top, bottom}, or null when fewer than 2 were found. */
function toTopBottom(clusters: BorderCluster[]): { top: BorderCluster; bottom: BorderCluster } | null {
  return clusters.length >= 2 ? { top: clusters[0]!, bottom: clusters[clusters.length - 1]! } : null;
}

/**
 * Both encoders (Photon in Node, canvas ImageData in the browser) and the
 * border scan here expect 4-channel (RGBA) pixels; unpdf can hand back 1
 * (grayscale), 3 (RGB), or 4 channels depending on the embedded image's
 * color space, so grayscale/RGB need expanding first.
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
