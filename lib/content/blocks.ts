// Single source of truth for a lesson content block's shape -- the admin
// builder, the reader's LessonBlock renderer, and the content-blocks API all
// import from here instead of each declaring their own copy.

export const CONTENT_BLOCK_TYPES = ["text", "image", "video", "audio", "question", "callout"] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export type ContentBlockData = {
  id: string;
  type: ContentBlockType;
  body: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  mediaId: string | null;
  mediaUrl: string | null;
  captionsUrl: string | null;
  transcript: string | null;
  questionPrompt: string | null;
  calloutTitle: string | null;
  calloutColor: string | null;
};

export type ContentBlockField = Exclude<keyof ContentBlockData, "id" | "type">;

// Which columns each block type actually uses. The API rejects a PATCH that
// writes a field outside its block's own list, and duplicating a block copies
// only these.
export const FIELDS_BY_TYPE: Record<ContentBlockType, readonly ContentBlockField[]> = {
  text: ["body"],
  image: ["imageUrl", "imageAlt"],
  video: ["mediaId", "mediaUrl", "captionsUrl", "transcript"],
  audio: ["mediaId", "mediaUrl", "transcript"],
  question: ["questionPrompt"],
  callout: ["calloutTitle", "calloutColor", "body"],
};

export const DEFAULT_CALLOUT_COLOR = "#fef3c7";

// The fields in `patch` (ignoring undefined ones) that a block of `type`
// doesn't use -- a non-empty result means the write should be rejected.
export function fieldsOutsideType(
  type: ContentBlockType,
  patch: Partial<Record<ContentBlockField, unknown>>
): ContentBlockField[] {
  const allowed = FIELDS_BY_TYPE[type];
  return (Object.keys(patch) as ContentBlockField[]).filter(
    (field) => patch[field] !== undefined && !allowed.includes(field)
  );
}

// A video/audio block plays from either an uploaded Stream asset or a linked
// URL, never both: setting one source clears the other.
export function withExclusiveMediaSource<T extends { mediaId?: string | null; mediaUrl?: string | null }>(patch: T): T {
  if (patch.mediaId) return { ...patch, mediaUrl: null };
  if (patch.mediaUrl) return { ...patch, mediaId: null };
  return patch;
}

export function hasMediaSource(block: Pick<ContentBlockData, "mediaId" | "mediaUrl">): boolean {
  return !!block.mediaId || !!block.mediaUrl;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// True when `url` is served from the app's own R2 bucket, so the reader can
// use next/image for it (only the R2 host is in images.remotePatterns) and
// fall back to a plain <img> for any other pasted URL.
export function isR2Url(url: string, r2PublicBaseUrl: string | undefined): boolean {
  if (!r2PublicBaseUrl) return false;
  try {
    return new URL(url).hostname === new URL(r2PublicBaseUrl).hostname;
  } catch {
    return false;
  }
}
