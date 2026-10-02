import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CreditNoteBuilder } from "@/components/credit-notes/builder";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/db";
import { withFlash } from "@/lib/flash";
import { requireRole } from "@/server/auth";
import { defaultCreditNoteDate, getCreditNote } from "@/server/dal/credit-notes";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice } from "@/server/dal/invoices";
import { resolveTemplateConfig } from "@/server/dal/templates";

export const metadata: Metadata = { title: "Edit credit note" };

export default async function EditCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const { id } = await params;
  const cn = await getCreditNote(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (cn.status !== "DRAFT") {
    redirect(
      withFlash(`/credit-notes/${id}`, {
        kind: "info",
        message: "Issued credit notes are immutable.",
      }),
    );
  }
  const [invoice, config] = await Promise.all([
    getInvoice(actor, cn.invoiceId),
    resolveTemplateConfig(prisma, cn.issuerProfileId),
  ]);
  return (
    <>
      <PageHeader
        title="Edit draft credit note"
        breadcrumb={[
          { href: "/credit-notes", label: "Credit notes" },
          { href: `/credit-notes/${id}`, label: "Draft" },
        ]}
      />
      <CreditNoteBuilder
        invoice={invoice}
        config={config}
        creditNote={cn}
        today={defaultCreditNoteDate(actor)}
      />
    </>
  );
}
