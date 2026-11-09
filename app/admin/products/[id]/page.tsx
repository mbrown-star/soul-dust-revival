import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) redirect("/admin/products");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Edit product</h1>
      <ProductForm
        initial={{
          id: product.id,
          title: product.title,
          slug: product.slug,
          description: product.description ?? "",
          priceCents: product.priceCents,
          digitalPriceCents: product.digitalPriceCents,
          format: product.format,
          type: product.type,
          kind: product.kind,
          bookBinding: product.bookBinding,
          imageUrl: product.imageUrl,
          imageAlt: product.imageAlt ?? "",
          imageWidth: product.imageWidth,
          imageHeight: product.imageHeight,
          backImageUrl: product.backImageUrl,
          backImageAlt: product.backImageAlt ?? "",
          backImageWidth: product.backImageWidth,
          backImageHeight: product.backImageHeight,
          coverPdfUrl: product.coverPdfUrl,
          amazonUrl: product.amazonUrl,
          sellOnStripe: product.sellOnStripe,
          active: product.active,
          featured: product.featured,
        }}
      />
    </div>
  );
}
