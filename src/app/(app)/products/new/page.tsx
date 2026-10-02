import type { Metadata } from "next";
import { ProductForm } from "@/components/forms/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireRole("EDITOR");
  return (
    <>
      <PageHeader title="New product" breadcrumb={[{ href: "/products", label: "Products" }]} />
      <ProductForm product={null} />
    </>
  );
}
