import { describe, expect, it, vi } from "vitest";

const getSignedUrlMock = vi.fn().mockResolvedValue("https://r2.example.com/signed-put-url");
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock("./client", () => ({
  r2: {},
  R2_BUCKET: "test-bucket",
  r2PublicUrl: (key: string) => `https://assets.example.com/${key}`,
  IMMUTABLE_CACHE_CONTROL: "public, max-age=31536000, immutable",
}));

const { createPresignedUploadUrl } = await import("./upload");

describe("createPresignedUploadUrl", () => {
  it("signs the PUT with an immutable Cache-Control alongside the content type", async () => {
    const result = await createPresignedUploadUrl("products/abc.jpg", "image/jpeg");

    expect(result).toEqual({
      uploadUrl: "https://r2.example.com/signed-put-url",
      publicUrl: "https://assets.example.com/products/abc.jpg",
    });

    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const [, command, options] = getSignedUrlMock.mock.calls[0]!;
    expect(command.input).toMatchObject({
      Bucket: "test-bucket",
      Key: "products/abc.jpg",
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    });
    expect(options).toEqual({ expiresIn: 300 });
  });
});
