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
});

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
