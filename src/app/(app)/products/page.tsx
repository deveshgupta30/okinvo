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
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
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
        <Table cards>
          <THead>
            <TR>
              <TH>{t("list.columns.sku")}</TH>
              <TH>{t("list.columns.name")}</TH>
              <TH>{t("list.columns.unit")}</TH>
              <TH numeric>{t("list.columns.price")}</TH>
              <TH>{t("list.columns.currency")}</TH>
              <TH>{t("list.columns.hsn")}</TH>
              <TH numeric>{t("list.columns.tax")}</TH>
              <TH>{t("list.columns.status")}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {products.map((p) => (
              <TR key={p.id}>
                <TD label={t("list.columns.sku")} mono>
                  {p.sku}
                </TD>
                <TD label={t("list.columns.name")} className="font-medium">
                  {p.name}
                </TD>
                <TD label={t("list.columns.unit")}>{t(`units.${p.unitType}`)}</TD>
                <TD label={t("list.columns.price")} numeric>
                  <Amount>{formatAmount(p.unitPrice, p.currency, locale)}</Amount>
                </TD>
                <TD label={t("list.columns.currency")} mono>
                  {p.currency}
                </TD>
                <TD label={t("list.columns.hsn")} mono>
                  {p.hsnCode ?? tc("emptyValue")}
                </TD>
                <TD label={t("list.columns.tax")} numeric>
                  {p.defaultTaxRate}%
                </TD>
                <TD label={t("list.columns.status")}>
                  <ActivePill active={p.isActive} archived={Boolean(p.archivedAt)} />
                </TD>
                <TD label="" className="text-right whitespace-nowrap">
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
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
