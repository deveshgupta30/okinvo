import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Amount } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { ActivePill } from "@/components/ui/status-pill";
import { ListTable } from "@/components/ui/list-table";
import { formatAmount } from "@/lib/format";
import {
  archiveProductAction,
  toggleProductAction,
  unarchiveProductAction,
} from "@/server/actions/products";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { getDefaultProfile } from "@/server/dal/profiles";
import { listProducts } from "@/server/dal/products";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalogue.products");
  return { title: t("title") };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("VIEWER");
  const t = await getTranslations("catalogue");
  const tc = await getTranslations("common");
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
        title={t("products.title")}
        description={t("products.description")}
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={showArchived ? "/products" : "/products?archived=1"}>
                {showArchived ? tc("hideArchived") : tc("showArchived")}
              </Link>
            </Button>
            <ExportButton dataset="products" params={showArchived ? { archived: "1" } : {}} />
            {canEdit ? (
              <Button asChild>
                <Link href="/products/new">{t("products.newProduct")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("products.emptyTitle")}
          description={t("products.emptyDescription")}
          action={
            canEdit ? (
              <Button asChild variant="secondary">
                <Link href="/products/new">{t("products.addProduct")}</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ListTable
          empty={null}
          columns={[
            { key: "c0", header: t("list.columns.sku") },
            { key: "c1", header: t("list.columns.name") },
            { key: "c2", header: t("list.columns.unit") },
            { key: "c3", header: t("list.columns.price"), numeric: true },
            { key: "c4", header: t("list.columns.currency") },
            { key: "c5", header: t("list.columns.hsn") },
            { key: "c6", header: t("list.columns.tax"), numeric: true },
            { key: "c7", header: t("list.columns.status") },
            { key: "c8", header: "", sortable: false },
          ]}
          rows={products.map((p) => ({
            id: p.id,
            cells: {
              c0: { node: p.sku, mono: true, sort: p.sku },
              c1: { node: p.name, className: "font-medium", sort: p.name },
              c2: { node: <>{t(`units.${p.unitType}`)}</>, sort: p.unitType },
              c3: {
                node: (
                  <>
                    <Amount>{formatAmount(p.unitPrice, p.currency, locale)}</Amount>
                  </>
                ),
                numeric: true,
                sort: Number(p.unitPrice),
              },
              c4: { node: p.currency, mono: true, sort: p.currency },
              c5: { node: <>{p.hsnCode ?? tc("emptyValue")}</>, mono: true, sort: p.hsnCode ?? "" },
              c6: { node: <>{p.defaultTaxRate}%</>, numeric: true, sort: Number(p.defaultTaxRate) },
              c7: {
                node: (
                  <>
                    <ActivePill active={p.isActive} archived={Boolean(p.archivedAt)} />
                  </>
                ),
                sort: p.archivedAt ? 2 : p.isActive ? 0 : 1,
              },
              c8: {
                node: (
                  <>
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="tertiary" size="sm">
                          <Link href={`/products/${p.id}/edit`}>{tc("edit")}</Link>
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
                              {p.isActive ? t("list.deactivate") : t("list.activate")}
                            </Button>
                          </form>
                        ) : null}
                        {p.archivedAt ? (
                          <ConfirmAction
                            action={unarchiveProductAction}
                            title={t("products.restoreTitle", { sku: p.sku })}
                            confirmLabel={tc("restore")}
                            hidden={{ id: p.id, returnTo }}
                            trigger={tc("restore")}
                            triggerVariant="tertiary"
                            size="sm"
                          />
                        ) : (
                          <ConfirmAction
                            action={archiveProductAction}
                            title={t("products.archiveTitle", { sku: p.sku })}
                            description={t("list.archiveDescription")}
                            confirmLabel={tc("archive")}
                            hidden={{ id: p.id, returnTo }}
                            trigger={tc("archive")}
                            triggerVariant="tertiary"
                            size="sm"
                            destructive
                          />
                        )}
                      </div>
                    ) : null}
                  </>
                ),
                className: "text-right whitespace-nowrap",
              },
            },
          }))}
        />
      )}
    </>
  );
}
