import { NextResponse } from "next/server";
import { CAPTIONS_FILE_PATTERN } from "@/lib/content/blocks";
import { IMMUTABLE_CACHE_CONTROL } from "@/lib/r2/cacheControl";

/**
 * Serves an uploaded WebVTT captions file from the app's own origin.
 *
 * Browsers only load a <track> from another origin when the <video> is in
 * CORS mode *and* that origin allows it -- uploaded captions live on the R2
 * bucket's domain, so readers never actually saw them. Served from here, the
 * track is same-origin and loads for uploaded and linked videos alike.
 *
 * Only `<uuid>.vtt` names (the shape the captions upload route creates) are
 * accepted, and the file is always fetched from the configured R2 bucket, so
 * this can't be pointed at any other URL. Captions aren't gated: like every
 * R2 object, the file is already public at its R2 URL.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!CAPTIONS_FILE_PATTERN.test(file)) return new NextResponse("Not found", { status: 404 });

  const upstream = await fetch(`${process.env.R2_PUBLIC_BASE_URL}/captions/${file}`).catch(() => null);
  if (!upstream?.ok) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(await upstream.text(), {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": IMMUTABLE_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
