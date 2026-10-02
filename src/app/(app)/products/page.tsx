import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Amount } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { ActivePill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatAmount } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/schemas/service-input";
import {
  archiveProductAction,
  toggleProductAction,
  unarchiveProductAction,
} from "@/server/actions/products";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { getDefaultProfile } from "@/server/dal/profiles";
import { listProducts } from "@/server/dal/products";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const [products, profile] = await Promise.all([
    listProducts(actor, { includeArchived: showArchived }),
    getDefaultProfile(actor),
  ]);
  const locale = profile?.locale ?? "en-IN";
  const returnTo = showArchived ? "/products?archived=1" : "/products";
  return (
    <>
      <PageHeader
        title="Products"
        description="Goods you sell, each with a SKU. Picking a product copies its values onto the invoice line."
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={showArchived ? "/products" : "/products?archived=1"}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <ExportButton dataset="products" params={showArchived ? { archived: "1" } : {}} />
            {canEdit ? (
              <Button asChild>
                <Link href="/products/new">New product</Link>
              </Button>
            ) : null}
          </>
        }
      />
      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add the goods you sell with a SKU, HSN code, unit price and tax rate."
          action={
            canEdit ? (
              <Button asChild variant="secondary">
                <Link href="/products/new">Add a product</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <Table cards>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH>Name</TH>
              <TH>Unit</TH>
              <TH numeric>Price</TH>
              <TH>Currency</TH>
              <TH>HSN</TH>
              <TH numeric>Tax</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {products.map((p) => (
              <TR key={p.id}>
                <TD label="SKU" mono>
                  {p.sku}
                </TD>
                <TD label="Name" className="font-medium">
                  {p.name}
                </TD>
                <TD label="Unit">{UNIT_LABELS[p.unitType]}</TD>
                <TD label="Price" numeric>
                  <Amount>{formatAmount(p.unitPrice, p.currency, locale)}</Amount>
                </TD>
                <TD label="Currency" mono>
                  {p.currency}
                </TD>
                <TD label="HSN" mono>
                  {p.hsnCode ?? "—"}
                </TD>
                <TD label="Tax" numeric>
                  {p.defaultTaxRate}%
                </TD>
                <TD label="Status">
                  <ActivePill active={p.isActive} archived={Boolean(p.archivedAt)} />
                </TD>
                <TD label="" className="text-right whitespace-nowrap">
                  {canEdit ? (
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="tertiary" size="sm">
                        <Link href={`/products/${p.id}/edit`}>Edit</Link>
                      </Button>
                      {!p.archivedAt ? (
                        <form action={toggleProductAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            type="hidden"
                            name="isActive"
                            value={p.isActive ? "false" : "true"}
                          />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <Button type="submit" variant="tertiary" size="sm">
                            {p.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </form>
                      ) : null}
                      {p.archivedAt ? (
                        <ConfirmAction
                          action={unarchiveProductAction}
                          title={`Restore ${p.sku}?`}
                          confirmLabel="Restore"
                          hidden={{ id: p.id, returnTo }}
                          trigger="Restore"
                          triggerVariant="tertiary"
                          size="sm"
                        />
                      ) : (
                        <ConfirmAction
                          action={archiveProductAction}
                          title={`Archive ${p.sku}?`}
                          description="Existing invoice lines keep their copied values."
                          confirmLabel="Archive"
                          hidden={{ id: p.id, returnTo }}
                          trigger="Archive"
                          triggerVariant="tertiary"
                          size="sm"
                          destructive
                        />
                      )}
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
