import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET, r2PublicUrl } from "./client";

/**
 * Generates a short-lived presigned PUT URL so the admin UI can upload
 * product images directly from the browser to R2, without routing the
 * file bytes through our own server.
 */
export async function createPresignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 minutes

  return {
    uploadUrl,
    publicUrl: r2PublicUrl(key),
  };
}
