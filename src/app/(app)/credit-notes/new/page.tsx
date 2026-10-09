import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getTranslations } from "next-intl/server";
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
import { requireRole } from "@/server/auth";
import { defaultCreditNoteDate } from "@/server/dal/credit-notes";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice, listInvoices } from "@/server/dal/invoices";
import { resolveTemplateConfig } from "@/server/dal/templates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creditNotes.new");
  return { title: t("metaTitle") };
}

export default async function NewCreditNotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("EDITOR");
  const t = await getTranslations("creditNotes.new");
  const tn = await getTranslations("shell.nav");
  const tc = await getTranslations("common");
  const { invoice: invoiceId } = await searchParams;
  if (typeof invoiceId !== "string") {
    // No invoice chosen yet: pick one of the issued invoices with something left to credit.
    const open = (await listInvoices(actor, {})).filter(
      (r) => r.status === "ISSUED" && D(r.balanceDue).gt(0),
    );
    return (
      <>
        <PageHeader
          title={t("title")}
          description={t("description")}
          breadcrumb={[{ href: "/credit-notes", label: tn("creditNotes") }]}
        />
        {open.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={t("nothingToCredit.title")}
            description={t("nothingToCredit.description")}
            action={
              <Button asChild variant="secondary">
                <Link href="/invoices">{t("nothingToCredit.openInvoices")}</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("whichInvoice")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form method="get" action="/credit-notes/new" className="flex flex-col gap-4">
                <Field label={t("invoice")} htmlFor="invoice" required>
                  <Select id="invoice" name="invoice" defaultValue={open[0]?.id ?? ""}>
                    {open.map((r) => (
                      <option key={r.id} value={r.id}>
                        {t("invoiceOption", {
                          number: r.number ?? "",
                          client: r.clientName,
                          balance: formatMoney(r.balanceDue, r.currency, r.locale),
                        })}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div>
                  <Button type="submit">{tc("continue")}</Button>
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
        message: t("issuedOnly"),
      }),
    );
  }
  const config = await resolveTemplateConfig(prisma, invoice.issuerProfileId);
  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={[
          { href: "/invoices", label: tn("invoices") },
          { href: `/invoices/${invoiceId}`, label: invoice.number ?? t("invoiceFallback") },
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
