import { db } from "@/lib/db/client";
import { leaderResources } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LeaderResourcesPage() {
  const resources = await db
    .select()
    .from(leaderResources)
    .where(eq(leaderResources.published, true))
    .orderBy(asc(leaderResources.orderIndex));

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-display font-bold text-3xl text-ink mb-2">Leader Resources</h1>
      <p className="font-serif text-moss mb-10">
        Guides and notes for leading a group through a study.
      </p>

      {resources.length === 0 ? (
        <p className="font-serif text-moss">Nothing posted yet.</p>
      ) : (
        <div className="divide-y divide-moss/20">
          {resources.map((r) => (
            <Link
              key={r.id}
              href={`/leader/${r.id}`}
              className="block py-4 focus:outline-none focus:ring-2 focus:ring-ink rounded"
            >
              <h2 className="font-display font-semibold text-lg text-ink hover:text-ember-700">
                {r.title}
              </h2>
              {r.fileName && <p className="font-sans text-sm text-moss mt-1">Includes 📄 {r.fileName}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
