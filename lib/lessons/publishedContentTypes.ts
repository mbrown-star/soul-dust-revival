import type { ContentBlockData } from "@/lib/content/blocks";
import type { StudyWeekContent } from "@/lib/study/studyContent";

/**
 * A published lesson's content as readers see it -- a frozen copy of the
 * working copy (content_blocks rows and lessons.study_content) taken at
 * publish time. Blocks keep their ids, so saved answers and Stream signing
 * line up with the live rows. Kept type-only so lib/db/schema.ts can use it.
 */
export type PublishedLessonContent = {
  blocks: ContentBlockData[];
  studyContent: StudyWeekContent | null;
  publishedAt: string;
};
