import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./tokenCipher";

describe("tokenCipher", () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  });

  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it("round-trips a plaintext token", () => {
    const plaintext = "oauth-access-token-abc123";
    const encrypted = encryptToken(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    const encrypted = encryptToken("");
    expect(decryptToken(encrypted)).toBe("");
  });

  it("round-trips unicode content", () => {
    const plaintext = "token-with-emoji-🔐-and-ünïcödé";
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("never stores the plaintext in the ciphertext string", () => {
    const plaintext = "super-secret-value";
    expect(encryptToken(plaintext)).not.toContain(plaintext);
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const plaintext = "same-input";
    expect(encryptToken(plaintext)).not.toBe(encryptToken(plaintext));
  });

  it("stores iv:authTag:data as three base64 segments", () => {
    const parts = encryptToken("x").split(":");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
    }
  });

  it("throws on tampered ciphertext (authenticated encryption detects modification)", () => {
    const encrypted = encryptToken("sensitive-token");
    const [iv, authTag, data] = encrypted.split(":");
    const tamperedData = Buffer.from(data!, "base64");
    tamperedData[0] = tamperedData[0]! ^ 0xff;
    const tampered = [iv, authTag, tamperedData.toString("base64")].join(":");
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws on a malformed stored value missing segments", () => {
    expect(() => decryptToken("only-one-segment")).toThrow(/Malformed encrypted token/);
    expect(() => decryptToken("two:segments")).toThrow(/Malformed encrypted token/);
  });

  it("throws the deliberate error (not a raw crypto error) on an empty iv or authTag segment", () => {
    expect(() => decryptToken("::c3RvcmVk")).toThrow(/Malformed encrypted token/);
    const validData = encryptToken("x").split(":")[2];
    expect(() => decryptToken(`aXY=::${validData}`)).toThrow(/Malformed encrypted token/);
  });

  it("fails to decrypt with the wrong key", () => {
    const encrypted = encryptToken("token-for-key-one");
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    expect(() => decryptToken(encrypted)).toThrow();
  });

  it("throws when TOKEN_ENCRYPTION_KEY is not set", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow("TOKEN_ENCRYPTION_KEY is not set");
  });

  it("throws when TOKEN_ENCRYPTION_KEY does not decode to 32 bytes", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptToken("x")).toThrow("must decode to exactly 32 bytes");
  });
});
