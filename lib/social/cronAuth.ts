import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Cron endpoints aren't hit by a logged-in admin — they're called by an
 * external scheduler (a Cloudflare Worker Cron Trigger, or any scheduled-job
 * service) with a shared secret, not a user session. Returns true only if
 * the Authorization header matches CRON_SECRET exactly.
 *
 * Compares via a SHA-256 digest of each side rather than the raw strings:
 * digests are always equal-length, so this can go straight to
 * timingSafeEqual without a variable-time length check first, and a plain
 * `===` or an unguarded timingSafeEqual (which throws on mismatched
 * lengths) would otherwise leak the secret's length and let an attacker
 * recover it byte-by-byte via response-time differences.
 */
export function isValidCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if the secret was never configured

  const header = req.headers.get("authorization") ?? "";
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256").update(header).digest();
  return timingSafeEqual(expected, actual);
}
