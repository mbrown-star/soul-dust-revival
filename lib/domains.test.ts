import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// lib/domains.ts reads its env vars once at module-load time, so each case
// that needs a different env configuration resets the module cache and
// re-imports -- the only way to exercise both the "configured" and
// "unconfigured" branches in the same test file.
const ORIGINAL_ENV = { ...process.env };

async function loadDomains(env: Partial<NodeJS.ProcessEnv>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return await import("./domains");
}

describe("lib/domains", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("when the split is not configured", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_MARKETING_HOSTNAME;
      delete process.env.NEXT_PUBLIC_APP_HOSTNAME;
    });

    it("reports splitEnabled() false", async () => {
      const { splitEnabled } = await loadDomains({});
      expect(splitEnabled()).toBe(false);
    });

    it("marketingUrl/appUrl return the plain path unchanged", async () => {
      const { marketingUrl, appUrl } = await loadDomains({});
      expect(marketingUrl("/store")).toBe("/store");
      expect(appUrl("/library")).toBe("/library");
    });

    it("appOrigin() returns undefined", async () => {
      const { appOrigin } = await loadDomains({});
      expect(appOrigin()).toBeUndefined();
    });
  });

  describe("when only one hostname is configured", () => {
    it("still reports splitEnabled() false", async () => {
      const { splitEnabled } = await loadDomains({
        NEXT_PUBLIC_MARKETING_HOSTNAME: "souldustrevival.com",
      });
      expect(splitEnabled()).toBe(false);
    });
  });

  describe("when both hostnames are configured", () => {
    const env = {
      NEXT_PUBLIC_MARKETING_HOSTNAME: "souldustrevival.com",
      NEXT_PUBLIC_APP_HOSTNAME: "app.souldustrevival.com",
    };

    it("reports splitEnabled() true", async () => {
      const { splitEnabled } = await loadDomains(env);
      expect(splitEnabled()).toBe(true);
    });

    it("marketingUrl/appUrl return absolute cross-domain URLs", async () => {
      const { marketingUrl, appUrl } = await loadDomains(env);
      expect(marketingUrl("/store")).toBe("https://souldustrevival.com/store");
      expect(appUrl("/library")).toBe("https://app.souldustrevival.com/library");
    });

    it("appOrigin() returns the app domain's origin", async () => {
      const { appOrigin } = await loadDomains(env);
      expect(appOrigin()).toBe("https://app.souldustrevival.com");
    });

    it("isAppPath matches every app path prefix and its subtree", async () => {
      const { isAppPath } = await loadDomains(env);
      for (const path of ["/library", "/studies", "/studies/colossians/week-1", "/account", "/leader", "/leader/42"]) {
        expect(isAppPath(path)).toBe(true);
      }
    });

    it("isAppPath rejects marketing paths, including a path merely prefixed by an app path's name", async () => {
      const { isAppPath } = await loadDomains(env);
      for (const path of ["/", "/store", "/blog", "/checkout", "/admin/products", "/librarything"]) {
        expect(isAppPath(path)).toBe(false);
      }
    });

    it("isSharedPath matches login/signup/auth/api and their subtrees", async () => {
      const { isSharedPath } = await loadDomains(env);
      for (const path of ["/login", "/signup", "/auth/callback", "/api/checkout"]) {
        expect(isSharedPath(path)).toBe(true);
      }
    });

    it("isSharedPath rejects everything else", async () => {
      const { isSharedPath } = await loadDomains(env);
      for (const path of ["/", "/library", "/loginish"]) {
        expect(isSharedPath(path)).toBe(false);
      }
    });

    it("sessionCookieOptions() includes the configured cookie domain", async () => {
      const { sessionCookieOptions } = await loadDomains({
        ...env,
        NEXT_PUBLIC_COOKIE_DOMAIN: ".souldustrevival.com",
      });
      expect(sessionCookieOptions()).toEqual({
        secure: true,
        sameSite: "lax",
        domain: ".souldustrevival.com",
      });
    });
  });

  describe("hostname matching is case-insensitive", () => {
    it("matches a request hostname against an env var configured in a different case", async () => {
      const { splitEnabled, appHostname, marketingHostname } = await loadDomains({
        NEXT_PUBLIC_MARKETING_HOSTNAME: "SoulDustRevival.com",
        NEXT_PUBLIC_APP_HOSTNAME: "App.SoulDustRevival.com",
      });
      expect(splitEnabled()).toBe(true);
      // request.nextUrl.hostname is always lowercase (per the WHATWG URL
      // parser) -- these helpers must normalize to match it regardless of
      // how an operator typed the env var.
      expect(appHostname()).toBe("app.souldustrevival.com");
      expect(marketingHostname()).toBe("souldustrevival.com");
    });
  });

  describe("sessionCookieOptions() when the split isn't configured", () => {
    it("has no domain", async () => {
      const { sessionCookieOptions } = await loadDomains({});
      expect(sessionCookieOptions()).toEqual({
        secure: true,
        sameSite: "lax",
        domain: undefined,
      });
    });
  });

  describe("pathMatchesPrefix", () => {
    it("matches the prefix itself and its subtree, not a path merely starting with the same characters", async () => {
      const { pathMatchesPrefix } = await loadDomains({});
      expect(pathMatchesPrefix("/admin/products", "/admin/products")).toBe(true);
      expect(pathMatchesPrefix("/admin/products/new", "/admin/products")).toBe(true);
      expect(pathMatchesPrefix("/admin/productsomething", "/admin/products")).toBe(false);
      expect(pathMatchesPrefix("/admin", "/admin/products")).toBe(false);
    });
  });
});
