import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Uses Supabase's Postgres connection string (prefer the connection pooler
// URL for serverless/edge runtimes like Cloudflare Workers).
const connectionString = process.env.DATABASE_URL!;

// Supabase requires TLS; the `postgres` driver does not infer this from the
// connection string, so without `ssl: "require"` it fails closed (ECONNRESET
// or an immediate "SSL connection is required" error from Postgres).
const client = postgres(connectionString, { prepare: false, ssl: "require" });

export const db = drizzle(client, { schema });
