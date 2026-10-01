import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
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
import { requireOwner } from "@/server/auth";
import { listClients } from "@/server/dal/clients";
import { listCreditNotes, type CreditNoteDisplayStatus } from "@/server/dal/credit-notes";
import { listProfiles } from "@/server/dal/profiles";

export const metadata: Metadata = { title: "Credit notes" };

const STATUSES: CreditNoteDisplayStatus[] = ["DRAFT", "ISSUED", "SENT", "VOID"];

export default async function CreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
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
    }),
    listProfiles(actor),
    listClients(actor),
  ]);
  const filtered = Object.values(params).some((v) => typeof v === "string" && v);
  return (
    <>
      <PageHeader
        title="Credit notes"
        description="Raised against issued invoices; each reduces its invoice balance when issued."
        actions={<ExportButton dataset="credit-notes" params={params} />}
      />
      <form className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6" role="search">
        <Field label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={s("from") ?? ""} />
        </Field>
        <Field label="To" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={s("to") ?? ""} />
        </Field>
        <Field label="Issuer" htmlFor="issuerProfileId">
          <Select
            id="issuerProfileId"
            name="issuerProfileId"
            defaultValue={s("issuerProfileId") ?? ""}
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
          <Select id="clientId" name="clientId" defaultValue={s("clientId") ?? ""}>
            <option value="">All</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">All</option>
            {STATUSES.map((x) => (
              <option key={x} value={x}>
                {x.charAt(0) + x.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search" htmlFor="q">
          <div className="flex gap-2">
            <Input
              id="q"
              name="q"
              defaultValue={s("q") ?? ""}
              placeholder="Number, reason, client"
            />
            <Button type="submit" variant="secondary">
              Go
            </Button>
          </div>
        </Field>
      </form>
      {rows.length === 0 && !filtered ? (
        <EmptyState
          icon={Receipt}
          title="No credit notes yet"
          description="Open an issued invoice and choose “Credit note” to reduce what it owes."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Number</TH>
              <TH>Against</TH>
              <TH>Client</TH>
              <TH>Issue date</TH>
              <TH>Reason</TH>
              <TH numeric>Total</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>No credit notes match these filters.</TableEmpty>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD mono>
                    <Link href={`/credit-notes/${r.id}`} className="hover:underline">
                      {r.number ?? <span className="text-ink-subtle">Draft</span>}
                    </Link>
                  </TD>
                  <TD mono>
                    <Link href={`/invoices/${r.invoiceId}`} className="hover:underline">
                      {r.invoiceNumber}
                    </Link>
                  </TD>
                  <TD>{r.clientName}</TD>
                  <TD mono>{formatDate(r.issueDate, r.locale)}</TD>
                  <TD className="max-w-xs truncate text-ink-subtle">{r.reason}</TD>
                  <TD numeric>
                    <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                  </TD>
                  <TD>
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
