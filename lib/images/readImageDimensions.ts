/**
 * Browser-only: reads an image File's real pixel dimensions before upload,
 * via a throwaway object URL and the browser's own decoder -- used by the
 * plain (non-PDF-split) product/bundle cover upload paths, which otherwise
 * have no server-side decode step to read this from (the file goes straight
 * to R2 via a presigned PUT). See lib/db/schema.ts's imageWidth/imageHeight
 * comment for why this matters: without it, the storefront has no way to
 * render the image at its own true aspect ratio.
 */
export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this file as an image."));
    };
    img.src = url;
  });
}
