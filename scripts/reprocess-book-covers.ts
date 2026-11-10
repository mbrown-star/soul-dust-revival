/**
 * Maintenance script: re-runs the cover-PDF split (lib/images/bookCover.ts)
 * against every product's already-stored source cover PDF -- and against
 * each study whose cover came from its linked product's cover PDF -- so a
 * parser improvement reaches covers uploaded before it, with no re-upload
 * through the admin UI.
 *
 * New crops go to FRESH R2 keys and the DB rows are repointed at them (plus
 * the products' stored image dimensions, which the storefront uses to shape
 * each cover's tile). Overwriting the old keys in place would leave stale
 * crops in any browser that already cached them, since every cover is
 * served with an immutable, year-long Cache-Control. The old objects are
 * left in R2, unreferenced.
 *
 * Dry run by default -- prints what each cover would become. Pass --apply to
 * upload and update the DB.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reprocess-book-covers.ts [--apply] [productId]
 */
import { getDb } from "../lib/db/client";
import { products, studies } from "../lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { splitBookCoverPdf } from "../lib/images/bookCover";
import { r2, R2_BUCKET, r2PublicUrl, IMMUTABLE_CACHE_CONTROL } from "../lib/r2/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";

// splitBookCoverPdf's default pixel cap (6 megapixels) is sized for the
// admin upload route's Cloudflare Workers memory ceiling (128MB/isolate) --
// this script runs in a plain Node process with no such ceiling, and the
// real stored source PDFs are print-resolution (300ppi) KDP covers.
const NODE_MAX_PIXELS = 80_000_000;

async function putJpeg(key: string, bytes: Uint8Array) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: "image/jpeg",
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    })
  );
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const onlyProductId = args.find((a) => !a.startsWith("--"));
  const db = await getDb();

  const rows = onlyProductId
    ? await db.select().from(products).where(eq(products.id, onlyProductId))
    : await db.select().from(products).where(isNotNull(products.coverPdfUrl));
  if (onlyProductId && rows.length === 0) throw new Error(`No product found with id ${onlyProductId}`);

  const studiesWithCovers = await db
    .select({ id: studies.id, title: studies.title, productId: studies.productId, coverImageUrl: studies.coverImageUrl })
    .from(studies)
    .where(isNotNull(studies.coverImageUrl));

  console.log(`${apply ? "APPLYING" : "DRY RUN (pass --apply to write)"} -- ${rows.length} product cover PDF(s)\n`);

  let updated = 0;
  const failures: { title: string; error: string }[] = [];

  for (const product of rows) {
    if (!product.coverPdfUrl) {
      console.log(`- "${product.title}": no stored cover PDF, skipped.`);
      continue;
    }
    try {
      const res = await fetch(product.coverPdfUrl);
      if (!res.ok) throw new Error(`Failed to fetch source PDF: ${res.status} ${res.statusText}`);
      const split = await splitBookCoverPdf(new Uint8Array(await res.arrayBuffer()), NODE_MAX_PIXELS);
      const linkedStudies = studiesWithCovers.filter((s) => s.productId === product.id);

      console.log(
        `- "${product.title}": ${split.method}${split.trim ? ` (${split.trim})` : ""}, ` +
          `front ${split.frontWidth}x${split.frontHeight}, back ${split.backWidth}x${split.backHeight}` +
          (linkedStudies.length ? `; also study cover(s): ${linkedStudies.map((s) => `"${s.title.trim()}"`).join(", ")}` : "")
      );
      if (!apply) continue;

      const folder = crypto.randomUUID();
      const frontKey = `book-covers/${folder}/front.jpg`;
      const backKey = `book-covers/${folder}/back.jpg`;
      await Promise.all([putJpeg(frontKey, split.front), putJpeg(backKey, split.back)]);
      await db
        .update(products)
        .set({
          imageUrl: r2PublicUrl(frontKey),
          imageWidth: split.frontWidth,
          imageHeight: split.frontHeight,
          backImageUrl: r2PublicUrl(backKey),
          backImageWidth: split.backWidth,
          backImageHeight: split.backHeight,
        })
        .where(eq(products.id, product.id));

      for (const study of linkedStudies) {
        const studyKey = `study-covers/${crypto.randomUUID()}/front.jpg`;
        await putJpeg(studyKey, split.front);
        await db.update(studies).set({ coverImageUrl: r2PublicUrl(studyKey) }).where(eq(studies.id, study.id));
      }
      updated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${message}`);
      failures.push({ title: product.title, error: message });
    }
  }

  console.log(`\n${apply ? `${updated} updated` : "nothing written"}, ${failures.length} failed.`);
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
