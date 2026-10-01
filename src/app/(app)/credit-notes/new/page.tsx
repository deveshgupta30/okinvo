import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { CreditNoteBuilder } from "@/components/credit-notes/builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { prisma } from "@/lib/db";
import { withFlash } from "@/lib/flash";
import { formatMoney } from "@/lib/format";
import { D } from "@/lib/money";
import { requireOwner } from "@/server/auth";
import { defaultCreditNoteDate } from "@/server/dal/credit-notes";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice, listInvoices } from "@/server/dal/invoices";
import { resolveTemplateConfig } from "@/server/dal/templates";

export const metadata: Metadata = { title: "New credit note" };

export default async function NewCreditNotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
  const { invoice: invoiceId } = await searchParams;
  if (typeof invoiceId !== "string") {
    // No invoice chosen yet: pick one of the issued invoices with something left to credit.
    const open = (await listInvoices(actor, {})).filter(
      (r) => r.status === "ISSUED" && D(r.balanceDue).gt(0),
    );
    return (
      <>
        <PageHeader
          title="New credit note"
          description="A credit note is raised against an issued invoice and reduces its balance."
          breadcrumb={[{ href: "/credit-notes", label: "Credit notes" }]}
        />
        {open.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nothing to credit"
            description="Credit notes need an issued invoice with an outstanding balance."
            action={
              <Button asChild variant="secondary">
                <Link href="/invoices">Open the invoices</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Which invoice?</CardTitle>
            </CardHeader>
            <CardContent>
              <form method="get" action="/credit-notes/new" className="flex flex-col gap-4">
                <Field label="Invoice" htmlFor="invoice" required>
                  <Select id="invoice" name="invoice" defaultValue={open[0]?.id ?? ""}>
                    {open.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.number} · {r.clientName} · balance{" "}
                        {formatMoney(r.balanceDue, r.currency, r.locale)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div>
                  <Button type="submit">Continue</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </>
    );
  }
  const invoice = await getInvoice(actor, invoiceId).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (invoice.status !== "ISSUED") {
    redirect(
      withFlash(`/invoices/${invoiceId}`, {
        kind: "error",
        message: "Credit notes are raised against issued invoices only.",
      }),
    );
  }
  const config = await resolveTemplateConfig(prisma, invoice.issuerProfileId);
  return (
    <>
      <PageHeader
        title="New credit note"
        breadcrumb={[
          { href: "/invoices", label: "Invoices" },
          { href: `/invoices/${invoiceId}`, label: invoice.number ?? "Invoice" },
        ]}
      />
      <CreditNoteBuilder
        invoice={invoice}
        config={config}
        creditNote={null}
        today={defaultCreditNoteDate(actor)}
      />
    </>
  );
}
