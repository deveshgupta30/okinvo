import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InvoiceBuilder } from "@/components/invoices/builder";
import { PageHeader } from "@/components/ui/page-header";
import { withFlash } from "@/lib/flash";
import { requireOwner } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { builderContext } from "@/server/dal/invoice-builder";
import { getInvoice } from "@/server/dal/invoices";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOwner();
  const { id } = await params;
  const invoice = await getInvoice(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (invoice.status !== "DRAFT") {
    redirect(
      withFlash(`/invoices/${id}`, {
        kind: "info",
        message: "Issued invoices are immutable. Use “Void & reissue” to correct it.",
      }),
    );
  }
  const context = await builderContext(actor, { invoiceId: id });
  return (
    <>
      <PageHeader
        title="Edit draft"
        breadcrumb={[
          { href: "/invoices", label: "Invoices" },
          { href: `/invoices/${id}`, label: "Draft" },
        ]}
      />
      <InvoiceBuilder context={context} invoiceId={id} />
    </>
  );
}
