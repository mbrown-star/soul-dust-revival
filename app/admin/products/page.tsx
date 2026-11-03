import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";

export default async function AdminProductsPage() {
  const allProducts = await db.select().from(products).orderBy(desc(products.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl font-semibold">Products</h1>
        <Link href="/admin/products/new" className="inline-block bg-neutral-900 text-white rounded-lg px-4 py-2 text-center">
          Add product
        </Link>
      </div>

      <div className="divide-y border rounded-lg">
        {allProducts.map((p) => (
          <Link
            key={p.id}
            href={`/admin/products/${p.id}`}
            className="flex items-center gap-4 p-4 hover:bg-neutral-50"
          >
            {p.imageUrl ? (
              <Image
                src={p.imageUrl}
                alt=""
                width={48}
                height={48}
                className="w-12 h-12 object-cover rounded"
              />
            ) : (
              <div className="w-12 h-12 bg-neutral-100 rounded" />
            )}
            <div className="flex-1">
              <p className="font-medium">{p.title}</p>
              <p className="text-sm text-neutral-600">
                {p.format} · ${(p.priceCents / 100).toFixed(2)}
                {!p.active && " · inactive"}
              </p>
            </div>
          </Link>
        ))}
        {allProducts.length === 0 && (
          <p className="p-4 text-neutral-600">No products yet.</p>
        )}
      </div>
    </div>
  );
}
