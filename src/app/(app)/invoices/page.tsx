import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Amount, Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Pill, StatusPill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/invoices";
import { COMMON_CURRENCIES } from "@/lib/schemas";
import { InvoiceFiltersSchema } from "@/lib/schemas/invoice-input";
import { withFlash } from "@/lib/flash";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { isDalError } from "@/server/dal/errors";
import { listClients } from "@/server/dal/clients";
import { INVOICE_PAGE_SIZE, invoiceFiscalYears, listInvoices } from "@/server/dal/invoices";
import { getDefaultProfile, listProfiles } from "@/server/dal/profiles";

/** A hand-edited query string with an impossible fiscal year: back to the register with a note. */
function rejectBadFilters(e: unknown): never {
  if (isDalError(e)) redirect(withFlash("/invoices", { kind: "error", message: e.message }));
  throw e;
}

export async function generateMetadata(): Promise<Metadata> {
  const ts = await getTranslations("invoices.shared");
  return { title: ts("invoices") };
}

const STATUSES = Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[];

/** Display status → its `invoices.shared.statuses` catalogue key. */
const STATUS_KEY = {
  DRAFT: "draft",
  ISSUED: "issued",
  SENT: "sent",
  PARTIALLY_PAID: "partiallyPaid",
  PAID: "paid",
  OVERDUE: "overdue",
  VOID: "void",
} as const satisfies Record<keyof typeof STATUS_LABELS, string>;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const params = await searchParams;
  const parsed = InvoiceFiltersSchema.safeParse(params);
  const filters = parsed.success ? parsed.data : { page: 1 };
  const [rows, profiles, clients, defaultProfile] = await Promise.all([
    listInvoices(actor, filters).catch(rejectBadFilters),
    listProfiles(actor),
    listClients(actor),
    getDefaultProfile(actor),
  ]);
  const years = await invoiceFiscalYears(defaultProfile?.fiscalYearStartMonth ?? 4);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const slice = rows.slice((page - 1) * INVOICE_PAGE_SIZE, page * INVOICE_PAGE_SIZE);
  const query = (overrides: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) q.set(k, v);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/invoices?${q.toString()}`;
  };
  const t = await getTranslations("invoices.list");
  const ts = await getTranslations("invoices.shared");
  const tc = await getTranslations("common");
  const nothingYet =
    total === 0 && !parsed.success ? false : total === 0 && Object.values(params).every((v) => !v);

  return (
    <>
      <PageHeader
        title={ts("invoices")}
        description={t("description")}
        actions={
          <>
            <ExportButton dataset="invoices" params={params} />
            {canEdit ? (
              <Button asChild>
                <Link href="/invoices/new">{ts("newInvoice")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <form className="mb-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8" role="search">
        <Field label={t("fiscalYear")} htmlFor="fy">
          <Select id="fy" name="fy" defaultValue={filters.fy ?? ""}>
            <option value="">{tc("all")}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tc("from")} htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </Field>
        <Field label={tc("to")} htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </Field>
        <Field label={t("issuer")} htmlFor="issuerProfileId">
          <Select
            id="issuerProfileId"
            name="issuerProfileId"
            defaultValue={filters.issuerProfileId ?? ""}
          >
            <option value="">{tc("all")}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("client")} htmlFor="clientId">
          <Select id="clientId" name="clientId" defaultValue={filters.clientId ?? ""}>
            <option value="">{tc("all")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tc("status")} htmlFor="status">
          <Select id="status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">{tc("all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(`statuses.${STATUS_KEY[s]}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("einvoice")} htmlFor="einvoice">
          <Select id="einvoice" name="einvoice" defaultValue={filters.einvoice ?? ""}>
            <option value="">{tc("all")}</option>
            <option value="registered">{t("einvoiceFilters.registered")}</option>
            <option value="none">{t("einvoiceFilters.none")}</option>
            <option value="cancelled">{t("einvoiceFilters.cancelled")}</option>
          </Select>
        </Field>
        <Field label={tc("currency")} htmlFor="currency">
          <Select id="currency" name="currency" defaultValue={filters.currency ?? ""}>
            <option value="">{tc("all")}</option>
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tc("search")} htmlFor="q">
          <div className="flex gap-2">
            <Input
              id="q"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder={t("searchPlaceholder")}
            />
            <Button type="submit" variant="secondary">
              {tc("go")}
            </Button>
          </div>
        </Field>
      </form>

      {nothingYet ? (
        <EmptyState
          icon={FileText}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            canEdit ? (
              <Button asChild variant="secondary">
                <Link href="/invoices/new">{ts("newInvoice")}</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Table cards>
            <THead>
              <TR>
                <TH>{t("columns.number")}</TH>
                <TH>{t("columns.client")}</TH>
                <TH>{t("columns.issuer")}</TH>
                <TH>{t("columns.issueDate")}</TH>
                <TH>{t("columns.due")}</TH>
                <TH numeric>{tc("total")}</TH>
                <TH numeric>{t("columns.balance")}</TH>
                <TH>{tc("status")}</TH>
              </TR>
            </THead>
            <TBody>
              {slice.length === 0 ? (
                <TableEmpty colSpan={8}>{t("noMatches")}</TableEmpty>
              ) : (
                slice.map((r) => (
                  <TR key={r.id}>
                    <TD label={t("columns.number")} mono>
                      <Link href={`/invoices/${r.id}`} className="hover:underline">
                        {r.number ?? <span className="text-ink-subtle">{ts("draft")}</span>}
                      </Link>
                    </TD>
                    <TD label={t("columns.client")}>{r.clientName}</TD>
                    <TD label={t("columns.issuer")} className="text-ink-subtle">
                      {r.issuerLabel}
                    </TD>
                    <TD label={t("columns.issueDate")} mono>
                      {formatDate(r.issueDate, r.locale)}
                    </TD>
                    <TD label={t("columns.due")} mono>
                      {formatDate(r.dueDate, r.locale)}
                    </TD>
                    <TD label={tc("total")} numeric>
                      <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                    </TD>
                    <TD label={t("columns.balance")} numeric>
                      <Amount>
                        {r.status === "ISSUED"
                          ? formatMoney(r.balanceDue, r.currency, r.locale)
                          : tc("emptyValue")}
                      </Amount>
                    </TD>
                    <TD label={tc("status")}>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <StatusPill status={r.displayStatus} />
                        {r.einvoiceStatus === "REGISTERED" ? (
                          <Pill tone="success">{t("einvoiceFilters.registered")}</Pill>
                        ) : r.einvoiceStatus === "CANCELLED" ? (
                          <Pill tone="warning">{t("einvoiceFilters.cancelled")}</Pill>
                        ) : null}
                      </span>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-app-caption text-ink-subtle">
            <span>
              {pages > 1
                ? t("countPaged", { count: total, page, pages })
                : t("count", { count: total })}
            </span>
            {pages > 1 ? (
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button asChild variant="tertiary" size="sm">
                    <Link href={query({ page: String(page - 1) })}>{tc("previous")}</Link>
                  </Button>
                ) : null}
                {page < pages ? (
                  <Button asChild variant="tertiary" size="sm">
                    <Link href={query({ page: String(page + 1) })}>{tc("next")}</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <Mono className="sr-only">{t("register")}</Mono>
        </>
      )}
    </>
  );
}
