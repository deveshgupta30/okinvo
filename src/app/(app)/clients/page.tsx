import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { listClients } from "@/server/dal/clients";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients.list");
  return { title: t("title") };
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("VIEWER");
  const t = await getTranslations("clients.list");
  const tc = await getTranslations("common");
  const tp = await getTranslations("ui.activePill");
  const canEdit = hasRole(actor, "EDITOR");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const showArchived = params.archived === "1";
  const clients = await listClients(actor, { q, includeArchived: showArchived });
  const toggle = new URLSearchParams();
  if (q) toggle.set("q", q);
  if (!showArchived) toggle.set("archived", "1");
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={`/clients?${toggle.toString()}`}>
                {showArchived ? tc("hideArchived") : tc("showArchived")}
              </Link>
            </Button>
            <ExportButton dataset="clients" params={showArchived ? { archived: "1" } : {}} />
            {canEdit ? (
              <Button asChild>
                <Link href="/clients/new">{t("newClient")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <form className="mb-4 flex max-w-sm gap-2" role="search">
        {showArchived ? <input type="hidden" name="archived" value="1" /> : null}
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
        />
        <Button type="submit" variant="secondary">
          {tc("search")}
        </Button>
      </form>
      {clients.length === 0 && !q ? (
        <EmptyState
          icon={Users}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            canEdit ? (
              <Button asChild variant="secondary">
                <Link href="/clients/new">{t("addClient")}</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <Table cards>
          <THead>
            <TR>
              <TH>{t("columns.name")}</TH>
              <TH>{t("columns.contact")}</TH>
              <TH>{t("columns.email")}</TH>
              <TH>{t("columns.country")}</TH>
              <TH>{t("columns.currency")}</TH>
              <TH numeric>{t("columns.terms")}</TH>
              <TH>{t("columns.status")}</TH>
            </TR>
          </THead>
          <TBody>
            {clients.length === 0 ? (
              <TableEmpty colSpan={7}>{t("noMatch", { q })}</TableEmpty>
            ) : (
              clients.map((c) => (
                <TR key={c.id}>
                  <TD label={t("columns.name")} className="font-medium">
                    <Link href={`/clients/${c.id}`} className="hover:underline">
                      {c.displayName}
                    </Link>
                  </TD>
                  <TD label={t("columns.contact")}>{c.contactPerson ?? tc("emptyValue")}</TD>
                  <TD label={t("columns.email")}>{c.email ?? tc("emptyValue")}</TD>
                  <TD label={t("columns.country")} mono>
                    {c.countryCode}
                  </TD>
                  <TD label={t("columns.currency")} mono>
                    {c.currency}
                  </TD>
                  <TD label={t("columns.terms")} numeric>
                    {t("termsDays", { days: c.paymentTermsDays })}
                  </TD>
                  <TD label={t("columns.status")}>
                    {c.archivedAt ? (
                      <Pill>{tp("archived")}</Pill>
                    ) : (
                      <Pill tone="success">{tp("active")}</Pill>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}
    </>
  );
}
