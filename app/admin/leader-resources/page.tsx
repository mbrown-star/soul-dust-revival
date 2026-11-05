import { getDb } from "@/lib/db/client";
import { leaderResources } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import Link from "next/link";
import { NewLeaderResourceButton } from "@/components/admin/NewLeaderResourceButton";

export default async function AdminLeaderResourcesPage() {
  const db = await getDb();
  // Safety cap, not real pagination -- this list is admin-curated and
  // realistically stays in the dozens, but nothing should fetch unbounded.
  const resources = await db.select().from(leaderResources).orderBy(asc(leaderResources.orderIndex)).limit(100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl font-semibold">Leader resources</h1>
        <NewLeaderResourceButton />
      </div>

      <div className="divide-y border rounded-lg">
        {resources.map((r) => (
          <Link
            key={r.id}
            href={`/admin/leader-resources/${r.id}`}
            className="flex justify-between items-center p-4 hover:bg-neutral-50"
          >
            <span>{r.title}</span>
            <span className="text-sm text-neutral-400">{!r.published && "draft"}</span>
          </Link>
        ))}
        {resources.length === 0 && <p className="p-4 text-neutral-600">No leader resources yet.</p>}
      </div>
    </div>
  );
}
