import type { WeekMedia } from "@/lib/study/studyContent";
import { LessonBlock } from "./LessonBlock";

/**
 * Server-rendered list of media placed inside a Study week (after a section,
 * part, station, or practice, or at the end of a tab). Rendered through the
 * same LessonBlock as lesson content blocks, so images, sanitized callouts,
 * and video/audio behave identically; an uploaded video/audio is signed by
 * lesson + Stream id instead of by content block.
 */
export function WeekMediaList({ lessonId, items }: { lessonId: string; items: WeekMedia[] }) {
  return (
    <div className="space-y-6">
      {items.map((media) => (
        <LessonBlock
          key={media.id}
          sign={media.mediaId ? { lessonId, mediaId: media.mediaId } : undefined}
          block={{
            id: media.id,
            type: media.type,
            body: media.body ?? null,
            imageUrl: media.imageUrl ?? null,
            imageAlt: media.imageAlt ?? null,
            mediaId: media.mediaId ?? null,
            mediaUrl: media.mediaUrl ?? null,
            captionsUrl: media.captionsUrl ?? null,
            transcript: media.transcript ?? null,
            questionPrompt: null,
            calloutTitle: media.calloutTitle ?? null,
            calloutColor: media.calloutColor ?? null,
          }}
        />
      ))}
    </div>
  );
}
