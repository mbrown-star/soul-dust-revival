/**
 * Imports one catalog title from the author's working folder as a hidden,
 * not-yet-for-sale draft: a "Coming soon" product with its cover split from
 * the full-wrap cover PDF, plus an unpublished study whose lessons are all
 * drafts. Nothing it creates can be bought or read by a customer until an
 * admin sets prices, publishes the study and lessons, and unticks Coming soon.
 *
 *   npx tsx --env-file=.env.local scripts/import-catalog-title.ts \
 *     --covers "<title's cover folder>" --manuscript "<web-version PDF>" [--kind study|devotional|book] [--apply]
 *
 * Dry run by default: prints the product, the cover split and every parsed
 * lesson with its question/callout counts, and checks nothing collides.
 * --apply uploads the cover crops, the cover PDF and the manuscript to R2
 * under fresh server-chosen keys and writes everything in one transaction.
 *
 * --replace-lessons rebuilds an already-imported title's lessons from the
 * current parser (after a parser fix), leaving its product and covers alone.
 * It only touches a study that is unpublished, with every lesson a draft and
 * no reader answers or progress, so nothing anyone has seen or written changes.
 *
 * The cover folder holds the cover PDF plus a metadata .json (two layouts
 * exist: `title_fields` with back_hook/back_para_*, or `front`/`back` with
 * hook/paragraphs); its back-cover copy becomes the description. Parsing and
 * sanitizing go through the same code as the admin's Import study
 * (lib/import/parseStudyDocument.ts).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { contentBlocks, lessonProgress, lessons, products, responses, studies } from "../lib/db/schema";
import { defaultCoverAltText } from "../lib/images/coverAltText";
import { splitBookCoverPdf } from "../lib/images/splitBookCoverPdf";
import { parseStudyDocument, toContentBlockInserts } from "../lib/import/parseStudyDocument";
import { IMMUTABLE_CACHE_CONTROL, r2, R2_BUCKET, r2PublicUrl } from "../lib/r2/client";

type Kind = "study" | "devotional" | "book";

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const coversDir = option("--covers");
const manuscriptPath = option("--manuscript");
const kindArg = option("--kind") as Kind | undefined;
const apply = args.includes("--apply");
const replaceLessons = args.includes("--replace-lessons");
if (!coversDir || !manuscriptPath) {
  console.error('Usage: scripts/import-catalog-title.ts --covers "<dir>" --manuscript "<pdf>" [--kind study|devotional|book] [--apply]');
  process.exit(1);
}
if (kindArg && !["study", "devotional", "book"].includes(kindArg)) {
  console.error("--kind must be study, devotional or book");
  process.exit(1);
}

/** The metadata files write dashes as "--" and use a few HTML entities. */
function cleanCopy(text: string): string {
  return text
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/\s--\s/g, " — ")
    .replace(/\s+/g, " ")
    .trim();
}

type Metadata = { title: string; tagline?: string; kindLine?: string; description: string };

function readMetadata(dir: string): Metadata {
  const file = readdirSync(dir).find((f) => f.endsWith(".json"));
  if (!file) throw new Error(`No metadata .json in ${dir}`);
  const json = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
  const fields = json.title_fields as Record<string, string> | undefined;
  if (fields) {
    return {
      // A two-line cover title is stored as title_line1/title_line2.
      title: cleanCopy(fields.title ?? [fields.title_line1, fields.title_line2].filter(Boolean).join(" ")),
      tagline: fields.tagline && cleanCopy(fields.tagline),
      kindLine: fields.kind_line && cleanCopy(fields.kind_line),
      description: [fields.back_hook, fields.back_para_1, fields.back_para_2].filter(Boolean).map((t) => cleanCopy(t!)).join("\n\n"),
    };
  }
  const front = json.front as Record<string, string> | undefined;
  const back = json.back as { hook?: string; paragraphs?: string[] } | undefined;
  if (front && back) {
    const kicker = front.kicker ? cleanCopy(front.kicker) : "";
    // "PART ONE · A STUDY OF" + "John" + "That You May Believe" ->
    // "John: That You May Believe — Part One", as the author names the folders.
    const partWords = /^(PART \w+)/i.exec(kicker)?.[1];
    const part = partWords?.replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
    const baseTitle = cleanCopy(front.title ?? "");
    // Only a multi-part series carries its tagline in the name (the John
    // parts); a single title is just its name, like every other layout.
    const named = part && front.tagline ? `${baseTitle}: ${cleanCopy(front.tagline)}` : baseTitle;
    return {
      title: part ? `${named} — ${part}` : named,
      tagline: front.tagline && cleanCopy(front.tagline),
      kindLine: front.kind && cleanCopy(front.kind),
      description: [back.hook, ...(back.paragraphs ?? [])].filter(Boolean).map((t) => cleanCopy(t!)).join("\n\n"),
    };
  }
  throw new Error(`Unrecognized metadata layout in ${file}`);
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function put(key: string, body: Uint8Array | Buffer, contentType: string) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: Buffer.from(body),
      ContentType: contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    })
  );
  return r2PublicUrl(key);
}

async function main() {
  const meta = readMetadata(coversDir!);
  const kind: Kind = kindArg ?? (/DEVOTIONAL(?! STUDY)/i.test(meta.kindLine ?? "") ? "devotional" : "study");
  const title = `Soul Dust Revival: ${meta.title}`;
  const slug = slugify(title);
  const coverFile = readdirSync(coversDir!).find((f) => /_Cover\.pdf$/i.test(f));
  if (!coverFile) throw new Error(`No *_Cover.pdf in ${coversDir}`);

  console.log(`\n${apply ? "APPLYING" : "DRY RUN (pass --apply to write)"}: ${title}`);
  console.log(`  slug ${slug} · kind ${kind} · "${meta.kindLine ?? ""}"`);
  console.log(`  description: ${meta.description.slice(0, 140)}…`);

  const db = await getDb();
  let existingStudyId: string | null = null;
  if (replaceLessons) {
    const [study] = await db.select().from(studies).where(eq(studies.slug, slug));
    if (!study) throw new Error(`No study with slug ${slug} to replace lessons in.`);
    if (study.published) throw new Error(`${title} is published; not replacing its lessons.`);
    const existing = await db.select({ id: lessons.id, published: lessons.published }).from(lessons).where(eq(lessons.studyId, study.id));
    if (existing.some((l) => l.published)) throw new Error(`${title} has a published lesson; not replacing its lessons.`);
    const ids = existing.map((l) => l.id);
    if (ids.length) {
      const blockIds = (await db.select({ id: contentBlocks.id }).from(contentBlocks).where(inArray(contentBlocks.lessonId, ids))).map((b) => b.id);
      const answers = blockIds.length ? await db.select({ id: responses.id }).from(responses).where(inArray(responses.contentBlockId, blockIds)) : [];
      const progress = await db.select({ id: lessonProgress.id }).from(lessonProgress).where(inArray(lessonProgress.lessonId, ids));
      if (answers.length || progress.length) {
        throw new Error(`${title} has ${answers.length} answers and ${progress.length} progress rows; not replacing its lessons.`);
      }
    }
    existingStudyId = study.id;
    console.log(`  replacing the ${existing.length} draft lessons of study ${study.id} (product and covers unchanged)`);
  } else {
    const clashes = [
      ...(await db.select({ id: products.id }).from(products).where(eq(products.slug, slug))).map(() => "a product"),
      ...(await db.select({ id: studies.id }).from(studies).where(eq(studies.slug, slug))).map(() => "a study"),
    ];
    if (clashes.length) throw new Error(`The slug ${slug} is already used by ${clashes.join(" and ")}; not importing it twice.`);
  }

  const manuscript = readFileSync(manuscriptPath!);
  const parsed = await parseStudyDocument(manuscript, { isDocx: false, kind });
  const counts = (blocks: (typeof parsed)[number]["blocks"], type: string) => blocks.filter((b) => b.type === type).length;
  console.log(`  manuscript: ${path.basename(manuscriptPath!)} -> ${parsed.length} lessons`);
  for (const lesson of parsed) {
    console.log(
      `    ${lesson.title.slice(0, 70).padEnd(70)} text ${String(counts(lesson.blocks, "text")).padStart(2)} · questions ${String(counts(lesson.blocks, "question")).padStart(2)} · callouts ${String(counts(lesson.blocks, "callout")).padStart(2)}`
    );
  }
  // Where the Introduction starts and stops: it should be the Foreword and
  // Preface only, not a contents page or a "Before You Begin" essay.
  const intro = parsed.find((l) => l.title === "Introduction");
  if (intro) {
    const text = intro.blocks
      .map((b) => ("body" in b ? b.body : ""))
      .join(" ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    console.log(`  introduction: ${text.length} characters, "${text.slice(0, 60)}…${text.slice(-90)}"`);
  }

  if (existingStudyId) {
    if (!apply) return;
    const studyId = existingStudyId;
    await db.transaction(async (tx) => {
      const old = (await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.studyId, studyId))).map((l) => l.id);
      if (old.length) {
        await tx.delete(contentBlocks).where(inArray(contentBlocks.lessonId, old));
        await tx.delete(lessons).where(inArray(lessons.id, old));
      }
      const inserted = await tx
        .insert(lessons)
        .values(parsed.map((l, i) => ({ studyId, title: l.title.slice(0, 200), orderIndex: i, published: false })))
        .returning();
      const byOrder = new Map(inserted.map((l) => [l.orderIndex, l]));
      const blocks = parsed.flatMap((l, i) => toContentBlockInserts(byOrder.get(i)!.id, l.blocks));
      if (blocks.length) await tx.insert(contentBlocks).values(blocks);
    });
    console.log(`  ✓ replaced with ${parsed.length} draft lessons`);
    return;
  }

  // After the manuscript: the cover splitter (unpdf) and the manuscript
  // parser (pdf-parse) bundle different pdf.js versions that share one global
  // worker, and pdf-parse refuses to run once unpdf's is registered.
  const coverPdf = readFileSync(path.join(coversDir!, coverFile));
  const cover = await splitBookCoverPdf(new Uint8Array(coverPdf));
  console.log(
    `  cover: ${coverFile} -> front ${cover.frontWidth}x${cover.frontHeight}, back ${cover.backWidth}x${cover.backHeight} (${cover.method}${cover.trim ? `, ${cover.trim}` : ""})`
  );

  if (!apply) return;

  const id = crypto.randomUUID();
  const [coverPdfUrl, backImageUrl, frontImageUrl, sourceFileUrl] = await Promise.all([
    put(`book-covers/${id}/source.pdf`, coverPdf, "application/pdf"),
    put(`book-covers/${id}/back.jpg`, cover.back, "image/jpeg"),
    put(`book-covers/${id}/front.jpg`, cover.front, "image/jpeg"),
    put(`study-sources/${crypto.randomUUID()}.pdf`, manuscript, "application/pdf"),
  ]);

  const result = await db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        type: "book",
        format: "both",
        kind,
        bookBinding: "softback",
        title,
        slug,
        description: meta.description,
        imageUrl: frontImageUrl,
        imageAlt: defaultCoverAltText(title, "Front"),
        imageWidth: cover.frontWidth,
        imageHeight: cover.frontHeight,
        backImageUrl,
        backImageAlt: defaultCoverAltText(title, "Back"),
        backImageWidth: cover.backWidth,
        backImageHeight: cover.backHeight,
        coverPdfUrl,
        // No prices or Amazon link yet: announced, not for sale.
        priceCents: 0,
        digitalPriceCents: 0,
        sellOnStripe: false,
        sellOnAmazon: true,
        amazonUrl: null,
        comingSoon: true,
        active: true,
        featured: false,
      })
      .returning();
    if (!product) throw new Error("Product insert returned no row");

    const [study] = await tx
      .insert(studies)
      .values({
        productId: product.id,
        title,
        slug,
        description: meta.description,
        coverImageUrl: frontImageUrl,
        coverImageAlt: defaultCoverAltText(title, "Front"),
        kind,
        published: false,
        sourceFileUrl,
        sourceFileName: path.basename(manuscriptPath!).slice(0, 200),
      })
      .returning();
    if (!study) throw new Error("Study insert returned no row");

    if (parsed.length) {
      const inserted = await tx
        .insert(lessons)
        .values(parsed.map((l, i) => ({ studyId: study.id, title: l.title.slice(0, 200), orderIndex: i, published: false })))
        .returning();
      const byOrder = new Map(inserted.map((l) => [l.orderIndex, l]));
      const blocks = parsed.flatMap((l, i) => toContentBlockInserts(byOrder.get(i)!.id, l.blocks));
      if (blocks.length) await tx.insert(contentBlocks).values(blocks);
    }
    return { productId: product.id, studyId: study.id };
  });

  console.log(`  ✓ product ${result.productId} (Coming soon), study ${result.studyId} (unpublished, ${parsed.length} draft lessons)`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    // A failed insert's message includes the whole query and its parameters
    // (thousands of lines for a study); the database's actual reason is in
    // `cause`.
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : null;
    console.error(`\n✗ ${message.length > 300 ? `${message.slice(0, 300)}…` : message}${cause ? `\n  cause: ${cause}` : ""}`);
    process.exit(1);
  });
