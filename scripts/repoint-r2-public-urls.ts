/**
 * Maintenance script: after the R2 bucket's public address changes (e.g. from
 * its *.r2.dev URL to a custom domain), rewrites every stored copy of the old
 * address to the new one -- image/cover/file URL columns, lesson blocks and
 * their published snapshots (jsonb), and rich-text bodies that embed images.
 * The objects themselves don't move: the same key is served at both
 * addresses, so only the prefix changes.
 *
 * It finds the columns itself: every text, varchar and jsonb column in the
 * public schema, so a column added later isn't missed. Only exact
 * occurrences of `<from>/` are replaced (the trailing slash keeps a longer
 * host that merely starts the same from matching).
 *
 * Dry run by default: prints how many rows in each column hold the old
 * address. Pass --apply to rewrite them, all in one transaction.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/repoint-r2-public-urls.ts \
 *     --from https://pub-xxxx.r2.dev --to https://media.example.com [--apply]
 */
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db/client";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function originOf(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname.replace(/\/+$/, "") !== "") {
    throw new Error(`${name} must be a bare https origin, got ${value}`);
  }
  return url.origin;
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected identifier: ${name}`);
  return `"${name}"`;
}

async function main() {
  const from = originOf(arg("--from"), "--from") + "/";
  const to = originOf(arg("--to"), "--to") + "/";
  const apply = process.argv.includes("--apply");
  if (from === to) throw new Error("--from and --to are the same");

  const db = await getDb();
  const columns = (await db.execute(sql`
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and data_type in ('text', 'character varying', 'jsonb')
    order by table_name, column_name
  `)).rows as { table_name: string; column_name: string; data_type: string }[];

  const pattern = `%${from}%`;
  const hits: { table: string; column: string; isJson: boolean; rows: number }[] = [];
  for (const c of columns) {
    const isJson = c.data_type === "jsonb";
    const col = ident(c.column_name);
    const asText = isJson ? `${col}::text` : col;
    const res = await db.execute(
      sql.raw(`select count(*)::int as n from ${ident(c.table_name)} where ${asText} like '${pattern.replace(/'/g, "''")}'`)
    );
    const rows = (res.rows[0] as { n: number }).n;
    if (rows > 0) hits.push({ table: c.table_name, column: c.column_name, isJson, rows });
  }

  if (hits.length === 0) {
    console.log(`No stored values contain ${from}`);
    return;
  }
  for (const h of hits) console.log(`${h.table}.${h.column}: ${h.rows} row(s)`);
  console.log(`Total: ${hits.reduce((n, h) => n + h.rows, 0)} row(s) in ${hits.length} column(s)`);

  if (!apply) {
    console.log("\nDry run. Pass --apply to rewrite them.");
    return;
  }

  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  await db.transaction(async (tx) => {
    for (const h of hits) {
      const col = ident(h.column);
      const value = h.isJson
        ? `replace(${col}::text, ${q(from)}, ${q(to)})::jsonb`
        : `replace(${col}, ${q(from)}, ${q(to)})`;
      const asText = h.isJson ? `${col}::text` : col;
      await tx.execute(
        sql.raw(`update ${ident(h.table)} set ${col} = ${value} where ${asText} like ${q(`%${from}%`)}`)
      );
    }
  });

  const left = [];
  for (const h of hits) {
    const asText = h.isJson ? `${ident(h.column)}::text` : ident(h.column);
    const res = await db.execute(sql.raw(`select count(*)::int as n from ${ident(h.table)} where ${asText} like ${q(`%${from}%`)}`));
    left.push((res.rows[0] as { n: number }).n);
  }
  console.log(`\nApplied. Rows still holding the old address: ${left.reduce((a, b) => a + b, 0)}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
