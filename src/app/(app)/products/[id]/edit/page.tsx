import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { ProductForm } from "@/components/forms/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { deleteProductAction } from "@/server/actions/products";
import { requireRole } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";
import { NotFoundError } from "@/server/dal/errors";
import { getProduct } from "@/server/dal/products";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const { id } = await params;
  const product = await getProduct(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const profiles = (await listProfiles(actor)).map((p) => ({ id: p.id, label: p.label }));
  return (
    <>
      <PageHeader
        title={`Edit ${product.sku}`}
        breadcrumb={[{ href: "/products", label: "Products" }]}
        actions={
          <ConfirmAction
            action={deleteProductAction}
            title={`Delete ${product.sku}?`}
            description="Only possible while no invoice line references it. Otherwise archive it."
            confirmLabel="Delete"
            hidden={{ id: product.id }}
            trigger="Delete"
            triggerVariant="tertiary"
            destructive
          />
        }
      />
      <ProductForm profiles={profiles} product={product} />
    </>
  );
}
