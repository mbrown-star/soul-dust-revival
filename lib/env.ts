import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url(),
  // The bucket's previous public address after a move (next.config.js keeps
  // it allowed for next/image). Optional.
  R2_LEGACY_PUBLIC_BASE_URL: z.string().url().optional(),
  CLOUDFLARE_STREAM_KEY_ID: z.string().min(1),
  CLOUDFLARE_STREAM_SIGNING_KEY: z.string().min(1),
  CLOUDFLARE_STREAM_CUSTOMER_CODE: z.string().min(1),
  CLOUDFLARE_STREAM_API_TOKEN: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  X_CLIENT_ID: z.string().min(1),
  X_CLIENT_SECRET: z.string().min(1),
  FACEBOOK_APP_ID: z.string().min(1),
  FACEBOOK_APP_SECRET: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16, "CRON_SECRET should be a long random string"),
  // Optional: the marketing/app subdomain split (see lib/domains.ts). Unset
  // in any environment that hasn't opted in yet, including local dev.
  NEXT_PUBLIC_MARKETING_HOSTNAME: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_HOSTNAME: z.string().min(1).optional(),
  NEXT_PUBLIC_COOKIE_DOMAIN: z.string().min(1).optional(),
  // Optional: "sneak_peek" builds the limited pre-launch site (see
  // lib/launchMode.ts); unset (or left blank, as .env.example ships it)
  // means the full site.
  NEXT_PUBLIC_LAUNCH_MODE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["sneak_peek", "full"]).optional()
  ),
}).refine(
  (env) => {
    const configured = [
      env.NEXT_PUBLIC_MARKETING_HOSTNAME,
      env.NEXT_PUBLIC_APP_HOSTNAME,
      env.NEXT_PUBLIC_COOKIE_DOMAIN,
    ].filter(Boolean).length;
    return configured === 0 || configured === 3;
  },
  {
    // A staggered rollout (e.g. the two hostnames set but
    // NEXT_PUBLIC_COOKIE_DOMAIN forgotten) would otherwise leave
    // proxy.ts actively redirecting between hosts while the Supabase
    // session cookie stays host-only -- a visitor bounced to the other
    // subdomain looks logged out there even with a valid session. All
    // three or none, enforced here rather than left to be discovered live.
    message:
      "NEXT_PUBLIC_MARKETING_HOSTNAME, NEXT_PUBLIC_APP_HOSTNAME, and NEXT_PUBLIC_COOKIE_DOMAIN must all be set together, or all left unset.",
    path: ["NEXT_PUBLIC_COOKIE_DOMAIN"],
  }
);

/**
 * Validates required environment variables at startup. Called from
 * instrumentation.ts so a missing/misconfigured var fails immediately and
 * clearly at boot, rather than surfacing as a confusing runtime error deep
 * inside a request (e.g. "Cannot read property of undefined" from a stray
 * `process.env.X!` somewhere).
 */
export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid/missing environment variables:");
    console.error(result.error.flatten().fieldErrors);
    throw new Error("Environment validation failed — see errors above.");
  }
}
