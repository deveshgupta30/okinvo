import type { Metadata } from "next";
import { ProductForm } from "@/components/forms/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const actor = await requireRole("EDITOR");
  const profiles = (await listProfiles(actor)).map((p) => ({ id: p.id, label: p.label }));
  return (
    <>
      <PageHeader title="New product" breadcrumb={[{ href: "/products", label: "Products" }]} />
      <ProductForm profiles={profiles} product={null} />
    </>
  );
}
