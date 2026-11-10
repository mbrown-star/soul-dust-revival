import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import type { contentBlocks, lessons } from "@/lib/db/schema";

type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Rewrites `order_index` to 0..n-1 following the order of `ids`, in one
 * UPDATE. Both tables that hold an ordered list (lessons in a study, blocks
 * in a lesson) use this so positions stay dense -- a client's "insert at
 * position 3" then always means the same thing as orderIndex 3.
 */
export async function writeOrderIndexes(
  db: Executor,
  table: typeof contentBlocks | typeof lessons,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const values = sql.join(
    ids.map((id, i) => sql`(${id}::uuid, ${i}::int)`),
    sql`, `
  );
  await db.execute(
    sql`update ${table} set order_index = v.idx from (values ${values}) as v(id, idx) where ${table}.id = v.id`
  );
}
