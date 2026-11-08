"use client";

import { useState, useId } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { ColorPicker } from "./ColorPicker";

export type ContentBlockData = {
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

async function saveBlock(id: string, patch: Partial<ContentBlockData>) {
  await fetch("/api/admin/content-blocks", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
}

export function BlockEditor({
  block,
  onChange,
  onDelete,
}: {
  block: ContentBlockData;
  onChange: (updated: ContentBlockData) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const altId = useId();
  const captionsId = useId();
  const transcriptId = useId();
  const calloutTitleId = useId();
  const questionId = useId();

  const altTextMissing = block.type === "image" && !!block.imageUrl && !block.imageAlt?.trim();
  const captionsMissing = block.type === "video" && !!block.mediaId && !block.captionsUrl?.trim();

  function update(patch: Partial<ContentBlockData>) {
    const updated = { ...block, ...patch };
    onChange(updated);
    saveBlock(block.id, patch);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const key = `content/${crypto.randomUUID()}.${ext}`;
    const res = await fetch("/api/admin/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, contentType: file.type }),
    });
    const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    update({ imageUrl: publicUrl });
    setUploading(false);
  }

  async function uploadMedia(file: File) {
    setUploading(true);
    const res = await fetch("/api/admin/stream-upload-url", { method: "POST" });
    const { uploadUrl, uid } = (await res.json()) as { uploadUrl: string; uid: string };

    const formData = new FormData();
    formData.append("file", file);
    await fetch(uploadUrl, { method: "POST", body: formData });

    update({ mediaId: uid });
    setUploading(false);
  }

  async function uploadCaptions(file: File) {
    setUploading(true);
    const key = `captions/${crypto.randomUUID()}.vtt`;
    const res = await fetch("/api/admin/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, contentType: "text/vtt" }),
    });
    const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "text/vtt" } });
    update({ captionsUrl: publicUrl });
    setUploading(false);
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase tracking-wide text-moss">{block.type}</span>
        <button
          onClick={onDelete}
          aria-label={`Delete this ${block.type} block`}
          className="text-sm text-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-error rounded"
        >
          Delete
        </button>
      </div>

      {block.type === "text" && (
        <RichTextEditor content={block.body ?? ""} onChange={(html) => update({ body: html })} />
      )}

      {block.type === "image" && (
        <div className="space-y-2">
          {block.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.imageUrl}
              alt={block.imageAlt || "Untitled image — add alt text below"}
              className="max-h-48 max-w-full h-auto rounded"
            />
          )}
          <input
            type="file"
            accept="image/*"
            aria-label="Upload image"
            onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
          />
          <p role="status" aria-live="polite" className="text-sm text-moss h-5">
            {uploading ? "Uploading..." : ""}
          </p>

          {block.imageUrl && (
            <div>
              <label htmlFor={altId} className="block text-sm font-medium mb-1">
                Alt text <span aria-hidden="true" className="text-error">*</span>
                <span className="sr-only"> (required)</span>
              </label>
              <input
                id={altId}
                required
                aria-invalid={altTextMissing}
                aria-describedby={altTextMissing ? `${altId}-error` : undefined}
                className="w-full border rounded-lg p-2"
                placeholder="Describe the image for screen reader users"
                value={block.imageAlt ?? ""}
                onChange={(e) => update({ imageAlt: e.target.value })}
              />
              {altTextMissing && (
                <p id={`${altId}-error`} className="text-sm text-error mt-1">
                  Alt text is required whenever an image is attached (WCAG 1.1.1).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {(block.type === "video" || block.type === "audio") && (
        <div className="space-y-3">
          {block.mediaId && (
            <p className="text-sm text-moss">Uploaded (media ID: {block.mediaId})</p>
          )}
          <input
            type="file"
            accept={block.type === "video" ? "video/*" : "audio/*"}
            aria-label={`Upload ${block.type}`}
            onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0])}
          />
          <p role="status" aria-live="polite" className="text-sm text-moss h-5">
            {uploading ? "Uploading..." : ""}
          </p>

          {block.type === "video" && block.mediaId && (
            <div>
              <label htmlFor={captionsId} className="block text-sm font-medium mb-1">
                Captions file (.vtt) <span aria-hidden="true" className="text-error">*</span>
                <span className="sr-only"> (required)</span>
              </label>
              <input
                id={captionsId}
                type="file"
                accept=".vtt"
                aria-invalid={captionsMissing}
                aria-describedby={captionsMissing ? `${captionsId}-error` : undefined}
                onChange={(e) => e.target.files?.[0] && uploadCaptions(e.target.files[0])}
              />
              {block.captionsUrl && <p className="text-sm text-success mt-1">Captions uploaded ✓</p>}
              {captionsMissing && (
                <p id={`${captionsId}-error`} className="text-sm text-error mt-1">
                  Captions are required for video content (WCAG 1.2.2).
                </p>
              )}
            </div>
          )}

          {block.mediaId && (
            <div>
              <label htmlFor={transcriptId} className="block text-sm font-medium mb-1">
                Transcript {block.type === "audio" && (
                  <>
                    <span aria-hidden="true" className="text-error">*</span>
                    <span className="sr-only"> (required)</span>
                  </>
                )}
              </label>
              <textarea
                id={transcriptId}
                rows={4}
                className="w-full border rounded-lg p-2"
                placeholder="Full text transcript, for screen reader users and anyone who can't play media"
                value={block.transcript ?? ""}
                onChange={(e) => update({ transcript: e.target.value })}
              />
            </div>
          )}
        </div>
      )}

      {block.type === "question" && (
        <div>
          <label htmlFor={questionId} className="sr-only">Question prompt</label>
          <textarea
            id={questionId}
            className="w-full border rounded-lg p-3"
            placeholder="Question prompt"
            value={block.questionPrompt ?? ""}
            onChange={(e) => update({ questionPrompt: e.target.value })}
          />
        </div>
      )}

      {block.type === "callout" && (
        <div className="space-y-3">
          <label htmlFor={calloutTitleId} className="sr-only">Callout title</label>
          <input
            id={calloutTitleId}
            className="w-full border rounded-lg p-2"
            placeholder="Title (e.g. Key Verse, Reflection, Prayer)"
            value={block.calloutTitle ?? ""}
            onChange={(e) => update({ calloutTitle: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium mb-1">Background color</label>
            <ColorPicker
              value={block.calloutColor ?? "#fef3c7"}
              onChange={(color) => update({ calloutColor: color })}
            />
          </div>
          <RichTextEditor content={block.body ?? ""} onChange={(html) => update({ body: html })} />
        </div>
      )}
    </div>
  );
}
