import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
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
 *
 * ContentLength is signed too: R2 refuses a body of any other size (checked
 * against the real bucket: a link signed for 100 bytes rejected 99, 101 and
 * 5,000 with 403). That's what makes the per-route size caps real -- the
 * route validates `size` against its cap, and the link only takes that size.
 * Browsers set Content-Length from the body themselves, so callers don't.
 */
export async function createPresignedUploadUrl(key: string, contentType: string, size: number) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
    CacheControl: IMMUTABLE_CACHE_CONTROL,
    ContentLength: size,
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 minutes

  return {
    uploadUrl,
    publicUrl: r2PublicUrl(key),
  };
}

/**
 * The 400 every upload-link route returns for bad input. A file over the
 * route's cap gets that cap in `message`, which the admin UI shows as-is.
 */
export function invalidUploadResponse(error: ZodError) {
  const tooBig = error.issues.find((issue) => issue.code === "too_big");
  return NextResponse.json(
    {
      error: "invalid_input",
      message: tooBig?.message ?? "This file can't be uploaded here.",
      details: error.flatten(),
    },
    { status: 400 }
  );
}
