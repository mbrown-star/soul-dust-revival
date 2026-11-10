import { computeCoverCrops, extractCoverImage, type CoverCrops, type CropBounds } from "./bookCover";

// A 300ppi KDP cover is 11-18 megapixels (~72MB of RGBA for an 8.5x11 full
// wrap) -- comfortably within a desktop browser tab, which is why the split
// runs here rather than on a Workers isolate capped at 128MB. Still bounded,
// so a pathological file fails with a clear message instead of hanging the tab.
const BROWSER_MAX_PIXELS = 40_000_000;
const JPEG_QUALITY = 0.9;

export type BrowserCoverSplit = {
  back: Blob;
  front: Blob;
  backWidth: number;
  backHeight: number;
  frontWidth: number;
  frontHeight: number;
  method: CoverCrops["method"];
  trim: CoverCrops["trim"];
};

/**
 * Draws one crop of the full cover onto a canvas only that crop's size
 * (never a full-wrap-sized canvas, which can exceed Safari's ~16.7MP canvas
 * limit on an 8.5x11 cover) and encodes it as a JPEG.
 */
function cropToJpeg(full: ImageData, bounds: CropBounds): Promise<Blob> {
  const width = bounds.x1 - bounds.x0;
  const height = bounds.y1 - bounds.y0;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("This browser can't process images."));
  ctx.putImageData(full, -bounds.x0, -bounds.y0, bounds.x0, bounds.y0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the cover image."))),
      "image/jpeg",
      JPEG_QUALITY
    )
  );
}

/**
 * The browser counterpart of splitBookCoverPdf: identical crop decisions
 * (computeCoverCrops), encoded with a canvas instead of Photon.
 */
export async function splitBookCoverInBrowser(pdfBytes: Uint8Array): Promise<BrowserCoverSplit> {
  const cover = await extractCoverImage(pdfBytes, BROWSER_MAX_PIXELS);
  const { back, front, method, trim } = computeCoverCrops(cover);
  const full = new ImageData(
    new Uint8ClampedArray(cover.rgba.buffer as ArrayBuffer, cover.rgba.byteOffset, cover.rgba.byteLength),
    cover.width,
    cover.height
  );
  const [backBlob, frontBlob] = await Promise.all([cropToJpeg(full, back), cropToJpeg(full, front)]);
  return {
    back: backBlob,
    front: frontBlob,
    backWidth: back.x1 - back.x0,
    backHeight: back.y1 - back.y0,
    frontWidth: front.x1 - front.x0,
    frontHeight: front.y1 - front.y0,
    method,
    trim,
  };
}
