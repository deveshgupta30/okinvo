import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InvoiceBuilder } from "@/components/invoices/builder";
import { PageHeader } from "@/components/ui/page-header";
import { withFlash } from "@/lib/flash";
import { requireRole } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { builderContext } from "@/server/dal/invoice-builder";
import { getInvoice } from "@/server/dal/invoices";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoices.edit");
  return { title: t("metaTitle") };
}

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const { id } = await params;
  const t = await getTranslations("invoices.edit");
  const ts = await getTranslations("invoices.shared");
  const invoice = await getInvoice(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (invoice.status !== "DRAFT") {
    redirect(
      withFlash(`/invoices/${id}`, {
        kind: "info",
        message: t("immutableFlash"),
      }),
    );
  }
  const context = await builderContext(actor, { invoiceId: id });
  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={[
          { href: "/invoices", label: ts("invoices") },
          { href: `/invoices/${id}`, label: ts("draft") },
        ]}
      />
      <InvoiceBuilder context={context} invoiceId={id} />
    </>
  );
}
