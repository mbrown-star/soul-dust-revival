import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it("accepts a plain relative path", () => {
    expect(safeRedirectPath("/library", "/fallback")).toBe("/library");
    expect(safeRedirectPath("/admin/products", "/fallback")).toBe("/admin/products");
  });

  it("falls back for undefined or empty", () => {
    expect(safeRedirectPath(undefined, "/fallback")).toBe("/fallback");
    expect(safeRedirectPath("", "/fallback")).toBe("/fallback");
  });

  it("rejects an absolute URL to another host", () => {
    expect(safeRedirectPath("https://evil.com", "/fallback")).toBe("/fallback");
    expect(safeRedirectPath("http://evil.com/phish", "/fallback")).toBe("/fallback");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirectPath("//evil.com", "/fallback")).toBe("/fallback");
    expect(safeRedirectPath("/\\evil.com", "/fallback")).toBe("/fallback");
  });

  it("rejects a value not starting with a single slash", () => {
    expect(safeRedirectPath("library", "/fallback")).toBe("/fallback");
    expect(safeRedirectPath("javascript:alert(1)", "/fallback")).toBe("/fallback");
  });
});
