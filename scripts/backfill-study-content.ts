// Loads a study's tabbed weeks (lessons.studyContent) from a weeks JSON file
// made by soul-dust-interactive/tools/study/parse_five_stations.py, so its
// week lessons open in the five-tab reader instead of the plain block view.
// The general form of backfill-colossians-study-content.ts.
//
//   npx tsx --env-file=.env.local scripts/backfill-study-content.ts \
//     --study <slug> --weeks <file.json> [--replace] [--apply]
//
// Dry run by default: matches each parsed week to its lesson ("Week N: …"),
// checks every week against the same schema the admin builder saves with,
// and prints what it would do. --apply writes each week in its own
// transaction.
//
// A published lesson is staged, never changed under its readers: its current
// content is frozen as the published snapshot first (ensureSnapshot, as the
// admin builder does on its first edit), so readers keep seeing what they see
// now and the admin sees "Unpublished changes" with Publish / Discard. A draft
// lesson is written directly.
//
// Skips a lesson that already has studyContent unless --replace is given (to
// reload a week after a parser fix); question blocks are reused either way,
// so a re-run never duplicates anything.
//
// Each station's answer needs a "question" content block. The importer
// already made one per printed question, so a station reuses the block whose
// prompt matches its question. The importer sometimes glued the text after a
// question onto it (a pull-quote, or a whole Life Application section in the
// Journey's Part Three); such a block is reused too and its prompt corrected.
// Only a station with no block at all gets a new one.
import { readFileSync } from "fs";
import { eq, and, max } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { studies, lessons, contentBlocks } from "../lib/db/schema";
import type { StudyWeekContent, StudyStation } from "../lib/study/studyContent";
import { ensureSnapshot } from "../lib/lessons/publishedContent";
import { studyWeekContentSchema } from "../lib/validation/schemas";

type ParsedWeek = Omit<StudyWeekContent, "stations"> & {
  week: number;
  title: string;
  stations: Omit<StudyStation, "questionBlockId">[];
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Letters and digits only, lower case: survives line-wrap and quote differences. */
export function promptKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The fields the reader uses, in StudyWeekContent's shape; parser extras are left behind. */
export function toWeekContent(week: ParsedWeek, stations: StudyStation[]): StudyWeekContent {
  return {
    subtitle: week.subtitle,
    keyVerse: week.keyVerse,
    keyRef: week.keyRef,
    study: week.study,
    passageRef: week.passageRef,
    passage: week.passage,
    stationsLabel: week.stationsLabel,
    stationsIntro: week.stationsIntro,
    stations,
    lifeTitle: week.lifeTitle,
    lifeIntro: week.lifeIntro,
    ...(week.lifePulls?.length ? { lifePulls: week.lifePulls } : {}),
    practices: week.practices,
    prayerLead: week.prayerLead,
    prayerBeats: week.prayerBeats,
    prayerClose: week.prayerClose,
    ...(week.prayerBeats.length === 0 && week.prayerLines?.length ? { prayerLines: week.prayerLines } : {}),
    ...(week.prayerLabel ? { prayerLabel: week.prayerLabel } : {}),
    ...(week.extraPracticals?.length ? { extraPracticals: week.extraPracticals } : {}),
    ...(week.interlude ? { interlude: week.interlude } : {}),
    bottomLine: week.bottomLine,
    benediction: week.benediction,
    closingVerse: week.closingVerse,
    closingRef: week.closingRef ?? "",
    carry: week.carry,
  };
}

function stationFields(st: Omit<StudyStation, "questionBlockId">): Omit<StudyStation, "questionBlockId"> {
  return {
    ref: st.ref,
    ...(st.lang ? { lang: st.lang } : {}),
    verse: st.verse,
    question: st.question,
    greek: st.greek,
    translit: st.translit,
    gloss: st.gloss,
    xref: st.xref,
    body: st.body,
    live: st.live,
    verseNums: st.verseNums,
    anchor: st.anchor,
    ...(st.pulls?.length ? { pulls: st.pulls } : {}),
    ...(st.note?.length ? { note: st.note } : {}),
    ...(st.moreStudies?.length ? { moreStudies: st.moreStudies } : {}),
  };
}

async function main() {
  const slug = arg("--study");
  const file = arg("--weeks");
  const apply = process.argv.includes("--apply");
  const replace = process.argv.includes("--replace");
  if (!slug || !file) throw new Error("Usage: --study <slug> --weeks <file.json> [--apply]");

  const weeks: ParsedWeek[] = JSON.parse(readFileSync(file, "utf-8"));
  const db = await getDb();
  const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
  if (!study) throw new Error(`Study not found: ${slug}`);
  const studyLessons = await db.select().from(lessons).where(eq(lessons.studyId, study.id));

  const byWeek = new Map<number, (typeof studyLessons)[number]>();
  for (const l of studyLessons) {
    const m = /^Week\s+(\d+)\b/.exec(l.title);
    if (m) byWeek.set(Number(m[1]), l);
  }

  console.log(`${study.title} (${slug}) — ${apply ? "APPLYING" : "dry run"}`);
  let loaded = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const week of weeks) {
    const lesson = byWeek.get(week.week);
    if (!lesson) {
      problems.push(`Week ${week.week}: no lesson titled "Week ${week.week}: …"`);
      continue;
    }
    if (lesson.studyContent && !replace) {
      skipped++;
      console.log(`  Week ${week.week}: already has tabbed content, skipped`);
      continue;
    }

    const blocks = await db
      .select({ id: contentBlocks.id, type: contentBlocks.type, prompt: contentBlocks.questionPrompt })
      .from(contentBlocks)
      .where(and(eq(contentBlocks.lessonId, lesson.id), eq(contentBlocks.type, "question")));
    const free = new Map(blocks.map((b) => [promptKey(b.prompt ?? ""), b.id]));
    const corrected = new Set<string>();
    const reuse = week.stations.map((st) => {
      const key = promptKey(st.question);
      let found = free.has(key) ? key : null;
      // A prompt the importer extended with text that follows the question.
      if (!found && key.length >= 20) found = [...free.keys()].find((k) => k.startsWith(key)) ?? null;
      if (!found) return null;
      const id = free.get(found)!;
      free.delete(found);
      if (found !== key) corrected.add(id);
      return id;
    });

    // Validate with a placeholder id for stations that will get a new block.
    const placeholder = "00000000-0000-4000-8000-000000000000";
    const check = studyWeekContentSchema.safeParse(
      toWeekContent(week, week.stations.map((st, i) => ({ ...stationFields(st), questionBlockId: reuse[i] ?? placeholder })))
    );
    if (!check.success) {
      problems.push(`Week ${week.week}: ${check.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }

    const titleNote = lesson.title === `Week ${week.week}: ${week.title}` ? "" : `  (lesson title "${lesson.title}")`;
    console.log(
      `  Week ${week.week}: ${week.title} — ${week.stations.length} stations ` +
        `(${reuse.filter(Boolean).length} reuse a question block${corrected.size ? `, ${corrected.size} with its prompt corrected` : ""}, ` +
        `${reuse.filter((r) => !r).length} new), ` +
        `${week.passage.length} verses${lesson.published ? ", staged as unpublished changes" : ""}${titleNote}`
    );
    if (!apply) continue;

    await db.transaction(async (tx) => {
      // Freeze what readers see now before touching a published lesson.
      if (lesson.published) await ensureSnapshot(tx, lesson.id);
      const [row] = await tx.select({ value: max(contentBlocks.orderIndex) }).from(contentBlocks).where(eq(contentBlocks.lessonId, lesson.id));
      let nextOrder = (row?.value ?? -1) + 1;
      const stations: StudyStation[] = [];
      for (const [i, st] of week.stations.entries()) {
        let id = reuse[i];
        if (id && corrected.has(id)) {
          await tx
            .update(contentBlocks)
            .set({ questionPrompt: st.question })
            .where(and(eq(contentBlocks.id, id), eq(contentBlocks.lessonId, lesson.id)));
        }
        if (!id) {
          const [block] = await tx
            .insert(contentBlocks)
            .values({ lessonId: lesson.id, orderIndex: nextOrder++, type: "question", questionPrompt: st.question })
            .returning({ id: contentBlocks.id });
          if (!block) throw new Error(`Week ${week.week}: couldn't create a question block for ${st.ref}`);
          id = block.id;
        }
        stations.push({ ...stationFields(st), questionBlockId: id });
      }
      const updated = await tx
        .update(lessons)
        .set({ studyContent: toWeekContent(week, stations) })
        .where(and(eq(lessons.id, lesson.id), eq(lessons.studyId, study.id)))
        .returning({ id: lessons.id });
      if (updated.length !== 1) throw new Error(`Week ${week.week}: lesson changed underneath; nothing written`);
    });
    loaded++;
  }

  for (const p of problems) console.log(`  ! ${p}`);
  console.log(`${apply ? "Loaded" : "Would load"} ${apply ? loaded : weeks.length - skipped - problems.length}, skipped ${skipped}, problems ${problems.length}.`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1]?.endsWith("backfill-study-content.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
