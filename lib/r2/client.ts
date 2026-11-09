import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 is S3-compatible, so the standard AWS SDK works against it —
 * just point the endpoint at your R2 account and use R2 API tokens as credentials.
 */
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;

// Re-exported for convenience in server-only files that already import from
// here -- see lib/r2/cacheControl.ts for why it lives in its own module.
export { IMMUTABLE_CACHE_CONTROL } from "./cacheControl";

/**
 * Public URL for an object, assuming the bucket is connected to a
 * Cloudflare R2 public bucket domain or a custom domain via R2's public access.
 */
export function r2PublicUrl(key: string): string {
  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}
