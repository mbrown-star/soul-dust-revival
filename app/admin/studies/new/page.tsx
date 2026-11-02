import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NewStudyTabs } from "@/components/admin/NewStudyTabs";

export default async function NewStudyPage() {
  const digitalProducts = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(eq(products.format, "digital"));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Add study</h1>
      <NewStudyTabs digitalProducts={digitalProducts} />
    </div>
  );
}
