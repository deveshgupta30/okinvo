import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Amount, Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
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

export const metadata: Metadata = { title: "Invoices" };

const STATUSES = Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[];

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
  const nothingYet =
    total === 0 && !parsed.success ? false : total === 0 && Object.values(params).every((v) => !v);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Drafts, issued and voided invoices; statuses derive from payments and due dates."
        actions={
          <>
            <ExportButton dataset="invoices" params={params} />
            {canEdit ? (
              <Button asChild>
                <Link href="/invoices/new">New invoice</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <form className="mb-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8" role="search">
        <Field label="Fiscal year" htmlFor="fy">
          <Select id="fy" name="fy" defaultValue={filters.fy ?? ""}>
            <option value="">All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </Field>
        <Field label="To" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </Field>
        <Field label="Issuer" htmlFor="issuerProfileId">
          <Select
            id="issuerProfileId"
            name="issuerProfileId"
            defaultValue={filters.issuerProfileId ?? ""}
          >
            <option value="">All</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Client" htmlFor="clientId">
          <Select id="clientId" name="clientId" defaultValue={filters.clientId ?? ""}>
            <option value="">All</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue={filters.currency ?? ""}>
            <option value="">All</option>
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search" htmlFor="q">
          <div className="flex gap-2">
            <Input
              id="q"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Number, PO, client"
            />
            <Button type="submit" variant="secondary">
              Go
            </Button>
          </div>
        </Field>
      </form>

      {nothingYet ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Build your first invoice: pick a client, add lines, watch the preview, then issue it."
          action={
            canEdit ? (
              <Button asChild variant="secondary">
                <Link href="/invoices/new">New invoice</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Table cards>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Client</TH>
                <TH>Issuer</TH>
                <TH>Issue date</TH>
                <TH>Due</TH>
                <TH numeric>Total</TH>
                <TH numeric>Balance</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {slice.length === 0 ? (
                <TableEmpty colSpan={8}>No invoices match these filters.</TableEmpty>
              ) : (
                slice.map((r) => (
                  <TR key={r.id}>
                    <TD label="Number" mono>
                      <Link href={`/invoices/${r.id}`} className="hover:underline">
                        {r.number ?? <span className="text-ink-subtle">Draft</span>}
                      </Link>
                    </TD>
                    <TD label="Client">{r.clientName}</TD>
                    <TD label="Issuer" className="text-ink-subtle">
                      {r.issuerLabel}
                    </TD>
                    <TD label="Issue date" mono>
                      {formatDate(r.issueDate, r.locale)}
                    </TD>
                    <TD label="Due" mono>
                      {formatDate(r.dueDate, r.locale)}
                    </TD>
                    <TD label="Total" numeric>
                      <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                    </TD>
                    <TD label="Balance" numeric>
                      <Amount>
                        {r.status === "ISSUED"
                          ? formatMoney(r.balanceDue, r.currency, r.locale)
                          : "—"}
                      </Amount>
                    </TD>
                    <TD label="Status">
                      <StatusPill status={r.displayStatus} />
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-app-caption text-ink-subtle">
            <span>
              {total} invoice{total === 1 ? "" : "s"}
              {pages > 1 ? ` · page ${page} of ${pages}` : ""}
            </span>
            {pages > 1 ? (
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button asChild variant="tertiary" size="sm">
                    <Link href={query({ page: String(page - 1) })}>Previous</Link>
                  </Button>
                ) : null}
                {page < pages ? (
                  <Button asChild variant="tertiary" size="sm">
                    <Link href={query({ page: String(page + 1) })}>Next</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <Mono className="sr-only">register</Mono>
        </>
      )}
    </>
  );
}
