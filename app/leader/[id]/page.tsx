import { db } from "@/lib/db/client";
import { leaderResources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import Link from "next/link";

export const dynamic = "force-dynamic";

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
