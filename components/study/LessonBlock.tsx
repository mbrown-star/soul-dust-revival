import DOMPurify from "isomorphic-dompurify";
import Image from "next/image";
import { VideoBlock } from "./VideoBlock";
import { AudioBlock } from "./AudioBlock";
import { QuestionBlock } from "./QuestionBlock";

type ContentBlock = {
  id: string;
  type: "text" | "image" | "video" | "audio" | "question" | "callout";
  body: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  mediaId: string | null;
  captionsUrl: string | null;
  transcript: string | null;
  questionPrompt: string | null;
  calloutTitle: string | null;
  calloutColor: string | null;
};

/**
 * Renders a single content block based on its type.
 * This is the core of the flexible lesson model — a lesson is just an
 * ordered list of these, mixing text/image/video/audio/questions/callouts freely.
 */
export function LessonBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "text":
      return (
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.body ?? "") }}
        />
      );
    case "image":
      // Alt text is required at write-time in the admin UI (see BlockEditor.tsx),
      // so this should always be populated — the fallback string exists only
      // to fail loudly/visibly rather than silently if older data lacks it.
      //
      // width={0} height={0} + sizes="100vw" + the style override is Next's
      // documented pattern for a responsive full-width image whose intrinsic
      // dimensions aren't known ahead of time (these are arbitrary admin
      // uploads) — it still gets real optimization (format conversion, lazy
      // loading, responsive srcset) without needing to store image dimensions.
      return block.imageUrl ? (
        <Image
          src={block.imageUrl}
          alt={block.imageAlt || "Image missing alt text"}
          width={0}
          height={0}
          sizes="100vw"
          style={{ width: "100%", height: "auto" }}
          className="rounded-lg"
        />
      ) : null;
    case "video":
      return (
        <VideoBlock
          contentBlockId={block.id}
          captionsUrl={block.captionsUrl}
          transcript={block.transcript}
        />
      );
    case "audio":
      return <AudioBlock contentBlockId={block.id} transcript={block.transcript} />;
    case "question":
      return <QuestionBlock contentBlockId={block.id} prompt={block.questionPrompt ?? ""} />;
    case "callout":
      return (
        <div
          className="rounded-lg p-5"
          style={{ backgroundColor: block.calloutColor ?? "#fef3c7" }}
        >
          {block.calloutTitle && <p className="font-semibold mb-2">{block.calloutTitle}</p>}
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.body ?? "") }}
          />
        </div>
      );
    default:
      return null;
  }
}
