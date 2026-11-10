import { PhotonImage, crop } from "@cf-wasm/photon";
import { computeCoverCrops, extractCoverImage, type CoverSplitMethod, type TrimSpec } from "./bookCover";

// Node only (the reprocess script and tests) -- never the Workers runtime,
// whose 128MB-per-isolate memory ceiling can't hold a 300ppi cover. Real
// 300ppi KDP covers run 11-18 megapixels; this leaves headroom while still
// rejecting an absurd file.
const NODE_MAX_PIXELS = 80_000_000;

/**
 * Splits a full-wrap book cover PDF into back and front cover JPEGs using
 * the same crop decisions the admin's browser makes on upload
 * (computeCoverCrops), so reprocessing a stored cover reproduces exactly
 * what a fresh upload would.
 */
export async function splitBookCoverPdf(
  pdfBytes: Uint8Array,
  maxPixels: number = NODE_MAX_PIXELS
): Promise<{
  back: Uint8Array;
  front: Uint8Array;
  backWidth: number;
  backHeight: number;
  frontWidth: number;
  frontHeight: number;
  method: CoverSplitMethod;
  trim: TrimSpec["name"] | null;
}> {
  const cover = await extractCoverImage(pdfBytes, maxPixels);
  const { back, front, method, trim } = computeCoverCrops(cover);

  const photonImage = new PhotonImage(cover.rgba, cover.width, cover.height);
  try {
    const backImage = crop(photonImage, back.x0, back.y0, back.x1, back.y1);
    const frontImage = crop(photonImage, front.x0, front.y0, front.x1, front.y1);
    try {
      return {
        back: backImage.get_bytes_jpeg(90),
        front: frontImage.get_bytes_jpeg(90),
        backWidth: backImage.get_width(),
        backHeight: backImage.get_height(),
        frontWidth: frontImage.get_width(),
        frontHeight: frontImage.get_height(),
        method,
        trim,
      };
    } finally {
      backImage.free();
      frontImage.free();
    }
  } finally {
    photonImage.free();
  }
}
