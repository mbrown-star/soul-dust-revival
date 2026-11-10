/** Identifies an uploaded video/audio for /api/stream/sign-url. */
export type StreamSignRequest = { contentBlockId: string } | { lessonId: string; mediaId: string };
