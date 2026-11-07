import { getDb } from "@/lib/db/client";
import { studies } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";

export default async function AdminStudiesPage() {
  const db = await getDb();
  // Safety cap, not real pagination -- this list is admin-curated and
  // realistically stays in the dozens, but nothing should fetch unbounded.
  const allStudies = await db.select().from(studies).orderBy(desc(studies.createdAt)).limit(100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl font-semibold">Studies</h1>
        <Link href="/admin/studies/new" className="inline-block bg-ink text-white rounded-lg px-4 py-2 text-center">
          Add study
        </Link>
      </div>

      <div className="divide-y border rounded-lg">
        {allStudies.map((s) => (
          <Link
            key={s.id}
            href={`/admin/studies/${s.id}`}
            className="flex items-center gap-4 p-4 hover:bg-moss/5"
          >
            {s.coverImageUrl ? (
              <Image
                src={s.coverImageUrl}
                alt=""
                width={48}
                height={48}
                className="w-12 h-12 object-cover rounded"
              />
            ) : (
              <div className="w-12 h-12 bg-moss/10 rounded" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{s.title}</p>
                {/* REAL FIX (qa/findings/FINDINGS_2026-11-07.md #9): there
                    was previously no way to tell a devotional from an
                    interactive study on this list without opening each one. */}
                <span
                  data-testid="study-kind-badge"
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.kind === "study" ? "bg-ember-700/10 text-ember-700" : "bg-moss/10 text-moss"
                  }`}
                >
                  {s.kind === "study" ? "Study" : "Devotional"}
                </span>
              </div>
              <p className="text-sm text-moss">
                /{s.slug} {!s.published && "· draft"}
              </p>
            </div>
          </Link>
        ))}
        {allStudies.length === 0 && <p className="p-4 text-moss">No studies yet.</p>}
      </div>
    </div>
  );
}
