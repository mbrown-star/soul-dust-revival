/**
 * Reserves a resumable (tus) upload in Cloudflare Stream for one file.
 * The admin's browser then sends the file straight to the returned one-time
 * URL in chunks -- the bytes never pass through our server -- and can pick
 * up where it left off after a dropped connection (see
 * components/admin/builder/tusUpload.ts). tus is required above 200 MB and
 * recommended for any upload over an unreliable connection.
 * https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/#direct-creator-uploads-with-tus-protocol
 */

/** Longest video/audio an upload may be (reserved against Stream storage until processed). */
export const STREAM_MAX_DURATION_SECONDS = 4 * 60 * 60;
/** How long the one-time upload URL stays valid -- room for a large file on a slow connection. */
export const STREAM_UPLOAD_EXPIRY_HOURS = 6;

const b64 = (value: string) => Buffer.from(value, "utf-8").toString("base64");

export async function createStreamTusUpload({ size, name }: { size: number; name: string }) {
  const expiry = new Date(Date.now() + STREAM_UPLOAD_EXPIRY_HOURS * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  // tus Upload-Metadata: comma-separated "key base64(value)" pairs; a bare
  // key is a flag. `requiresignedurls` matches the signed playback in
  // lib/stream/signing.ts.
  const metadata = [
    `maxDurationSeconds ${b64(String(STREAM_MAX_DURATION_SECONDS))}`,
    "requiresignedurls",
    `expiry ${b64(expiry)}`,
    `name ${b64(name)}`,
  ].join(",");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(size),
        "Upload-Metadata": metadata,
      },
    }
  );

  const uploadUrl = res.headers.get("Location");
  const uid = res.headers.get("stream-media-id");
  if (res.status !== 201 || !uploadUrl || !uid) {
    throw new Error(`Stream didn't create the upload (HTTP ${res.status}).`);
  }
  return { uploadUrl, uid }; // uid becomes the block's mediaId
}
