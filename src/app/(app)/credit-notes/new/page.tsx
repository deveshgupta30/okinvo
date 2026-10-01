import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CreditNoteBuilder } from "@/components/credit-notes/builder";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/db";
import { withFlash } from "@/lib/flash";
import { requireOwner } from "@/server/auth";
import { defaultCreditNoteDate } from "@/server/dal/credit-notes";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice } from "@/server/dal/invoices";
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
    redirect(
      withFlash("/invoices", {
        kind: "info",
        message: "Open an issued invoice and choose “Credit note”.",
      }),
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
