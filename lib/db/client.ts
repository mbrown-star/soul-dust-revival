import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Uses Supabase's Postgres connection string (prefer the connection pooler
// URL for serverless/edge runtimes like Cloudflare Workers).
const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
