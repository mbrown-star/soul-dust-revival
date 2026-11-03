import jwt from "jsonwebtoken";

/**
 * Generates a signed Cloudflare Stream playback token.
 * Requires the video to be uploaded with "requireSignedURLs: true".
 * See: https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
 */
export function generateSignedStreamUrl(mediaId: string): string {
  const keyId = process.env.CLOUDFLARE_STREAM_KEY_ID!;
  // Cloudflare's /stream/keys endpoint returns the private key base64-encoded
  // (see link above); storing it that way in the env var also avoids the
  // fragility of a multi-line PEM surviving .env parsing across Next.js,
  // Node's loadEnvFile, and vitest without being silently mangled.
  const pem = Buffer.from(process.env.CLOUDFLARE_STREAM_SIGNING_KEY!, "base64").toString("utf-8");

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
