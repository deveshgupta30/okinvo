import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoices.payments");
  return { title: t("title") };
}

/** Ledger entry kind → its pill tone and `invoices.payments.kinds` catalogue key. */
const KIND = {
  PAYMENT: { key: "payment", tone: "success" },
  REFUND: { key: "refund", tone: "warning" },
  WRITE_OFF: { key: "writeOff", tone: "neutral" },
} as const satisfies Record<
  "PAYMENT" | "REFUND" | "WRITE_OFF",
  { key: string; tone: "success" | "warning" | "neutral" }
>;

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
  const t = await getTranslations("invoices.payments");
  const ts = await getTranslations("invoices.shared");
  const tc = await getTranslations("common");
  return (
    <>
      <PageHeader
        title={
          <>
            {t("title")}
            {invoice.number ? (
              <Mono className="text-app-title text-ink-subtle">{invoice.number}</Mono>
            ) : null}
          </>
        }
        breadcrumb={[
          { href: "/invoices", label: ts("invoices") },
          { href: `/invoices/${id}`, label: invoice.number ?? ts("draft") },
        ]}
        description={t("description", { client: invoice.clientName, total: money(invoice.total) })}
        actions={
          <Button asChild variant="tertiary">
            <Link href={`/invoices/${id}`}>{t("backToInvoice")}</Link>
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("ledger")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>{t("columns.date")}</TH>
                    <TH>{t("columns.kind")}</TH>
                    <TH numeric>{t("columns.applied")}</TH>
                    <TH numeric>{t("columns.tds")}</TH>
                    <TH>{t("columns.received")}</TH>
                    <TH>{t("columns.reference")}</TH>
                    <TH numeric>{t("columns.balance")}</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {ledger.rows.length === 0 ? (
                    <TableEmpty colSpan={8}>{t("noPayments")}</TableEmpty>
                  ) : (
                    ledger.rows.map((p) => (
                      <TR key={p.id}>
                        <TD mono>{formatDate(p.paymentDate, invoice.locale)}</TD>
                        <TD>
                          <Pill tone={KIND[p.kind].tone}>{t(`kinds.${KIND[p.kind].key}`)}</Pill>
                        </TD>
                        <TD numeric>
                          <Amount>{money(p.amountApplied)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount>
                            {p.tdsDeducted === "0.00" || p.tdsDeducted === "0"
                              ? tc("emptyValue")
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
                            (p.paymentMethodName ?? tc("emptyValue"))
                          )}
                        </TD>
                        <TD mono>{p.reference ?? tc("emptyValue")}</TD>
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
                                  {t("receipt")}
                                </a>
                              </Button>
                            ) : null}
                            <Button asChild variant="tertiary" size="sm">
                              <Link href={`/invoices/${id}/payments?edit=${p.id}`}>
                                {tc("edit")}
                              </Link>
                            </Button>
                            <ConfirmAction
                              action={deletePaymentAction}
                              title={t("deleteEntryTitle")}
                              description={t("deleteEntryDescription")}
                              confirmLabel={tc("delete")}
                              hidden={{ id: p.id, invoiceId: id }}
                              trigger={tc("delete")}
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
              <CardTitle>{t("totals")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <Item label={t("invoiceTotal")}>
                  <Amount>{money(invoice.total)}</Amount>
                </Item>
                <Item label={t("credited")}>
                  <Amount>{money(invoice.amountCredited)}</Amount>
                </Item>
                <Item label={t("title")}>
                  <Amount>{money(ledger.totals.byKind.PAYMENT)}</Amount>
                </Item>
                <Item label={t("refunds")}>
                  <Amount>{money(ledger.totals.byKind.REFUND)}</Amount>
                </Item>
                <Item label={t("writeOffs")}>
                  <Amount>{money(ledger.totals.byKind.WRITE_OFF)}</Amount>
                </Item>
                <Item label={t("tdsDeducted")}>
                  <Amount>{money(ledger.totals.tdsDeducted)}</Amount>
                </Item>
                <Item label={t("bankFees")}>
                  <Amount>{money(ledger.totals.bankFees)}</Amount>
                </Item>
                <Item label={t("balanceDue")}>
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
                <p className="text-app-body text-ink-subtle">{t("onlyIssued")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
