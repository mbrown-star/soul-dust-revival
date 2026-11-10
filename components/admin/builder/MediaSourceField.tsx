"use client";

import { useId, useState } from "react";
import { isHttpsUrl } from "@/lib/content/blocks";
import { inputClass } from "./fields";

export type MediaKind = "image" | "video" | "audio";

const KIND_LABEL: Record<MediaKind, string> = { image: "image", video: "video", audio: "audio" };
const ACCEPT: Record<MediaKind, string> = { image: "image/jpeg,image/png,image/webp,image/gif", video: "video/*", audio: "audio/*" };

/**
 * One media source, chosen two ways: upload a file, or link one that's
 * already hosted somewhere (https only). The parent decides what each
 * produces -- an R2 URL for an uploaded image, a Stream UID for uploaded
 * video/audio, or the pasted URL itself.
 */
export function MediaSourceField({
  kind,
  currentUrl,
  hasUpload,
  uploadDescription,
  onUpload,
  onUrl,
  onClear,
}: {
  kind: MediaKind;
  /** The linked URL, when the current source is a URL. */
  currentUrl: string | null;
  /** True when the current source is an uploaded file. */
  hasUpload: boolean;
  /** Shown in place of a preview for an uploaded video/audio. */
  uploadDescription?: string;
  onUpload: (file: File) => Promise<void>;
  onUrl: (url: string) => void;
  onClear: () => void;
}) {
  const groupId = useId();
  const urlInputId = useId();
  const [mode, setMode] = useState<"upload" | "url">(currentUrl ? "url" : "upload");
  const [draftUrl, setDraftUrl] = useState(currentUrl ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const label = KIND_LABEL[kind];
  const hasSource = hasUpload || !!currentUrl;

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      await onUpload(file);
      setDraftUrl("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function commitUrl() {
    const value = draftUrl.trim();
    if (!value) {
      setUrlError(null);
      return;
    }
    if (!isHttpsUrl(value)) {
      setUrlError("Enter a full https:// link.");
      return;
    }
    setUrlError(null);
    if (value !== currentUrl) onUrl(value);
  }

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-md focus-within:ring-2 focus-within:ring-ink ${
      active ? "bg-ink text-white" : "text-moss hover:bg-moss/10"
    }`;

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">How to add this {label}</legend>
      <div className="inline-flex gap-1 p-1 rounded-lg bg-moss/5 border border-moss/10">
        {(["upload", "url"] as const).map((option) => (
          <label key={option} className={`cursor-pointer ${tabClass(mode === option)}`}>
            <input
              type="radio"
              name={groupId}
              value={option}
              checked={mode === option}
              onChange={() => setMode(option)}
              className="sr-only"
            />
            {option === "upload" ? "Upload file" : "Use a link"}
          </label>
        ))}
      </div>

      {mode === "upload" ? (
        <div className="space-y-1">
          <input
            type="file"
            accept={ACCEPT[kind]}
            aria-label={`Upload ${label} file`}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFile(file);
            }}
            className="block text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-moss/20 file:bg-parchment file:text-ink"
          />
          {kind !== "image" && (
            <p className="text-xs text-moss">Uploaded {label} plays through a private, expiring link only readers with access can open.</p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor={urlInputId} className="block text-xs font-medium text-moss uppercase tracking-wide">
            {label} link
          </label>
          <div className="flex gap-2">
            <input
              id={urlInputId}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={draftUrl}
              aria-invalid={!!urlError}
              aria-describedby={`${urlInputId}-note${urlError ? ` ${urlInputId}-error` : ""}`}
              onChange={(e) => setDraftUrl(e.target.value)}
              onBlur={commitUrl}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitUrl();
                }
              }}
              className={inputClass}
            />
          </div>
          {urlError && (
            <p id={`${urlInputId}-error`} className="text-xs text-error">
              {urlError}
            </p>
          )}
          <p id={`${urlInputId}-note`} className="text-xs text-moss">
            {kind === "image"
              ? "The image loads straight from this link, so it must stay online."
              : `The ${label} plays straight from this link, which anyone with the lesson can see and share. Use a direct file link (for example, ending in .mp4 or .mp3), not a page.`}
          </p>
        </div>
      )}

      <p role="status" aria-live="polite" className="text-sm text-moss min-h-[1.25rem]">
        {uploading ? `Uploading ${label}…` : ""}
      </p>
      {uploadError && (
        <p role="alert" className="text-sm text-error">
          {uploadError}
        </p>
      )}

      {hasSource && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {uploadDescription && hasUpload && <span className="text-moss">{uploadDescription}</span>}
          {currentUrl && kind !== "image" && <span className="text-moss truncate max-w-full">Linked: {currentUrl}</span>}
          <button
            type="button"
            onClick={() => {
              setDraftUrl("");
              onClear();
            }}
            className="text-error underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
          >
            Remove {label}
          </button>
        </div>
      )}
    </fieldset>
  );
}
