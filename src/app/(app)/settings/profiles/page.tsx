import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  archiveProfileAction,
  setDefaultProfileAction,
  unarchiveProfileAction,
} from "@/server/actions/profiles";
import { requireOwner } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.profiles");
  return { title: t("metaTitle") };
}

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
  const t = await getTranslations("settings.profiles");
  const tc = await getTranslations("common");
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const profiles = await listProfiles(actor, { includeArchived: showArchived });
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={showArchived ? "/settings/profiles" : "/settings/profiles?archived=1"}>
                {showArchived ? tc("hideArchived") : tc("showArchived")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/settings/profiles/new">{t("newProfile")}</Link>
            </Button>
          </>
        }
      />
      {profiles.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/profiles/new">{t("createProfile")}</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("columns.label")}</TH>
              <TH>{t("columns.legalName")}</TH>
              <TH>{t("columns.type")}</TH>
              <TH>{t("columns.country")}</TH>
              <TH>{t("columns.currency")}</TH>
              <TH>{t("columns.regime")}</TH>
              <TH>{t("columns.status")}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {profiles.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.label}</TD>
                <TD>{p.legalName}</TD>
                <TD>{p.type === "COMPANY" ? t("types.company") : t("types.individual")}</TD>
                <TD mono>{p.countryCode}</TD>
                <TD mono>{p.baseCurrency}</TD>
                <TD>{p.defaultTaxRegime.replace("_", " ")}</TD>
                <TD>
                  {p.archivedAt ? (
                    <Pill tone="neutral">{tc("archived")}</Pill>
                  ) : p.isDefault ? (
                    <Pill tone="success">{tc("default")}</Pill>
                  ) : null}
                </TD>
                <TD className="text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={`/settings/profiles/${p.id}/edit`}>{tc("edit")}</Link>
                    </Button>
                    {!p.archivedAt && !p.isDefault ? (
                      <ConfirmAction
                        action={setDefaultProfileAction}
                        title={t("makeDefaultTitle", { label: p.label })}
                        description={t("makeDefaultDescription")}
                        confirmLabel={tc("setDefault")}
                        hidden={{ id: p.id }}
                        trigger={tc("setDefault")}
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : null}
                    {p.archivedAt ? (
                      <ConfirmAction
                        action={unarchiveProfileAction}
                        title={t("restoreTitle", { label: p.label })}
                        confirmLabel={tc("restore")}
                        hidden={{ id: p.id, returnTo: "/settings/profiles?archived=1" }}
                        trigger={tc("restore")}
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : (
                      <ConfirmAction
                        action={archiveProfileAction}
                        title={t("archiveTitle", { label: p.label })}
                        description={t("archiveDescription")}
                        confirmLabel={tc("archive")}
                        hidden={{ id: p.id }}
                        trigger={tc("archive")}
                        triggerVariant="tertiary"
                        size="sm"
                        destructive
                      />
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
