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
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
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
        <Table cards>
          <THead>
            <TR>
              <TH>{t("list.columns.name")}</TH>
              <TH>{t("list.columns.unit")}</TH>
              <TH numeric>{t("list.columns.rate")}</TH>
              <TH>{t("list.columns.currency")}</TH>
              <TH>{t("list.columns.sacHsn")}</TH>
              <TH numeric>{t("list.columns.tax")}</TH>
              <TH>{t("list.columns.status")}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {services.map((s) => (
              <TR key={s.id}>
                <TD label={t("list.columns.name")} className="font-medium">
                  {s.name}
                </TD>
                <TD label={t("list.columns.unit")}>{t(`units.${s.unitType}`)}</TD>
                <TD label={t("list.columns.rate")} numeric>
                  <Amount>{formatAmount(s.defaultRate, s.currency, locale)}</Amount>
                </TD>
                <TD label={t("list.columns.currency")} mono>
                  {s.currency}
                </TD>
                <TD label={t("list.columns.sacHsn")} mono>
                  {s.sacHsnCode ?? tc("emptyValue")}
                </TD>
                <TD label={t("list.columns.tax")} numeric>
                  {s.defaultTaxRate}%
                </TD>
                <TD label={t("list.columns.status")}>
                  <ActivePill active={s.isActive} archived={Boolean(s.archivedAt)} />
                </TD>
                <TD label="" className="text-right whitespace-nowrap">
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
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
