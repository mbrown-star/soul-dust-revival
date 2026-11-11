import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "./client";

/** How long a download link works. Long enough to start, short enough not to share. */
export const DOWNLOAD_LINK_SECONDS = 300;

/**
 * A short-lived signed GET for a private file, saved under `fileName` rather
 * than its storage key. Used for gated downloads (study resources), where the
 * key itself is never sent to the browser.
 */
export async function createSignedDownloadUrl(key: string, fileName: string, contentType: string): Promise<string> {
  // The plain filename= part is the ASCII fallback; filename* carries the real
  // name for any browser that understands RFC 6266.
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  });
  return getSignedUrl(r2, command, { expiresIn: DOWNLOAD_LINK_SECONDS });
}
