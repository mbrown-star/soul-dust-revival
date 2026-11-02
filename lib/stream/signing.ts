import jwt from "jsonwebtoken";

/**
 * Generates a signed Cloudflare Stream playback token.
 * Requires the video to be uploaded with "requireSignedURLs: true".
 * See: https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
 */
export function generateSignedStreamUrl(mediaId: string): string {
  const keyId = process.env.CLOUDFLARE_STREAM_KEY_ID!;
  const pem = process.env.CLOUDFLARE_STREAM_SIGNING_KEY!; // PEM private key

  const token = jwt.sign(
    {
      sub: mediaId,
      kid: keyId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiry
    },
    pem,
    { algorithm: "RS256" }
  );

  return `https://customer-${process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${token}/manifest/video.m3u8`;
}
