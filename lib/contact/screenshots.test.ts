import { describe, expect, it } from "vitest";
import { detectScreenshotType, screenshotLimitsMessage } from "./screenshots";

const MB = 1024 * 1024;

describe("detectScreenshotType", () => {
  it.each([
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0], "png"],
    [[0xff, 0xd8, 0xff, 0xdb], "jpeg"],
    [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "gif"],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "webp"],
  ])("recognizes %j as %s", (bytes, type) => {
    expect(detectScreenshotType(new Uint8Array(bytes))).toBe(type);
  });

  it.each([
    ["an SVG", new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")],
    ["a RIFF that isn't WebP", new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])],
    ["a PDF", new TextEncoder().encode("%PDF-1.7")],
    ["an empty file", new Uint8Array()],
    ["a truncated PNG signature", new Uint8Array([0x89, 0x50, 0x4e])],
  ])("refuses %s", (_label, bytes) => {
    expect(detectScreenshotType(bytes)).toBeNull();
  });
});

describe("screenshotLimitsMessage", () => {
  it("accepts none, or five within the caps", () => {
    expect(screenshotLimitsMessage([])).toBeNull();
    expect(screenshotLimitsMessage(Array(5).fill({ size: 4 * MB }))).toBeNull();
  });

  it("refuses too many, too large, empty, or too much in total", () => {
    expect(screenshotLimitsMessage(Array(6).fill({ size: 1 }))).toMatch(/up to 5/);
    expect(screenshotLimitsMessage([{ size: 10 * MB + 1 }])).toMatch(/10 MB/);
    expect(screenshotLimitsMessage([{ size: 0 }])).toMatch(/empty/);
    expect(screenshotLimitsMessage(Array(3).fill({ size: 7 * MB }))).toMatch(/total up to 20 MB/);
  });
});
