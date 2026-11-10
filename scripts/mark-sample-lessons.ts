/**
 * Marks the sneak-peek free sample: the Colossians study's Introduction and
 * Weeks 1-3, and the Psalms devotional's Introduction and Days 1-3
 * (lessons.isSample -- see getLessonAccess in lib/entitlements/check.ts).
 *
 * Each lesson is matched by its study's slug and its own title, and the
 * script refuses to write unless all 8 are found, published, and unambiguous.
 * Dry run by default; pass --apply to write.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/mark-sample-lessons.ts [--apply]
 */
import { getDb } from "../lib/db/client";
import { lessons, studies } from "../lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const SAMPLE = [
  {
    slug: "soul-dust-revival-colossians",
    titles: [/^Introduction$/, /^Week 1:/, /^Week 2:/, /^Week 3:/],
  },
  {
    slug: "soul-dust-revival-a-365-day-devotional-through-the-psalms-universal-edition",
    titles: [/^Introduction$/, /^DAY 1 ·/, /^DAY 2 ·/, /^DAY 3 ·/],
  },
];
const EXPECTED = SAMPLE.reduce((n, s) => n + s.titles.length, 0);

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();
  const ids: string[] = [];
  const problems: string[] = [];

  for (const { slug, titles } of SAMPLE) {
    const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
    if (!study) {
      problems.push(`study not found: ${slug}`);
      continue;
    }
    if (!study.published) problems.push(`study not published: ${slug}`);

    const studyLessons = await db
      .select({ id: lessons.id, title: lessons.title, published: lessons.published, isSample: lessons.isSample })
      .from(lessons)
      .where(eq(lessons.studyId, study.id));

    for (const pattern of titles) {
      const matches = studyLessons.filter((l) => pattern.test(l.title));
      if (matches.length !== 1) {
        problems.push(`${slug}: ${matches.length} lessons match ${pattern}`);
        continue;
      }
      const lesson = matches[0]!;
      if (!lesson.published) problems.push(`${slug}: "${lesson.title}" isn't published`);
      console.log(`  ${lesson.isSample ? "already" : "will mark"}  ${slug} :: ${lesson.title}`);
      ids.push(lesson.id);
    }
  }

  if (problems.length > 0 || ids.length !== EXPECTED) {
    console.error(`\nNot writing -- expected ${EXPECTED} lessons, found ${ids.length}.`);
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log(`\nDry run -- all ${EXPECTED} found. Re-run with --apply to mark them.`);
    return;
  }

  const updated = await db
    .update(lessons)
    .set({ isSample: true })
    .where(and(inArray(lessons.id, ids), eq(lessons.isSample, false)))
    .returning({ id: lessons.id });
  console.log(`\n${updated.length} marked, ${EXPECTED - updated.length} already were.`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
