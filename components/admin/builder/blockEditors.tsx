"use client";

import { createContext, useContext, useState } from "react";
import { RichTextEditor, type RichTextSnippet } from "../RichTextEditor";
import { ColorPicker } from "../ColorPicker";
import { DEFAULT_CALLOUT_COLOR, hasMediaSource, isR2Url, type ContentBlockData } from "@/lib/content/blocks";
import type { studies } from "@/lib/db/schema";
import { MediaSourceField } from "./MediaSourceField";
import { TextField } from "./fields";
import { uploadCaptions, uploadImage, uploadToStream } from "./uploads";

export type BlockEditorProps = {
  block: ContentBlockData;
  update: (patch: Partial<ContentBlockData>) => void;
};

export type StudyKind = (typeof studies.$inferSelect)["kind"];

/** Page-level settings the block editors need, provided once by the builder. */
export const BuilderConfigContext = createContext<{ r2PublicBaseUrl?: string; studyKind: StudyKind }>({
  studyKind: "study",
});

// The exact headings lib/devotional/parseDevotionalHtml.ts recognizes, so an
// admin can add a devotional day's named parts without knowing the magic text.
const DEVOTIONAL_SNIPPETS: RichTextSnippet[] = [
  { label: "Key verse + reference", html: "<p>“Verse text”</p><p><strong>— BOOK 1:1</strong></p>" },
  { label: "Lift Up Your Eyes", html: "<p><strong>LIFT UP YOUR EYES</strong></p><p></p>" },
  { label: "A Question to Sit With", html: "<p><strong>A QUESTION TO SIT WITH</strong></p><p></p>" },
];

export function TextBlockEditor({ block, update }: BlockEditorProps) {
  const { studyKind } = useContext(BuilderConfigContext);
  return (
    <RichTextEditor
      label="Text block"
      content={block.body ?? ""}
      onChange={(html) => update({ body: html })}
      snippets={studyKind === "devotional" ? DEVOTIONAL_SNIPPETS : undefined}
    />
  );
}

export function ImageBlockEditor({ block, update }: BlockEditorProps) {
  const { r2PublicBaseUrl } = useContext(BuilderConfigContext);
  const uploaded = !!block.imageUrl && isR2Url(block.imageUrl, r2PublicBaseUrl);
  const altMissing = !!block.imageUrl && !block.imageAlt?.trim();

  return (
    <div className="space-y-4">
      {block.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary (possibly external) URL
        <img
          src={block.imageUrl}
          alt={block.imageAlt || "Image preview -- add alt text below"}
          className="max-h-56 max-w-full h-auto rounded border border-moss/10"
        />
      )}
      <MediaSourceField
        kind="image"
        currentUrl={uploaded ? null : block.imageUrl}
        hasUpload={uploaded}
        onUpload={async (file) => update({ imageUrl: await uploadImage(file) })}
        onUrl={(url) => update({ imageUrl: url })}
        onClear={() => update({ imageUrl: null })}
      />
      {block.imageUrl && (
        <TextField
          label="Alt text"
          required
          value={block.imageAlt ?? ""}
          onChange={(value) => update({ imageAlt: value })}
          placeholder="Describe the image for screen reader users"
          error={altMissing ? "Alt text is required whenever an image is attached (WCAG 1.1.1)." : undefined}
        />
      )}
    </div>
  );
}

function CaptionsField({ block, update }: BlockEditorProps) {
  const missing = hasMediaSource(block) && !block.captionsUrl;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-moss uppercase tracking-wide">
        Captions file (.vtt) <span aria-hidden="true" className="text-error">*</span>
        <span className="sr-only"> (required)</span>
        <input
          type="file"
          accept=".vtt,text/vtt"
          aria-invalid={missing}
          className="block mt-1 text-sm normal-case tracking-normal font-normal text-ink file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-moss/20 file:bg-parchment"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploadError(null);
            setUploading(true);
            try {
              update({ captionsUrl: await uploadCaptions(file) });
            } catch (err) {
              setUploadError(err instanceof Error ? err.message : "Captions upload failed.");
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      <p role="status" aria-live="polite" className="text-xs text-moss">
        {uploading ? "Uploading captions…" : ""}
      </p>
      {uploadError && (
        <p role="alert" className="text-xs text-error">
          {uploadError}
        </p>
      )}
      {block.captionsUrl ? (
        <p className="text-sm text-success">
          Captions attached.{" "}
          <button type="button" className="text-error underline" onClick={() => update({ captionsUrl: null })}>
            Remove captions
          </button>
        </p>
      ) : (
        missing && <p className="text-xs text-error">Captions are required for video content (WCAG 1.2.2).</p>
      )}
    </div>
  );
}

function MediaBlockEditor({ block, update, kind }: BlockEditorProps & { kind: "video" | "audio" }) {
  const transcriptRequired = kind === "audio";
  return (
    <div className="space-y-4">
      {block.mediaUrl &&
        (kind === "video" ? (
          <video src={block.mediaUrl} controls preload="metadata" className="w-full max-h-64 rounded bg-black" />
        ) : (
          <audio src={block.mediaUrl} controls preload="metadata" className="w-full" />
        ))}
      <MediaSourceField
        kind={kind}
        currentUrl={block.mediaUrl}
        hasUpload={!!block.mediaId}
        uploadDescription="Uploaded to the video host (plays for readers with access)."
        onUpload={async (file) => update({ mediaId: await uploadToStream(file), mediaUrl: null })}
        onUrl={(url) => update({ mediaUrl: url, mediaId: null })}
        onClear={() => update({ mediaId: null, mediaUrl: null })}
      />
      {kind === "video" && <CaptionsField block={block} update={update} />}
      <TextField
        label="Transcript"
        multiline
        rows={4}
        required={transcriptRequired}
        value={block.transcript ?? ""}
        onChange={(value) => update({ transcript: value })}
        placeholder="Full text transcript, for screen reader users and anyone who can't play media"
        error={
          transcriptRequired && hasMediaSource(block) && !block.transcript?.trim()
            ? "A transcript is required for audio content (WCAG 1.2.1)."
            : undefined
        }
      />
    </div>
  );
}

export function VideoBlockEditor(props: BlockEditorProps) {
  return <MediaBlockEditor {...props} kind="video" />;
}

export function AudioBlockEditor(props: BlockEditorProps) {
  return <MediaBlockEditor {...props} kind="audio" />;
}

export function QuestionBlockEditor({ block, update }: BlockEditorProps) {
  return (
    <TextField
      label="Question prompt"
      multiline
      value={block.questionPrompt ?? ""}
      onChange={(value) => update({ questionPrompt: value })}
      hint="Readers answer in their own words; each reader's answer is saved to their account."
    />
  );
}

export function CalloutBlockEditor({ block, update }: BlockEditorProps) {
  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        value={block.calloutTitle ?? ""}
        onChange={(value) => update({ calloutTitle: value })}
        placeholder="e.g. Key Verse, Reflection, Prayer"
      />
      <div>
        <span className="block text-xs font-medium text-moss uppercase tracking-wide mb-1">Background color</span>
        <ColorPicker value={block.calloutColor ?? DEFAULT_CALLOUT_COLOR} onChange={(color) => update({ calloutColor: color })} />
      </div>
      <RichTextEditor label="Callout text" content={block.body ?? ""} onChange={(html) => update({ body: html })} />
    </div>
  );
}
