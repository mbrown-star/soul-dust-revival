import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET, r2PublicUrl, IMMUTABLE_CACHE_CONTROL } from "./client";

/**
 * Generates a short-lived presigned PUT URL so the admin UI can upload
 * product images directly from the browser to R2, without routing the
 * file bytes through our own server.
 *
 * CacheControl is part of the signed request (same as ContentType already
 * was), so the browser's PUT must send a matching Cache-Control header or
 * R2 will reject the upload with a signature mismatch -- every caller of
 * this endpoint's uploadUrl must send IMMUTABLE_CACHE_CONTROL alongside it.
 */
export async function createPresignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
    CacheControl: IMMUTABLE_CACHE_CONTROL,
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 minutes

  return {
    uploadUrl,
    publicUrl: r2PublicUrl(key),
  };
}
