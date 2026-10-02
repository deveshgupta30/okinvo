import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, Item } from "@/components/ui/description-list";
import { Amount, Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, StatusPill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { formatAddressLines } from "@/lib/schemas";
import {
  archiveClientAction,
  deleteClientAction,
  unarchiveClientAction,
} from "@/server/actions/clients";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { clientSummary, getClient } from "@/server/dal/clients";
import { NotFoundError } from "@/server/dal/errors";
import { listInvoices } from "@/server/dal/invoices";
import { getDefaultProfile } from "@/server/dal/profiles";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const { id } = await params;
  const client = await getClient(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [summary, invoices, defaultProfile] = await Promise.all([
    clientSummary(actor, client.id),
    listInvoices(actor, { clientId: client.id }),
    getDefaultProfile(actor),
  ]);
  const recent = invoices.slice(0, 10);
  const locale = defaultProfile?.locale ?? "en-IN";
  const returnTo = `/clients/${client.id}`;
  return (
    <>
      <PageHeader
        title={
          <>
            {client.displayName}
            {client.archivedAt ? <Pill>Archived</Pill> : null}
          </>
        }
        breadcrumb={[{ href: "/clients", label: "Clients" }]}
        actions={
          canEdit ? (
            <>
              <Button asChild variant="secondary">
                <Link href={`/invoices/new?client=${client.id}`}>New invoice</Link>
              </Button>
              <Button asChild variant="tertiary">
                <Link href={`/clients/${client.id}/edit`}>Edit</Link>
              </Button>
              {client.archivedAt ? (
                <ConfirmAction
                  action={unarchiveClientAction}
                  title="Restore this client?"
                  confirmLabel="Restore"
                  hidden={{ id: client.id, returnTo }}
                  trigger="Restore"
                  triggerVariant="tertiary"
                />
              ) : (
                <ConfirmAction
                  action={archiveClientAction}
                  title="Archive this client?"
                  description="It leaves the pickers; invoices and history stay intact."
                  confirmLabel="Archive"
                  hidden={{ id: client.id, returnTo }}
                  trigger="Archive"
                  triggerVariant="tertiary"
                  destructive
                />
              )}
              <ConfirmAction
                action={deleteClientAction}
                title="Delete this client?"
                description="Only possible while no invoice references the client."
                confirmLabel="Delete"
                hidden={{ id: client.id }}
                trigger="Delete"
                triggerVariant="tertiary"
                destructive
              />
            </>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <Item label="Contact">{client.contactPerson}</Item>
              <Item label="Email">{client.email}</Item>
              <Item label="Phone">{client.phone}</Item>
              <Item label="Country" mono>
                {client.countryCode}
                {client.stateCode ? ` · ${client.stateCode}` : ""}
                {client.gstStateCode ? ` · GST ${client.gstStateCode}` : ""}
              </Item>
              <Item label="Tax ID" mono>
                {client.taxId ? `${client.taxIdType ?? ""} ${client.taxId}`.trim() : null}
              </Item>
              <Item label="Currency" mono>
                {client.currency}
              </Item>
              <Item label="Payment terms">{client.paymentTermsDays} days</Item>
              <Item label="Expected TDS">
                {client.defaultTdsRate ? `${client.defaultTdsRate}%` : null}
              </Item>
              <Item label="Notes">{client.notes}</Item>
            </DescriptionList>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Addresses</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <Item label="Billing">
                {formatAddressLines(client.billingAddress).map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </Item>
              <Item label="Shipping">
                {client.shippingAddress
                  ? formatAddressLines(client.shippingAddress).map((l) => (
                      <span key={l} className="block">
                        {l}
                      </span>
                    ))
                  : null}
              </Item>
            </DescriptionList>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lifetime</CardTitle>
            <Button asChild variant="link">
              <Link href={`/invoices?clientId=${client.id}`}>Open the register</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {summary.currencies.length === 0 ? (
              <p className="text-app-body text-ink-subtle">
                No issued invoices yet{summary.drafts > 0 ? ` (${summary.drafts} draft)` : ""}.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <Table>
                  <THead>
                    <TR>
                      <TH>Currency</TH>
                      <TH numeric>Invoices</TH>
                      <TH numeric>Billed</TH>
                      <TH numeric>Received</TH>
                      <TH numeric>Credited</TH>
                      <TH numeric>Outstanding</TH>
                      <TH numeric>Overdue</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {summary.currencies.map((c) => (
                      <TR key={c.currency}>
                        <TD mono>{c.currency}</TD>
                        <TD numeric mono>
                          {c.invoices}
                        </TD>
                        <TD numeric>
                          <Amount>{formatMoney(c.billed, c.currency, locale)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount>{formatMoney(c.received, c.currency, locale)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount>{formatMoney(c.credited, c.currency, locale)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount>{formatMoney(c.outstanding, c.currency, locale)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount
                            className={c.overdueCount > 0 ? "text-semantic-danger" : undefined}
                          >
                            {formatMoney(c.overdue, c.currency, locale)}
                          </Amount>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <p className="text-app-caption text-ink-subtle">
                  First invoice{" "}
                  <Mono>
                    {summary.firstInvoiceDate ? formatDate(summary.firstInvoiceDate, locale) : "—"}
                  </Mono>
                  , latest{" "}
                  <Mono>
                    {summary.lastInvoiceDate ? formatDate(summary.lastInvoiceDate, locale) : "—"}
                  </Mono>
                  {summary.drafts > 0
                    ? ` · ${summary.drafts} draft${summary.drafts === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Number</TH>
                  <TH>Issue date</TH>
                  <TH>Due</TH>
                  <TH numeric>Total</TH>
                  <TH numeric>Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {recent.length === 0 ? (
                  <TableEmpty colSpan={6}>No invoices for this client yet.</TableEmpty>
                ) : (
                  recent.map((r) => (
                    <TR key={r.id}>
                      <TD mono>
                        <Link href={`/invoices/${r.id}`} className="hover:underline">
                          {r.number ?? <span className="text-ink-subtle">Draft</span>}
                        </Link>
                      </TD>
                      <TD mono>{formatDate(r.issueDate, r.locale)}</TD>
                      <TD mono>{formatDate(r.dueDate, r.locale)}</TD>
                      <TD numeric>
                        <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                      </TD>
                      <TD numeric>
                        <Amount>
                          {r.status === "ISSUED"
                            ? formatMoney(r.balanceDue, r.currency, r.locale)
                            : "—"}
                        </Amount>
                      </TD>
                      <TD>
                        <StatusPill status={r.displayStatus} />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
