import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InvoiceBuilder } from "@/components/invoices/builder";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { FileText } from "lucide-react";
import { requireRole } from "@/server/auth";
import { builderContext } from "@/server/dal/invoice-builder";

export async function generateMetadata(): Promise<Metadata> {
  const ts = await getTranslations("invoices.shared");
  return { title: ts("newInvoice") };
}

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("EDITOR");
  const params = await searchParams;
  const context = await builderContext(actor, {
    clientId: typeof params.client === "string" ? params.client : null,
    issuerProfileId: typeof params.issuer === "string" ? params.issuer : null,
  });
  const t = await getTranslations("invoices.new");
  const ts = await getTranslations("invoices.shared");
  return (
    <>
      <PageHeader
        title={ts("newInvoice")}
        breadcrumb={[{ href: "/invoices", label: ts("invoices") }]}
      />
      {context.profiles.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("noProfileTitle")}
          description={t("noProfileDescription")}
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/profiles/new">{t("createProfile")}</Link>
            </Button>
          }
        />
      ) : (
        <InvoiceBuilder context={context} invoiceId={null} />
      )}
    </>
  );
}
