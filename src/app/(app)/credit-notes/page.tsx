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
import { Amount } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
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
          <Input id="from" name="from" type="date" defaultValue={s("from") ?? ""} />
        </Field>
        <Field label={t("filters.to")} htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={s("to") ?? ""} />
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
        <Table cards>
          <THead>
            <TR>
              <TH>{t("columns.number")}</TH>
              <TH>{t("columns.against")}</TH>
              <TH>{t("columns.client")}</TH>
              <TH>{t("columns.issueDate")}</TH>
              <TH>{t("columns.reason")}</TH>
              <TH numeric>{t("columns.total")}</TH>
              <TH>{t("columns.status")}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>{t("noMatch")}</TableEmpty>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD label={t("columns.number")} mono>
                    <Link href={`/credit-notes/${r.id}`} className="hover:underline">
                      {r.number ?? <span className="text-ink-subtle">{t("draft")}</span>}
                    </Link>
                  </TD>
                  <TD label={t("columns.against")} mono>
                    <Link href={`/invoices/${r.invoiceId}`} className="hover:underline">
                      {r.invoiceNumber}
                    </Link>
                  </TD>
                  <TD label={t("columns.client")}>{r.clientName}</TD>
                  <TD label={t("columns.issueDate")} mono>
                    {formatDate(r.issueDate, r.locale)}
                  </TD>
                  <TD label={t("columns.reason")} className="max-w-xs truncate text-ink-subtle">
                    {r.reason}
                  </TD>
                  <TD label={t("columns.total")} numeric>
                    <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                  </TD>
                  <TD label={t("columns.status")}>
                    <StatusPill status={r.displayStatus} />
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
