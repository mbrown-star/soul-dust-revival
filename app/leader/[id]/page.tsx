import { db } from "@/lib/db/client";
import { leaderResources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";
import { requireLeaderOrAdmin } from "@/lib/admin/guard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// Mirrors the parent layout's own role check (see leader/layout.tsx) --
// metadata generation runs independently of the layout/page render, so a
// naive lookup would leak a gated resource's real title to a visitor who
// isn't a leader/admin, even though the layout correctly blocks the content.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const leaderSession = await requireLeaderOrAdmin();
  if (!leaderSession) return { title: "Leader Resources" };

  const { id } = await params;
  const resource = await db.query.leaderResources.findFirst({ where: eq(leaderResources.id, id) });
  return { title: resource?.title ?? "Leader Resources" };
}

export default async function LeaderResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const resource = await db.query.leaderResources.findFirst({
    where: eq(leaderResources.id, id),
  });

  if (!resource || !resource.published) notFound();

  return (
    <article className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
      <Link
        href="/leader"
        className="font-sans text-sm text-moss hover:text-ember focus:outline-none focus:ring-2 focus:ring-ink rounded"
      >
        ← Leader Resources
      </Link>

      <h1 className="font-display font-bold text-3xl text-ink mt-4 mb-6">{resource.title}</h1>

      {resource.fileUrl && (
        <a
          href={resource.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block font-sans font-semibold bg-ink text-parchment rounded-lg px-5 py-2.5 mb-8 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
        >
          Download {resource.fileName ?? "PDF"}
        </a>
      )}

      {resource.body && (
        <div
          className="prose max-w-none font-serif prose-headings:font-display prose-a:text-ember"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resource.body) }}
        />
      )}
    </article>
  );
}
