import { getDb } from "@/lib/db/client";
import { leaderResources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { LeaderResourceForm } from "@/components/admin/LeaderResourceForm";
import Link from "next/link";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Edit" };
  const db = await getDb();
  const [row] = await db.select({ title: leaderResources.title }).from(leaderResources).where(eq(leaderResources.id, id)).limit(1);
  return { title: row ? `Edit: ${row.title}` : "Edit" };
}

export default async function EditLeaderResourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getDb();
  const resource = await db.query.leaderResources.findFirst({ where: eq(leaderResources.id, id) });
  if (!resource) redirect("/admin/leader-resources");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/leader-resources" className="text-sm text-moss">
          ← Leader Resources
        </Link>
        <h1 className="text-xl font-semibold">{resource.title}</h1>
      </div>

      <LeaderResourceForm
        initial={{
          id: resource.id,
          title: resource.title,
          body: resource.body ?? "",
          fileUrl: resource.fileUrl,
          fileName: resource.fileName,
          published: resource.published,
        }}
      />
    </div>
  );
}
