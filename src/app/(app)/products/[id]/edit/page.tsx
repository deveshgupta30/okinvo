import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { ProductForm } from "@/components/forms/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { deleteProductAction } from "@/server/actions/products";
import { requireRole } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";
import { NotFoundError } from "@/server/dal/errors";
import { getProduct } from "@/server/dal/products";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalogue.products");
  return { title: t("editMetaTitle") };
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const t = await getTranslations("catalogue");
  const tc = await getTranslations("common");
  const { id } = await params;
  const product = await getProduct(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const profiles = (await listProfiles(actor)).map((p) => ({ id: p.id, label: p.label }));
  return (
    <>
      <PageHeader
        title={t("products.editTitle", { sku: product.sku })}
        breadcrumb={[{ href: "/products", label: t("products.title") }]}
        actions={
          <ConfirmAction
            action={deleteProductAction}
            title={t("products.deleteTitle", { sku: product.sku })}
            description={t("list.deleteDescription")}
            confirmLabel={tc("delete")}
            hidden={{ id: product.id }}
            trigger={tc("delete")}
            triggerVariant="tertiary"
            destructive
          />
        }
      />
      <ProductForm profiles={profiles} product={product} />
    </>
  );
}
