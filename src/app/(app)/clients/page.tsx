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
import { ListTable } from "@/components/ui/list-table";
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
        <ListTable
          empty={t("noMatch", { q })}
          columns={[
            { key: "c0", header: t("columns.name") },
            { key: "c1", header: t("columns.contact") },
            { key: "c2", header: t("columns.email") },
            { key: "c3", header: t("columns.country") },
            { key: "c4", header: t("columns.currency") },
            { key: "c5", header: t("columns.terms"), numeric: true },
            { key: "c6", header: t("columns.status") },
          ]}
          rows={clients.map((c) => ({
            id: c.id,
            cells: {
              c0: {
                node: (
                  <>
                    <Link href={`/clients/${c.id}`} className="hover:underline">
                      {c.displayName}
                    </Link>
                  </>
                ),
                className: "font-medium",
                sort: c.displayName,
              },
              c1: { node: <>{c.contactPerson ?? tc("emptyValue")}</>, sort: c.contactPerson ?? "" },
              c2: { node: <>{c.email ?? tc("emptyValue")}</>, sort: c.email ?? "" },
              c3: { node: c.countryCode, mono: true, sort: c.countryCode },
              c4: { node: c.currency, mono: true, sort: c.currency },
              c5: {
                node: <>{t("termsDays", { days: c.paymentTermsDays })}</>,
                numeric: true,
                sort: c.paymentTermsDays,
              },
              c6: {
                node: (
                  <>
                    {c.archivedAt ? (
                      <Pill>{tp("archived")}</Pill>
                    ) : (
                      <Pill tone="success">{tp("active")}</Pill>
                    )}
                  </>
                ),
                sort: c.archivedAt ? 1 : 0,
              },
            },
          }))}
        />
      )}
    </>
  );
}
