import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { or, eq } from "drizzle-orm";
import { NewStudyTabs } from "@/components/admin/NewStudyTabs";

export default async function NewStudyPage() {
  const db = await getDb();
  // A format "both" product's digital side grants an entitlement exactly
  // like a plain "digital" product (see lib/stripe/webhook-handlers.ts's
  // isDigitalVariant) -- excluding it here left every "both" product
  // unable to gate a study at all.
  const digitalProducts = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(or(eq(products.format, "digital"), eq(products.format, "both")));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Add study</h1>
      <NewStudyTabs digitalProducts={digitalProducts} />
    </div>
  );
}
