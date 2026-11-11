import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { studies, studyResources } from "@/lib/db/schema";
import { getStudyAccess } from "@/lib/entitlements/check";
import { createSignedDownloadUrl } from "@/lib/r2/download";

const idSchema = z.string().uuid();

/**
 * Downloads a study resource: anyone who owns the study (or an admin) is sent
 * to a five-minute signed link that saves the file under its own name. The
 * file's storage key never reaches the browser.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const db = await getDb();
  const [row] = await db
    .select({ resource: studyResources, study: studies })
    .from(studyResources)
    .innerJoin(studies, eq(studyResources.studyId, studies.id))
    .where(eq(studyResources.id, id));
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { resource, study } = row;

  const session = await getSession();
  if (!session) {
    // A link followed while signed out: sign in, then come back to the study.
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/studies/${study.slug}`)}`, req.url));
  }

  const access = await getStudyAccess(session, study.productId);
  // A draft study doesn't exist to anyone but an admin, same as its page.
  if (!study.published && !access.isAdminPreview) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) {
    return NextResponse.json({ error: "forbidden", message: "This resource comes with the study." }, { status: 403 });
  }

  const url = await createSignedDownloadUrl(resource.fileKey, resource.fileName, resource.contentType);
  const res = NextResponse.redirect(url, 302);
  // The signed link is personal and short-lived; never cache the redirect.
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
