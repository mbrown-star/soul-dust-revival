import { db } from "@/lib/db/client";
import { studies } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";

export default async function AdminStudiesPage() {
  const allStudies = await db.select().from(studies).orderBy(desc(studies.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl font-semibold">Studies</h1>
        <Link href="/admin/studies/new" className="inline-block bg-neutral-900 text-white rounded-lg px-4 py-2 text-center">
          Add study
        </Link>
      </div>

      <div className="divide-y border rounded-lg">
        {allStudies.map((s) => (
          <Link
            key={s.id}
            href={`/admin/studies/${s.id}`}
            className="flex items-center gap-4 p-4 hover:bg-neutral-50"
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
              <div className="w-12 h-12 bg-neutral-100 rounded" />
            )}
            <div className="flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-neutral-500">
                /{s.slug} {!s.published && "· draft"}
              </p>
            </div>
          </Link>
        ))}
        {allStudies.length === 0 && <p className="p-4 text-neutral-500">No studies yet.</p>}
      </div>
    </div>
  );
}
