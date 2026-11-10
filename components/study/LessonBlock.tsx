import { sanitizeHtml } from "@/lib/sanitize/html";
import Image from "next/image";
import { VideoBlock } from "./VideoBlock";
import { AudioBlock } from "./AudioBlock";
import { QuestionBlock } from "./QuestionBlock";
import type { StreamSignRequest } from "./streamSign";
import {
  DEFAULT_CALLOUT_COLOR,
  hasMediaSource,
  isR2Url,
  trackUrlForCaptions,
  type ContentBlockData,
} from "@/lib/content/blocks";

/**
 * Renders a single content block based on its type.
 * This is the core of the flexible lesson model — a lesson is just an
 * ordered list of these, mixing text/image/video/audio/questions/callouts freely.
 */
export function LessonBlock({
  block,
  initialAnswer,
  sign = { contentBlockId: block.id },
}: {
  block: ContentBlockData;
  initialAnswer?: string;
  /** How an uploaded video/audio gets its signed URL (week media isn't a content block). */
  sign?: StreamSignRequest;
}) {
  switch (block.type) {
    case "text":
      return (
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.body ?? "") }}
        />
      );
    case "image":
      // Alt text is required at write-time in the admin UI (see components/admin/builder/blockEditors.tsx),
      // so this should always be populated — the fallback string exists only
      // to fail loudly/visibly rather than silently if older data lacks it.
      //
      // width={0} height={0} + sizes="100vw" + the style override is Next's
      // documented pattern for a responsive full-width image whose intrinsic
      // dimensions aren't known ahead of time (these are arbitrary admin
      // uploads) — it still gets real optimization (format conversion, lazy
      // loading, responsive srcset) without needing to store image dimensions.
      if (!block.imageUrl) return null;
      // next/image only optimizes hosts in next.config.js's remotePatterns
      // (the R2 bucket); an image an admin linked from elsewhere renders as
      // a plain <img> instead.
      if (!isR2Url(block.imageUrl, process.env.R2_PUBLIC_BASE_URL)) {
        return (
          // eslint-disable-next-line @next/next/no-img-element -- external URL, not optimizable by next/image
          <img
            src={block.imageUrl}
            alt={block.imageAlt || "Image missing alt text"}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-auto rounded-lg"
          />
        );
      }
      return (
        <Image
          src={block.imageUrl}
          alt={block.imageAlt || "Image missing alt text"}
          width={0}
          height={0}
          sizes="100vw"
          style={{ width: "100%", height: "auto" }}
          className="rounded-lg"
        />
      );
    case "video":
      if (!hasMediaSource(block)) return null;
      return (
        <VideoBlock
          sign={sign}
          mediaUrl={block.mediaUrl}
          captionsUrl={block.captionsUrl ? trackUrlForCaptions(block.captionsUrl, process.env.R2_PUBLIC_BASE_URL) : null}
          transcript={block.transcript}
        />
      );
    case "audio":
      if (!hasMediaSource(block)) return null;
      return <AudioBlock sign={sign} mediaUrl={block.mediaUrl} transcript={block.transcript} />;
    case "question":
      return (
        <QuestionBlock contentBlockId={block.id} prompt={block.questionPrompt ?? ""} initialAnswer={initialAnswer} />
      );
    case "callout":
      return (
        <div
          className="rounded-lg p-5"
          style={{ backgroundColor: block.calloutColor ?? DEFAULT_CALLOUT_COLOR }}
        >
          {block.calloutTitle && <p className="font-semibold mb-2">{block.calloutTitle}</p>}
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.body ?? "") }}
          />
        </div>
      );
    default:
      return null;
  }
}
