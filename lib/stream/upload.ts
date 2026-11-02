/**
 * Requests a one-time direct upload URL from Cloudflare Stream.
 * The admin UI uploads the file straight to this URL — the bytes never
 * pass through our own server. `requireSignedURLs: true` matches the
 * signed-playback setup in lib/stream/signing.ts.
 * https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 */
export async function createStreamDirectUploadUrl() {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxDurationSeconds: 3600,
        requireSignedURLs: true,
      }),
    }
  );

  const data = await res.json();
  if (!data.success) throw new Error("Failed to create Stream upload URL");

  return {
    uploadUrl: data.result.uploadURL as string,
    uid: data.result.uid as string, // this becomes contentBlocks.mediaId
  };
}
