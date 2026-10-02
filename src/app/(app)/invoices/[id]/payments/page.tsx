import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { PaymentForm } from "@/components/payments/payment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, Item } from "@/components/ui/description-list";
import { Amount, Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { todayIn } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";
import { deletePaymentAction } from "@/server/actions/payments";
import { requireRole } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { listPaymentMethods } from "@/server/dal/payment-methods";
import { getPayment, listPayments } from "@/server/dal/payments";

export const metadata: Metadata = { title: "Payments" };

const KIND: Record<
  "PAYMENT" | "REFUND" | "WRITE_OFF",
  { label: string; tone: "success" | "warning" | "neutral" }
> = {
  PAYMENT: { label: "Payment", tone: "success" },
  REFUND: { label: "Refund", tone: "warning" },
  WRITE_OFF: { label: "Write-off", tone: "neutral" },
};

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("EDITOR");
  const { id } = await params;
  const { edit } = await searchParams;
  const ledger = await listPayments(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [methods, editing] = await Promise.all([
    listPaymentMethods(actor, { activeOnly: true }),
    typeof edit === "string" ? getPayment(actor, edit) : Promise.resolve(null),
  ]);
  const { invoice } = ledger;
  const money = (v: string) => formatMoney(v, invoice.currency, invoice.locale);
  return (
    <>
      <PageHeader
        title={
          <>
            Payments
            {invoice.number ? (
              <Mono className="text-app-title text-ink-subtle">{invoice.number}</Mono>
            ) : null}
          </>
        }
        breadcrumb={[
          { href: "/invoices", label: "Invoices" },
          { href: `/invoices/${id}`, label: invoice.number ?? "Draft" },
        ]}
        description={`${invoice.clientName} · ${money(invoice.total)} total`}
        actions={
          <Button asChild variant="tertiary">
            <Link href={`/invoices/${id}`}>Back to invoice</Link>
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Kind</TH>
                    <TH numeric>Applied</TH>
                    <TH numeric>TDS</TH>
                    <TH>Received</TH>
                    <TH>Reference</TH>
                    <TH numeric>Balance</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {ledger.rows.length === 0 ? (
                    <TableEmpty colSpan={8}>No payments recorded yet.</TableEmpty>
                  ) : (
                    ledger.rows.map((p) => (
                      <TR key={p.id}>
                        <TD mono>{formatDate(p.paymentDate, invoice.locale)}</TD>
                        <TD>
                          <Pill tone={KIND[p.kind].tone}>{KIND[p.kind].label}</Pill>
                        </TD>
                        <TD numeric>
                          <Amount>{money(p.amountApplied)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount>
                            {p.tdsDeducted === "0.00" || p.tdsDeducted === "0"
                              ? "—"
                              : money(p.tdsDeducted)}
                          </Amount>
                        </TD>
                        <TD className="text-ink-subtle">
                          {p.receivedAmount && p.receivedCurrency ? (
                            <Mono>
                              {formatMoney(p.receivedAmount, p.receivedCurrency, invoice.locale)} @{" "}
                              {p.exchangeRate}
                            </Mono>
                          ) : (
                            (p.paymentMethodName ?? "—")
                          )}
                        </TD>
                        <TD mono>{p.reference ?? "—"}</TD>
                        <TD numeric>
                          <Amount>{money(p.runningBalance)}</Amount>
                        </TD>
                        <TD className="text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            {p.receiptAssetId ? (
                              <Button asChild variant="tertiary" size="sm">
                                <a
                                  href={`/api/assets/id/${p.receiptAssetId}`}
                                  target="_blank"
                                  rel="noopener"
                                >
                                  Receipt
                                </a>
                              </Button>
                            ) : null}
                            <Button asChild variant="tertiary" size="sm">
                              <Link href={`/invoices/${id}/payments?edit=${p.id}`}>Edit</Link>
                            </Button>
                            <ConfirmAction
                              action={deletePaymentAction}
                              title="Delete this entry?"
                              description="The invoice balance is recomputed."
                              confirmLabel="Delete"
                              hidden={{ id: p.id, invoiceId: id }}
                              trigger="Delete"
                              triggerVariant="tertiary"
                              size="sm"
                              destructive
                            />
                          </div>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <Item label="Invoice total">
                  <Amount>{money(invoice.total)}</Amount>
                </Item>
                <Item label="Credited">
                  <Amount>{money(invoice.amountCredited)}</Amount>
                </Item>
                <Item label="Payments">
                  <Amount>{money(ledger.totals.byKind.PAYMENT)}</Amount>
                </Item>
                <Item label="Refunds">
                  <Amount>{money(ledger.totals.byKind.REFUND)}</Amount>
                </Item>
                <Item label="Write-offs">
                  <Amount>{money(ledger.totals.byKind.WRITE_OFF)}</Amount>
                </Item>
                <Item label="TDS deducted">
                  <Amount>{money(ledger.totals.tdsDeducted)}</Amount>
                </Item>
                <Item label="Bank fees">
                  <Amount>{money(ledger.totals.bankFees)}</Amount>
                </Item>
                <Item label="Balance due">
                  <Amount className="text-app-section">{money(invoice.balanceDue)}</Amount>
                </Item>
              </DescriptionList>
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0">
          {invoice.status === "ISSUED" ? (
            <PaymentForm
              invoiceId={id}
              currency={invoice.currency}
              today={todayIn(actor.timezone)}
              methods={methods}
              payment={editing}
            />
          ) : (
            <Card>
              <CardContent>
                <p className="text-app-body text-ink-subtle">
                  Only issued invoices accept payments.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
