import { ProductForm } from "@/components/admin/ProductForm";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Add product</h1>
      <ProductForm />
    </div>
  );
}
