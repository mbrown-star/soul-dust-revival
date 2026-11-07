// Builds a logged-in Playwright storage state for a QA role account without
// sending a real email: uses the Supabase Admin API to generate a real
// magic-link OTP (the exact same mechanism a real "click the email" login
// uses), then exchanges it for a real session server-side via
// `verifyOtp` + the same `@supabase/ssr` cookie-writing code path
// lib/supabase/server.ts uses -- so the resulting cookies are byte-for-byte
// what a real browser login would produce, with no dependency on the
// Supabase project's configured redirect-URL allowlist (verifyOtp doesn't
// consult it; only the hosted /verify convenience redirect does).
import { createServerClient, type CookieOptionsWithName, type CookieMethodsServer } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Cookie } from "@playwright/test";

export type QaRole = "guest" | "user" | "leader" | "admin";

export const QA_EMAILS: Record<Exclude<QaRole, "guest">, string> = {
  user: "qa-user@soul-dust-revival.test",
  leader: "qa-leader@soul-dust-revival.test",
  admin: "qa-admin@soul-dust-revival.test",
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set (see .env.local) to build QA auth state.`);
  return v;
}

export async function loggedInCookiesForEmail(email: string): Promise<Cookie[]> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(`generateLink failed for ${email}: ${linkError?.message}`);
  }

  const captured: { name: string; value: string; options: CookieOptionsWithName }[] = [];

  // Matches lib/supabase/server.ts's cookieOptions exactly, so the cookies
  // this produces are indistinguishable from a real server-issued session.
  const serverClient = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: { secure: true, sameSite: "lax" },
    cookies: {
      getAll: () => [],
      setAll: ((cookiesToSet) => {
        for (const c of cookiesToSet) captured.push(c);
      }) satisfies CookieMethodsServer["setAll"],
    },
  });

  const { data: verifyData, error: verifyError } = await serverClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !verifyData.session) {
    throw new Error(`verifyOtp failed for ${email}: ${verifyError?.message}`);
  }

  const qaHost = process.env.QA_COOKIE_DOMAIN ?? "localhost";
  const nowSeconds = Math.floor(Date.now() / 1000);

  return captured.map(({ name, value, options }) => ({
    name,
    value,
    domain: qaHost,
    path: options?.path ?? "/",
    httpOnly: options?.httpOnly ?? true,
    secure: true, // Chromium treats localhost as a secure context, so Secure cookies still work over plain http://localhost.
    sameSite: "Lax",
    expires: nowSeconds + (typeof options?.maxAge === "number" ? options.maxAge : 60 * 60 * 24 * 7),
  }));
}
