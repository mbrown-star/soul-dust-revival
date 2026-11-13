/**
 * Imports a Soul Dust Revival book (study kind "book", read in the book
 * reader) from its manuscript PDF, as the digital edition of a product that
 * already exists. Written for Revive Me: A Journey Out of the Dust.
 *
 *   npx tsx --env-file=.env.local scripts/import-book.ts \
 *     --product <product slug> --manuscript "<book PDF>" [--apply] [--publish]
 *
 * Dry run by default: splits the book (lib/import/splitBookChapters.ts) and
 * prints every chapter with its Part, verse, sub-headings, questions and
 * blessing size, and checks nothing collides. Refuses on any parser warning.
 *
 * --apply uploads the manuscript to R2 under a fresh server-chosen key and,
 * in one transaction, creates the study (linked to the product, kind "book")
 * with an Introduction (Foreword and Preface) and one lesson per chapter:
 * a text block (the chapter's opener and text), a question block per
 * "To Sit With" question, and the "Lift Up Your Eyes" blessing as a callout.
 * Everything is a draft unless --publish is also given, which publishes the
 * study and every lesson (each lesson's snapshot included) in the same
 * transaction.
 *
 * Needs pdftotext (poppler) on the PATH: the splitter reads its -layout
 * output, which keeps the indents that mark paragraphs.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { eq, or } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { contentBlocks, lessons, products, studies } from "../lib/db/schema";
import { defaultCoverAltText } from "../lib/images/coverAltText";
import { splitBookLayoutText } from "../lib/import/splitBookChapters";
import { toContentBlockInserts, type ParsedBlock } from "../lib/import/parseStudyDocument";
import { publishAllInStudy } from "../lib/lessons/publishedContent";
import { IMMUTABLE_CACHE_CONTROL, r2, R2_BUCKET, r2PublicUrl } from "../lib/r2/client";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const productSlug = arg("--product");
const manuscriptPath = arg("--manuscript");
const apply = args.includes("--apply");
const publish = args.includes("--publish");

async function main() {
  if (!productSlug || !manuscriptPath) {
    console.error('Usage: --product <product slug> --manuscript "<book PDF>" [--apply] [--publish]');
    process.exit(1);
  }
  if (publish && !apply) {
    console.error("--publish needs --apply.");
    process.exit(1);
  }

  const layout = spawnSync("pdftotext", ["-layout", "-nopgbrk", manuscriptPath, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (layout.status !== 0) {
    console.error(`pdftotext failed: ${layout.stderr || layout.error?.message}`);
    process.exit(1);
  }
  const book = splitBookLayoutText(layout.stdout);

  console.log(`Introduction: ${book.introductionHtml.length} characters`);
  for (const c of book.chapters) {
    console.log(
      `${c.lessonTitle}\n    ${c.part ?? "(no Part)"} · ${c.subtitle ?? "(no subtitle)"} · ${c.epigraph?.reference ?? "(no verse)"}` +
        `\n    ${c.headings.length} sub-headings · ${c.questions.length} questions · text ${c.textHtml.length} · blessing ${c.benedictionHtml.length}`
    );
  }
  if (book.warnings.length) {
    console.error(`\n${book.warnings.length} warning(s), refusing to continue:\n  ${book.warnings.join("\n  ")}`);
    process.exit(1);
  }

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(products.slug, productSlug) });
  if (!product) throw new Error(`No product with slug ${productSlug}`);
  if (product.type === "bundle") throw new Error("That product is a bundle.");
  const clash = await db
    .select({ id: studies.id, title: studies.title })
    .from(studies)
    .where(or(eq(studies.productId, product.id), eq(studies.slug, product.slug)));
  if (clash.length) throw new Error(`A study already uses this product or slug: ${clash.map((s) => s.title).join(", ")}`);

  const parsed: { title: string; blocks: ParsedBlock[] }[] = [
    { title: "Introduction", blocks: [{ type: "text", body: book.introductionHtml }] },
    ...book.chapters.map((c) => ({
      title: c.lessonTitle,
      blocks: [
        { type: "text" as const, body: c.textHtml },
        ...c.questions.map((q) => ({ type: "question" as const, questionPrompt: q })),
        { type: "callout" as const, calloutTitle: c.benedictionTitle, body: c.benedictionHtml },
      ],
    })),
  ];

  console.log(
    `\nProduct: ${product.title} (${product.slug}), format ${product.format}, kind ${product.kind}.` +
      `\nWould create study "${product.title}" (kind book, ${publish ? "published" : "unpublished"}) with ${parsed.length} lessons.`
  );
  if (!apply) {
    console.log("\nDry run. Add --apply to write.");
    return;
  }

  const sourceKey = `study-sources/${crypto.randomUUID()}.pdf`;
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: sourceKey,
      Body: readFileSync(manuscriptPath),
      ContentType: "application/pdf",
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    })
  );

  const studyId = await db.transaction(async (tx) => {
    const [study] = await tx
      .insert(studies)
      .values({
        productId: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        coverImageUrl: product.imageUrl,
        coverImageAlt: product.imageAlt ?? defaultCoverAltText(product.title, "Front"),
        kind: "book",
        published: publish,
        sourceFileUrl: r2PublicUrl(sourceKey),
        sourceFileName: path.basename(manuscriptPath).slice(0, 200),
      })
      .returning();
    if (!study) throw new Error("Study insert returned no row");

    const inserted = await tx
      .insert(lessons)
      .values(parsed.map((l, i) => ({ studyId: study.id, title: l.title.slice(0, 200), orderIndex: i, published: false })))
      .returning();
    const byOrder = new Map(inserted.map((l) => [l.orderIndex, l]));
    await tx.insert(contentBlocks).values(parsed.flatMap((l, i) => toContentBlockInserts(byOrder.get(i)!.id, l.blocks)));
    if (publish) await publishAllInStudy(tx, study.id);
    return study.id;
  });

  console.log(`\n✓ study ${studyId}: ${parsed.length} lessons, ${publish ? "published" : "all drafts"}. Manuscript at ${sourceKey}.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
