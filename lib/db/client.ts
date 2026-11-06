import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

// Augments @opennextjs/cloudflare's own global CloudflareEnv interface (used
// by getCloudflareContext() below) with the Hyperdrive binding declared in
// wrangler.jsonc -- `wrangler types` only writes a separate `Env` interface,
// which isn't automatically merged into CloudflareEnv.
declare global {
  interface CloudflareEnv {
    HYPERDRIVE?: { connectionString: string };
  }
}

// Derived from getDb()'s own return value rather than a bare
// ReturnType<typeof drizzle<...>> -- drizzle-orm/node-postgres's drizzle()
// infers a different $client type depending on whether you pass it a Pool
// or a (single-connection) Client, and this app always passes a Client.
export type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Returns a fresh Drizzle client for the current request.
 *
 * This app runs on Cloudflare Workers in production (via the OpenNext
 * adapter -- see CLAUDE.md), where a database client must be created fresh
 * *inside each request*, never cached in module/global scope: Workers
 * forbids reusing an I/O object (a DB connection included) created during
 * one request's handling from a different request, and reaching a normal
 * Postgres database from a Worker at all means going through Hyperdrive,
 * which expects exactly this "new client per request" pattern -- it pools
 * the real connections on Cloudflare's side, so this is cheap. See
 * developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle.
 *
 * Locally (plain Node -- `next dev`, vitest), there's no such restriction,
 * but creating a fresh client here costs nothing extra either way, so the
 * same code path is used in both places rather than branching into two
 * different client lifecycles to maintain.
 *
 * Driver note: this uses node-postgres ("pg"), not postgres.js -- pairing
 * Drizzle with postgres.js over Hyperdrive is a documented unsupported
 * combination (developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/).
 */
export async function getDb() {
  const { connectionString, viaHyperdrive } = await resolveConnection();

  // Supabase requires TLS; a local Postgres (dev/test -- see BUILD_TASKS.md)
  // doesn't speak it at all and errors if asked for it. Hyperdrive always
  // encrypts its own connection to the origin on our behalf, so this only
  // ever applies to the direct, non-Hyperdrive path, and only when that
  // path's target actually needs it. (rejectUnauthorized: false, not a CA
  // bundle, matching this project's existing dev setup.)
  const needsTls = !viaHyperdrive && !isLocalHost(connectionString);

  const client = new Client({
    connectionString,
    ...(needsTls ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await client.connect();

  return drizzle(client, { schema });
}

function isLocalHost(connectionString: string): boolean {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

async function resolveConnection(): Promise<{ connectionString: string; viaHyperdrive: boolean }> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    if (env.HYPERDRIVE) {
      return { connectionString: env.HYPERDRIVE.connectionString, viaHyperdrive: true };
    }
  } catch {
    // Not running inside the Cloudflare Workers runtime -- local dev and
    // vitest both land here, since getCloudflareContext() isn't available.
  }
  return { connectionString: process.env.DATABASE_URL!, viaHyperdrive: false };
}
