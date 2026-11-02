import { NextRequest } from "next/server";

/**
 * Cron endpoints aren't hit by a logged-in admin — they're called by an
 * external scheduler (a Cloudflare Worker Cron Trigger, or any scheduled-job
 * service) with a shared secret, not a user session. Returns true only if
 * the Authorization header matches CRON_SECRET exactly.
 */
export function isValidCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if the secret was never configured

  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
