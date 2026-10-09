import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProductForm } from "@/components/forms/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalogue.products");
  return { title: t("newProduct") };
}

export default async function NewProductPage() {
  const actor = await requireRole("EDITOR");
  const t = await getTranslations("catalogue.products");
  const profiles = (await listProfiles(actor)).map((p) => ({ id: p.id, label: p.label }));
  return (
    <>
      <PageHeader title={t("newProduct")} breadcrumb={[{ href: "/products", label: t("title") }]} />
      <ProductForm profiles={profiles} product={null} />
    </>
  );
}
