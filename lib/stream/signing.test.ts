import crypto from "crypto";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSignedStreamUrl, streamCustomerHost } from "./signing";

describe("streamCustomerHost", () => {
  it.each([
    "abc123",
    "customer-abc123",
    "customer-abc123.cloudflarestream.com",
    "abc123.cloudflarestream.com",
    "https://customer-abc123.cloudflarestream.com/",
    " customer-abc123.cloudflarestream.com\n",
  ])("normalizes %j to the one playback host", (value) => {
    expect(streamCustomerHost(value)).toBe("customer-abc123.cloudflarestream.com");
  });
});

describe("generateSignedStreamUrl", () => {
  let publicKey: string;
  const ENV_KEYS = [
    "CLOUDFLARE_STREAM_KEY_ID",
    "CLOUDFLARE_STREAM_CUSTOMER_CODE",
    "CLOUDFLARE_STREAM_SIGNING_KEY",
  ] as const;
  const originals: Record<(typeof ENV_KEYS)[number], string | undefined> = {
    CLOUDFLARE_STREAM_KEY_ID: undefined,
    CLOUDFLARE_STREAM_CUSTOMER_CODE: undefined,
    CLOUDFLARE_STREAM_SIGNING_KEY: undefined,
  };

  beforeAll(() => {
    const { publicKey: pub, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKey = pub;

    for (const key of ENV_KEYS) {
      originals[key] = process.env[key];
    }
    process.env.CLOUDFLARE_STREAM_KEY_ID = "test-key-id";
    process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = "testcustomer";
    process.env.CLOUDFLARE_STREAM_SIGNING_KEY = Buffer.from(privateKey, "utf-8").toString("base64");
  });

  // Restores the real values -- a shared vitest worker can run another test
  // file afterward, and it must not silently see this suite's throwaway key.
  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  });

  it("produces a URL in the expected Cloudflare Stream manifest shape", () => {
    const url = generateSignedStreamUrl("media-id-123");
    expect(url).toMatch(
      /^https:\/\/customer-testcustomer\.cloudflarestream\.com\/.+\/manifest\/video\.m3u8$/
    );
  });

  it("embeds a JWT that verifies against the matching public key", () => {
    const url = generateSignedStreamUrl("media-id-123");
    const token = url.split("/")[3]!;
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as jwt.JwtPayload;
    expect(decoded.sub).toBe("media-id-123");
    expect(decoded.kid).toBe("test-key-id");
  });

  it("sets an expiry roughly one hour out", () => {
    const url = generateSignedStreamUrl("media-id-123");
    const token = url.split("/")[3]!;
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as jwt.JwtPayload;
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(decoded.exp).toBeGreaterThan(nowSeconds + 60 * 59);
    expect(decoded.exp).toBeLessThanOrEqual(nowSeconds + 60 * 60 + 5);
  });

  it("scopes the token to the requested media id only", () => {
    const urlA = generateSignedStreamUrl("media-a");
    const urlB = generateSignedStreamUrl("media-b");
    const tokenA = urlA.split("/")[3]!;
    const decodedA = jwt.verify(tokenA, publicKey, { algorithms: ["RS256"] }) as jwt.JwtPayload;
    expect(decodedA.sub).not.toBe("media-b");
    expect(urlA).not.toBe(urlB);
  });

  it("fails verification against a different key pair (not signable by an attacker without the private key)", () => {
    const { publicKey: otherPublicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const url = generateSignedStreamUrl("media-id-123");
    const token = url.split("/")[3]!;
    expect(() => jwt.verify(token, otherPublicKey, { algorithms: ["RS256"] })).toThrow();
  });
});
