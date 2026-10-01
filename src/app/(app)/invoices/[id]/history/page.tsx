import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SentLog } from "@/components/email/sent-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requireOwner } from "@/server/auth";
import { invoiceHistory } from "@/server/dal/audit-log";
import { listEmailMessages } from "@/server/dal/emails";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice } from "@/server/dal/invoices";

export const metadata: Metadata = { title: "Invoice history" };

export default async function InvoiceHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOwner();
  const { id } = await params;
  const inv = await getInvoice(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [events, emails] = await Promise.all([
    invoiceHistory(actor, id),
    listEmailMessages(actor, { kind: "INVOICE", id }),
  ]);
  const chain = [inv.replaces, inv.replacedBy].filter(Boolean);
  return (
    <>
      <PageHeader
        title={
          <>
            History <Mono className="text-app-title text-ink-subtle">{inv.number ?? "Draft"}</Mono>
          </>
        }
        breadcrumb={[
          { href: "/invoices", label: "Invoices" },
          { href: `/invoices/${id}`, label: inv.number ?? "Draft" },
        ]}
      />
      <div className="flex flex-col gap-6">
        {chain.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Reissue chain</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1 text-app-body">
                {inv.replaces ? (
                  <li>
                    Replaces{" "}
                    <Link href={`/invoices/${inv.replaces.id}`} className="text-link">
                      <Mono>{inv.replaces.number ?? "draft"}</Mono>
                    </Link>
                  </li>
                ) : null}
                {inv.replacedBy ? (
                  <li>
                    Replaced by{" "}
                    <Link href={`/invoices/${inv.replacedBy.id}`} className="text-link">
                      <Mono>{inv.replacedBy.number ?? "a draft"}</Mono>
                    </Link>{" "}
                    <Pill>{inv.replacedBy.status.toLowerCase()}</Pill>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Audit trail</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Who</TH>
                  <TH>Action</TH>
                  <TH>Summary</TH>
                </TR>
              </THead>
              <TBody>
                {events.length === 0 ? (
                  <TableEmpty colSpan={4}>No events yet.</TableEmpty>
                ) : (
                  events.map((e) => (
                    <TR key={e.id}>
                      <TD mono className="whitespace-nowrap">
                        {formatDateTime(new Date(e.createdAt), "en-GB", actor.timezone)}
                      </TD>
                      <TD>{e.actorName ?? e.actorEmail ?? "System"}</TD>
                      <TD mono>{e.action}</TD>
                      <TD>{e.summary ?? "—"}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Emails</CardTitle>
          </CardHeader>
          <CardContent>
            <SentLog rows={emails} timeZone={actor.timezone} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
