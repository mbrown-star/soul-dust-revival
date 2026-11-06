import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
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

// Named directly rather than derived from getDb()'s return type -- the two
// branches below pass drizzle() a Pool or a (single-connection) Client,
// which infer different `$client` types; nothing in this app touches
// `.$client` directly, so the plain NodePgDatabase type (without that
// branch-specific intersection) is all callers actually need.
export type Db = NodePgDatabase<typeof schema>;

// Local dev (`next dev`) and vitest both run as a long-lived plain Node
// process with no Workers cross-request restriction, so unlike the
// Hyperdrive path below, a single pooled connection can safely be reused
// across every getDb() call in that process. This matters because a local
// Postgres (unlike Supabase's own pooler, which DATABASE_URL may also point
// at for dev) has no connection pooler in front of it: a fresh unclosed
// Client per call -- fine against a pooler, since it recycles the real
// connection underneath -- exhausts a plain Postgres server's
// max_connections almost immediately under a test run that calls getDb()
// hundreds of times in a couple of seconds (hit in practice: "sorry, too
// many clients already"). A low `max` (and a capped vitest worker count, see vitest.config.mts) keep this well under a default
// local Postgres's connection limit even across vitest's several
// parallel worker processes, each with its own pool.
let localPool: Pool | null = null;

/**
 * Returns a Drizzle client for the current request.
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
 * and -- unlike on Workers -- there's also no pooler automatically sitting
 * in front of whatever DATABASE_URL points at, so this branch reuses one
 * pooled connection across the whole process instead (see localPool above).
 *
 * Driver note: this uses node-postgres ("pg"), not postgres.js -- pairing
 * Drizzle with postgres.js over Hyperdrive is a documented unsupported
 * combination (developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/).
 */
export async function getDb(): Promise<Db> {
  const { connectionString, viaHyperdrive } = await resolveConnection();

  // Supabase requires TLS; a local Postgres (dev/test -- see BUILD_TASKS.md)
  // doesn't speak it at all and errors if asked for it. Hyperdrive always
  // encrypts its own connection to the origin on our behalf, so this only
  // ever applies to the direct, non-Hyperdrive path, and only when that
  // path's target actually needs it. (rejectUnauthorized: false, not a CA
  // bundle, matching this project's existing dev setup.)
  const needsTls = !viaHyperdrive && !isLocalHost(connectionString);
  const ssl = needsTls ? { rejectUnauthorized: false } : undefined;

  if (viaHyperdrive) {
    // Workers forbids reusing a connection created during one request in a
    // later request, so this genuinely must be a fresh, single-use Client
    // every call -- see the module doc comment above.
    const client = new Client({ connectionString, ssl });
    await client.connect();
    return drizzle(client, { schema });
  }

  if (!localPool) {
    localPool = new Pool({ connectionString, ssl, max: 3 });
  }
  return drizzle(localPool, { schema });
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
