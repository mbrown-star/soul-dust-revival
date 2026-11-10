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

  return `https://${streamCustomerHost(process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE!)}/${token}/manifest/video.m3u8`;
}

/**
 * The account's Stream playback host. The dashboard shows it as a whole
 * host ("customer-abc123.cloudflarestream.com"), and the env var has been
 * set that way, which once produced "...cloudflarestream.com.cloudflarestream.com"
 * -- so accept the bare code, "customer-<code>", or the full host.
 */
export function streamCustomerHost(customerCode: string): string {
  const code = customerCode
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.cloudflarestream\.com$/, "")
    .replace(/^customer-/, "");
  return `customer-${code}.cloudflarestream.com`;
}
