import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Amount } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { ListTable } from "@/components/ui/list-table";
import { formatDate, formatMoney } from "@/lib/format";
import { withFlash } from "@/lib/flash";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { isDalError } from "@/server/dal/errors";
import { listClients } from "@/server/dal/clients";
import { listCreditNotes, type CreditNoteDisplayStatus } from "@/server/dal/credit-notes";
import { listProfiles } from "@/server/dal/profiles";

/** A hand-edited query string with an impossible fiscal year: back to the register with a note. */
function rejectBadFilters(e: unknown): never {
  if (isDalError(e)) redirect(withFlash("/credit-notes", { kind: "error", message: e.message }));
  throw e;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creditNotes.list");
  return { title: t("metaTitle") };
}

const STATUSES: CreditNoteDisplayStatus[] = ["DRAFT", "ISSUED", "SENT", "VOID"];

export default async function CreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const t = await getTranslations("creditNotes.list");
  const params = await searchParams;
  const s = (k: string) =>
    typeof params[k] === "string" && params[k] ? (params[k] as string) : undefined;
  const status = STATUSES.find((x) => x === s("status"));
  const [rows, profiles, clients] = await Promise.all([
    listCreditNotes(actor, {
      from: s("from"),
      to: s("to"),
      issuerProfileId: s("issuerProfileId"),
      clientId: s("clientId"),
      status,
      q: s("q"),
    }).catch(rejectBadFilters),
    listProfiles(actor),
    listClients(actor),
  ]);
  const filtered = Object.values(params).some((v) => typeof v === "string" && v);
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <ExportButton dataset="credit-notes" params={params} />
            {canEdit ? (
              <Button asChild>
                <Link href="/credit-notes/new">{t("newCreditNote")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <form className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6" role="search">
        <Field label={t("filters.from")} htmlFor="from">
          <DateField id="from" name="from" defaultValue={s("from") ?? ""} />
        </Field>
        <Field label={t("filters.to")} htmlFor="to">
          <DateField id="to" name="to" defaultValue={s("to") ?? ""} />
        </Field>
        <Field label={t("filters.issuer")} htmlFor="issuerProfileId">
          <Select
            id="issuerProfileId"
            name="issuerProfileId"
            defaultValue={s("issuerProfileId") ?? ""}
          >
            <option value="">{t("filters.all")}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("filters.client")} htmlFor="clientId">
          <Select id="clientId" name="clientId" defaultValue={s("clientId") ?? ""}>
            <option value="">{t("filters.all")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("filters.status")} htmlFor="status">
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">{t("filters.all")}</option>
            {STATUSES.map((x) => (
              <option key={x} value={x}>
                {t(`statuses.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("filters.search")} htmlFor="q">
          <div className="flex gap-2">
            <Input
              id="q"
              name="q"
              defaultValue={s("q") ?? ""}
              placeholder={t("filters.searchPlaceholder")}
            />
            <Button type="submit" variant="secondary">
              {t("filters.go")}
            </Button>
          </div>
        </Field>
      </form>
      {rows.length === 0 && !filtered ? (
        <EmptyState icon={Receipt} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <ListTable
          empty={t("noMatch")}
          columns={[
            { key: "c0", header: t("columns.number") },
            { key: "c1", header: t("columns.against") },
            { key: "c2", header: t("columns.client") },
            { key: "c3", header: t("columns.issueDate") },
            { key: "c4", header: t("columns.reason") },
            { key: "c5", header: t("columns.total"), numeric: true },
            { key: "c6", header: t("columns.status") },
          ]}
          rows={rows.map((r) => ({
            id: r.id,
            cells: {
              c0: {
                node: (
                  <>
                    <Link href={`/credit-notes/${r.id}`} className="hover:underline">
                      {r.number ?? <span className="text-ink-subtle">{t("draft")}</span>}
                    </Link>
                  </>
                ),
                mono: true,
                sort: r.number ?? "",
              },
              c1: {
                node: (
                  <>
                    <Link href={`/invoices/${r.invoiceId}`} className="hover:underline">
                      {r.invoiceNumber}
                    </Link>
                  </>
                ),
                mono: true,
                sort: r.invoiceNumber ?? "",
              },
              c2: { node: r.clientName, sort: r.clientName },
              c3: { node: formatDate(r.issueDate, r.locale), mono: true, sort: r.issueDate },
              c4: {
                node: r.reason,
                className: "max-w-xs truncate text-ink-subtle",
                sort: r.reason,
              },
              c5: {
                node: (
                  <>
                    <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                  </>
                ),
                numeric: true,
                sort: Number(r.total),
              },
              c6: {
                node: (
                  <>
                    <StatusPill status={r.displayStatus} />
                  </>
                ),
                sort: r.displayStatus,
              },
            },
          }))}
        />
      )}
    </>
  );
}
