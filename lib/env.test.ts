import { describe, it, expect, afterEach, vi } from "vitest";

// Like lib/domains.test.ts: validateEnv() reads process.env via a schema
// built at module scope, so each case re-imports after resetting modules.
const ORIGINAL_ENV = { ...process.env };

// A complete set of every var envSchema otherwise requires, so these tests
// only exercise the new marketing/app subdomain split refine, not the rest
// of the schema.
const BASE_ENV = {
  DATABASE_URL: "postgres://localhost/test",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  R2_ACCESS_KEY_ID: "r2-key",
  R2_SECRET_ACCESS_KEY: "r2-secret",
  R2_BUCKET_NAME: "bucket",
  R2_PUBLIC_BASE_URL: "https://assets.example.com",
  CLOUDFLARE_STREAM_KEY_ID: "stream-key-id",
  CLOUDFLARE_STREAM_SIGNING_KEY: "stream-signing-key",
  CLOUDFLARE_STREAM_CUSTOMER_CODE: "customer-code",
  CLOUDFLARE_STREAM_API_TOKEN: "stream-token",
  RESEND_API_KEY: "resend-key",
  RESEND_FROM_EMAIL: "orders@example.com",
  X_CLIENT_ID: "x-client-id",
  X_CLIENT_SECRET: "x-client-secret",
  FACEBOOK_APP_ID: "fb-app-id",
  FACEBOOK_APP_SECRET: "fb-app-secret",
  TOKEN_ENCRYPTION_KEY: "token-encryption-key",
  CRON_SECRET: "a-sufficiently-long-cron-secret",
};

async function validate(env: Partial<NodeJS.ProcessEnv>) {
  vi.resetModules();
  process.env = { ...BASE_ENV, ...env } as NodeJS.ProcessEnv;
  const { validateEnv } = await import("./env");
  return validateEnv;
}

describe("validateEnv -- marketing/app subdomain split vars", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("passes with all three split vars unset", async () => {
    const validateEnv = await validate({
      NEXT_PUBLIC_MARKETING_HOSTNAME: undefined,
      NEXT_PUBLIC_APP_HOSTNAME: undefined,
      NEXT_PUBLIC_COOKIE_DOMAIN: undefined,
    });
    expect(validateEnv).not.toThrow();
  });

  it("passes with all three split vars set", async () => {
    const validateEnv = await validate({
      NEXT_PUBLIC_MARKETING_HOSTNAME: "souldustrevival.com",
      NEXT_PUBLIC_APP_HOSTNAME: "app.souldustrevival.com",
      NEXT_PUBLIC_COOKIE_DOMAIN: ".souldustrevival.com",
    });
    expect(validateEnv).not.toThrow();
  });

  it("fails fast when only the two hostnames are set (the cookie domain forgotten)", async () => {
    const validateEnv = await validate({
      NEXT_PUBLIC_MARKETING_HOSTNAME: "souldustrevival.com",
      NEXT_PUBLIC_APP_HOSTNAME: "app.souldustrevival.com",
    });
    expect(validateEnv).toThrow();
  });

  it("fails fast when only one of the three is set", async () => {
    const validateEnv = await validate({
      NEXT_PUBLIC_MARKETING_HOSTNAME: "souldustrevival.com",
    });
    expect(validateEnv).toThrow();
  });
});
