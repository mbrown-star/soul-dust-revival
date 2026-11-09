/**
 * One-off maintenance script: re-runs the fixed cover-PDF split/centering
 * algorithm (lib/images/bookCover.ts) against every product's already-stored
 * source cover PDF, and overwrites that product's existing back/front JPEGs
 * in place -- same R2 keys, so no DB update or re-upload through the admin
 * UI is needed, and the storefront's existing <Image> URLs keep working
 * unchanged.
 *
 * Written for the 2026-11-09 fix: equalizeBorderMargins() used to just trim
 * a crop's wider raw margin down to match its own narrower one, which left
 * different covers (different source designs, different PDF resolutions)
 * looking inconsistently margined next to each other on the homepage's
 * featured grid -- each one kept whatever arbitrary tighter margin its own
 * source happened to have. The fix normalizes every cover's margin to the
 * same proportion of its own detected border width instead, but that only
 * takes effect on a fresh upload -- every cover uploaded before this fix
 * needs to be re-split from its still-stored source PDF to actually show
 * the correction.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reprocess-book-covers.ts            # all products with a stored cover PDF
 *   npx tsx --env-file=.env.local scripts/reprocess-book-covers.ts <productId> # just one
 */
import { getDb } from "../lib/db/client";
import { products } from "../lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { splitBookCoverPdf } from "../lib/images/bookCover";
import { r2, R2_BUCKET } from "../lib/r2/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";

// splitBookCoverPdf's default pixel cap (6 megapixels) is sized for the
// admin upload route's Cloudflare Workers memory ceiling (128MB/isolate) --
// this script runs in a plain Node process with no such ceiling, and the
// real stored source PDFs (print-resolution KDP covers, some pre-dating
// that cap being tightened from its original 50-megapixel figure) are
// legitimately well above 6MP. 80 megapixels comfortably covers any real
// KDP cover this project has seen so far while still rejecting a truly
// absurd file.
const NODE_MAX_PIXELS = 80_000_000;

// R2 object keys are already server-generated UUID paths (see
// app/api/admin/products/cover-pdf/route.ts) -- never derived from a
// title/filename -- so recovering the key from the stored public URL is
// just stripping the known public-base-url prefix, not parsing anything
// untrusted.
function r2KeyFromPublicUrl(url: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) throw new Error("R2_PUBLIC_BASE_URL is not set");
  if (!url.startsWith(base + "/")) {
    throw new Error(`URL ${url} doesn't start with the configured R2_PUBLIC_BASE_URL (${base})`);
  }
  return url.slice(base.length + 1);
}

async function main() {
  const onlyProductId = process.argv[2];
  const db = await getDb();

  const rows = onlyProductId
    ? await db.select().from(products).where(eq(products.id, onlyProductId))
    : await db.select().from(products).where(isNotNull(products.coverPdfUrl));

  if (onlyProductId && rows.length === 0) {
    throw new Error(`No product found with id ${onlyProductId}`);
  }

  console.log(`Reprocessing ${rows.length} product cover(s)...`);

  let updated = 0;
  let skipped = 0;
  const failures: { id: string; title: string; error: string }[] = [];

  for (const product of rows) {
    if (!product.coverPdfUrl || !product.imageUrl || !product.backImageUrl) {
      console.log(`  Skipping "${product.title}" (${product.id}) -- missing coverPdfUrl/imageUrl/backImageUrl.`);
      skipped++;
      continue;
    }

    try {
      console.log(`  "${product.title}" (${product.id}): fetching source PDF...`);
      const res = await fetch(product.coverPdfUrl);
      if (!res.ok) throw new Error(`Failed to fetch source PDF: ${res.status} ${res.statusText}`);
      const pdfBytes = new Uint8Array(await res.arrayBuffer());

      console.log(`    Re-splitting with the fixed border-centering algorithm...`);
      const { back, front } = await splitBookCoverPdf(pdfBytes, NODE_MAX_PIXELS);

      const backKey = r2KeyFromPublicUrl(product.backImageUrl);
      const frontKey = r2KeyFromPublicUrl(product.imageUrl);

      console.log(`    Re-uploading to the existing keys (back: ${backKey}, front: ${frontKey})...`);
      await Promise.all([
        r2.send(
          new PutObjectCommand({ Bucket: R2_BUCKET, Key: backKey, Body: Buffer.from(back), ContentType: "image/jpeg" })
        ),
        r2.send(
          new PutObjectCommand({ Bucket: R2_BUCKET, Key: frontKey, Body: Buffer.from(front), ContentType: "image/jpeg" })
        ),
      ]);

      updated++;
      console.log(`    Done.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`    FAILED: ${message}`);
      failures.push({ id: product.id, title: product.title, error: message });
    }
  }

  console.log(`\n${updated} updated, ${skipped} skipped, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f.title} (${f.id}): ${f.error}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
