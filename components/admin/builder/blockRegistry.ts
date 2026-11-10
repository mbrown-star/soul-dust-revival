import type { ComponentType } from "react";
import { hasMediaSource, type ContentBlockData, type ContentBlockType } from "@/lib/content/blocks";
import { htmlToPlainText as plainText } from "@/lib/content/plainText";
import type { BlockIconName } from "./BlockIcon";
import {
  AudioBlockEditor,
  CalloutBlockEditor,
  ImageBlockEditor,
  QuestionBlockEditor,
  TextBlockEditor,
  VideoBlockEditor,
  type BlockEditorProps,
} from "./blockEditors";

export type BlockDefinition = {
  type: ContentBlockType;
  label: string;
  description: string;
  icon: BlockIconName;
  category: "Content" | "Media" | "Interactive";
  Editor: ComponentType<BlockEditorProps>;
  summary: (block: ContentBlockData) => string;
  /** Something the author still has to do, shown on the collapsed card. */
  issue: (block: ContentBlockData) => string | null;
};

// Single source for every block type the builder offers: the palette, each
// card's icon/label/summary, and which editor opens inside it.
export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  {
    type: "text",
    label: "Text",
    description: "Paragraphs, headings, lists, links",
    icon: "text",
    category: "Content",
    Editor: TextBlockEditor,
    summary: (b) => plainText(b.body),
    issue: (b) => (plainText(b.body) ? null : "Empty"),
  },
  {
    type: "callout",
    label: "Callout",
    description: "A colored box to set something apart",
    icon: "callout",
    category: "Content",
    Editor: CalloutBlockEditor,
    summary: (b) => [b.calloutTitle, plainText(b.body)].filter(Boolean).join(" — "),
    issue: (b) => (b.calloutTitle || plainText(b.body) ? null : "Empty"),
  },
  {
    type: "image",
    label: "Image",
    description: "Upload or link an image",
    icon: "image",
    category: "Media",
    Editor: ImageBlockEditor,
    summary: (b) => b.imageAlt || (b.imageUrl ? "Image" : ""),
    issue: (b) => (!b.imageUrl ? "No image yet" : !b.imageAlt?.trim() ? "Needs alt text" : null),
  },
  {
    type: "video",
    label: "Video",
    description: "Upload or link a video",
    icon: "video",
    category: "Media",
    Editor: VideoBlockEditor,
    summary: (b) => (b.mediaUrl ? `Linked video` : b.mediaId ? "Uploaded video" : "") + (b.transcript ? ` — ${b.transcript}` : ""),
    issue: (b) => (!hasMediaSource(b) ? "No video yet" : !b.captionsUrl ? "Needs captions" : null),
  },
  {
    type: "audio",
    label: "Audio",
    description: "Upload or link audio",
    icon: "audio",
    category: "Media",
    Editor: AudioBlockEditor,
    summary: (b) => (b.mediaUrl ? "Linked audio" : b.mediaId ? "Uploaded audio" : "") + (b.transcript ? ` — ${b.transcript}` : ""),
    issue: (b) => (!hasMediaSource(b) ? "No audio yet" : !b.transcript?.trim() ? "Needs transcript" : null),
  },
  {
    type: "question",
    label: "Question",
    description: "A prompt readers answer and save",
    icon: "question",
    category: "Interactive",
    Editor: QuestionBlockEditor,
    summary: (b) => b.questionPrompt ?? "",
    issue: (b) => (b.questionPrompt?.trim() ? null : "No prompt yet"),
  },
];

export const BLOCK_DEFINITION_BY_TYPE = Object.fromEntries(BLOCK_DEFINITIONS.map((d) => [d.type, d])) as Record<
  ContentBlockType,
  BlockDefinition
>;
