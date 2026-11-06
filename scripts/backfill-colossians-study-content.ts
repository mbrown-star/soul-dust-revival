// One-off backfill: populates lessons.studyContent for the 12 real
// Colossians week lessons from soul-dust-interactive's own already-verified,
// already-enriched parse of the source PDF (data/colossians-weeks-enriched.json
// -- produced by running soul-dust-interactive/tools/study/build_study.py's
// enrich() against data/colossians-weeks.json + data/web/colossians.json).
// See lib/study/studyContent.ts for why this is backfilled rather than
// derived at render time.
//
// For each matched week, also creates 5 new "question" content_blocks (one
// per station) so each station's answer reuses the existing
// QuestionBlock/responses save-per-user plumbing unchanged -- the station's
// questionBlockId in the stored studyContent points at these.
//
// Idempotent: a lesson that already has studyContent set is left alone (so
// re-running this never creates duplicate question content_blocks).
//
// Usage: npx tsx --env-file=.env.local scripts/backfill-colossians-study-content.ts
import { readFileSync } from "fs";
import { join } from "path";
import { getDb } from "../lib/db/client";
import { studies, lessons, contentBlocks } from "../lib/db/schema";
import { eq, and, max } from "drizzle-orm";
import type { StudyWeekContent, StudyStation } from "../lib/study/studyContent";

const STUDY_SLUG = "soul-dust-revival-colossians";
const ENRICHED_PATH = join(__dirname, "../soul-dust-interactive/data/colossians-weeks-enriched.json");

type EnrichedWeek = {
  week: number;
  title: string;
  subtitle: string;
  keyVerse: string;
  keyRef: string;
  study: StudyWeekContent["study"];
  passageRef: string;
  passage: StudyWeekContent["passage"];
  stationsLabel: string;
  stationsIntro: string;
  stations: Omit<StudyStation, "questionBlockId">[];
  lifeTitle: string;
  lifeIntro: string;
  practices: StudyWeekContent["practices"];
  prayerLead: string;
  prayerBeats: StudyWeekContent["prayerBeats"];
  prayerClose: string;
  bottomLine: string[];
  benediction: string[];
  closingVerse: string;
  closingRef: string;
  carry: string;
};

async function main() {
  const weeks: EnrichedWeek[] = JSON.parse(readFileSync(ENRICHED_PATH, "utf-8"));
  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.slug, STUDY_SLUG) });
  if (!study) throw new Error(`Study not found: ${STUDY_SLUG}`);

  const studyLessons = await db.select().from(lessons).where(eq(lessons.studyId, study.id));

  let backfilled = 0;
  let skippedAlreadySet = 0;
  const unmatched: string[] = [];

  for (const week of weeks) {
    const expectedTitle = `Week ${week.week}: ${week.title}`;
    const lesson = studyLessons.find((l) => l.title === expectedTitle);
    if (!lesson) {
      unmatched.push(expectedTitle);
      continue;
    }
    if (lesson.studyContent) {
      skippedAlreadySet++;
      continue;
    }

    await db.transaction(async (tx) => {
      const [maxOrderRow] = await tx
        .select({ value: max(contentBlocks.orderIndex) })
        .from(contentBlocks)
        .where(eq(contentBlocks.lessonId, lesson.id));
      let nextOrder = (maxOrderRow?.value ?? -1) + 1;

      const stations: StudyStation[] = [];
      for (const st of week.stations) {
        const [block] = await tx
          .insert(contentBlocks)
          .values({
            lessonId: lesson.id,
            orderIndex: nextOrder++,
            type: "question",
            questionPrompt: st.question,
          })
          .returning();
        if (!block) throw new Error(`Failed to insert question block for ${expectedTitle} / ${st.ref}`);
        stations.push({ ...st, questionBlockId: block.id });
      }

      const content: StudyWeekContent = {
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
        practices: week.practices,
        prayerLead: week.prayerLead,
        prayerBeats: week.prayerBeats,
        prayerClose: week.prayerClose,
        bottomLine: week.bottomLine,
        benediction: week.benediction,
        closingVerse: week.closingVerse,
        closingRef: week.closingRef,
        carry: week.carry,
      };

      await tx.update(lessons).set({ studyContent: content }).where(eq(lessons.id, lesson.id));
    });

    backfilled++;
    console.log(`Backfilled: ${expectedTitle} (${week.stations.length} stations)`);
  }

  console.log(`\nDone. Backfilled ${backfilled}, already set ${skippedAlreadySet}, unmatched ${unmatched.length}.`);
  if (unmatched.length) console.log("Unmatched titles:", unmatched);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
