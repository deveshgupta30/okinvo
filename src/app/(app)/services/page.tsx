import type { Metadata } from "next";
import Link from "next/link";
import { Wrench } from "lucide-react";
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
  archiveServiceAction,
  toggleServiceAction,
  unarchiveServiceAction,
} from "@/server/actions/services";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { getDefaultProfile } from "@/server/dal/profiles";
import { listServices } from "@/server/dal/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalogue.services");
  return { title: t("title") };
}

export default async function ServicesPage({
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
  const [services, profile] = await Promise.all([
    listServices(actor, { includeArchived: showArchived }),
    getDefaultProfile(actor),
  ]);
  const locale = profile?.locale ?? "en-IN";
  const returnTo = showArchived ? "/services?archived=1" : "/services";
  return (
    <>
      <PageHeader
        title={t("services.title")}
        description={t("services.description")}
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={showArchived ? "/services" : "/services?archived=1"}>
                {showArchived ? tc("hideArchived") : tc("showArchived")}
              </Link>
            </Button>
            <ExportButton dataset="services" params={showArchived ? { archived: "1" } : {}} />
            {canEdit ? (
              <Button asChild>
                <Link href="/services/new">{t("services.newService")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      {services.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={t("services.emptyTitle")}
          description={t("services.emptyDescription")}
          action={
            canEdit ? (
              <Button asChild variant="secondary">
                <Link href="/services/new">{t("services.addService")}</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ListTable
          empty={null}
          columns={[
            { key: "c0", header: t("list.columns.name") },
            { key: "c1", header: t("list.columns.unit") },
            { key: "c2", header: t("list.columns.rate"), numeric: true },
            { key: "c3", header: t("list.columns.currency") },
            { key: "c4", header: t("list.columns.sacHsn") },
            { key: "c5", header: t("list.columns.tax"), numeric: true },
            { key: "c6", header: t("list.columns.status") },
            { key: "c7", header: "", sortable: false },
          ]}
          rows={services.map((s) => ({
            id: s.id,
            cells: {
              c0: { node: s.name, className: "font-medium", sort: s.name },
              c1: { node: <>{t(`units.${s.unitType}`)}</>, sort: s.unitType },
              c2: {
                node: (
                  <>
                    <Amount>{formatAmount(s.defaultRate, s.currency, locale)}</Amount>
                  </>
                ),
                numeric: true,
                sort: Number(s.defaultRate),
              },
              c3: { node: s.currency, mono: true, sort: s.currency },
              c4: {
                node: <>{s.sacHsnCode ?? tc("emptyValue")}</>,
                mono: true,
                sort: s.sacHsnCode ?? "",
              },
              c5: { node: <>{s.defaultTaxRate}%</>, numeric: true, sort: Number(s.defaultTaxRate) },
              c6: {
                node: (
                  <>
                    <ActivePill active={s.isActive} archived={Boolean(s.archivedAt)} />
                  </>
                ),
                sort: s.archivedAt ? 2 : s.isActive ? 0 : 1,
              },
              c7: {
                node: (
                  <>
                    {canEdit ? (
                      <>
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="tertiary" size="sm">
                            <Link href={`/services/${s.id}/edit`}>{tc("edit")}</Link>
                          </Button>
                          {!s.archivedAt ? (
                            <form action={toggleServiceAction}>
                              <input type="hidden" name="id" value={s.id} />
                              <input
                                type="hidden"
                                name="isActive"
                                value={s.isActive ? "false" : "true"}
                              />
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <Button type="submit" variant="tertiary" size="sm">
                                {s.isActive ? t("list.deactivate") : t("list.activate")}
                              </Button>
                            </form>
                          ) : null}
                          {s.archivedAt ? (
                            <ConfirmAction
                              action={unarchiveServiceAction}
                              title={t("services.restoreTitle", { name: s.name })}
                              confirmLabel={tc("restore")}
                              hidden={{ id: s.id, returnTo }}
                              trigger={tc("restore")}
                              triggerVariant="tertiary"
                              size="sm"
                            />
                          ) : (
                            <ConfirmAction
                              action={archiveServiceAction}
                              title={t("services.archiveTitle", { name: s.name })}
                              description={t("list.archiveDescription")}
                              confirmLabel={tc("archive")}
                              hidden={{ id: s.id, returnTo }}
                              trigger={tc("archive")}
                              triggerVariant="tertiary"
                              size="sm"
                              destructive
                            />
                          )}
                        </div>
                      </>
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
