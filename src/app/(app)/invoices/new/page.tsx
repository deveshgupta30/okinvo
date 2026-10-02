import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceBuilder } from "@/components/invoices/builder";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { FileText } from "lucide-react";
import { requireRole } from "@/server/auth";
import { builderContext } from "@/server/dal/invoice-builder";

export const metadata: Metadata = { title: "New invoice" };

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
  return (
    <>
      <PageHeader title="New invoice" breadcrumb={[{ href: "/invoices", label: "Invoices" }]} />
      {context.profiles.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Create an issuer profile first"
          description="An invoice is issued from a legal identity: set up your profile with its tax IDs and numbering."
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/profiles/new">Create a profile</Link>
            </Button>
          }
        />
      ) : (
        <InvoiceBuilder context={context} invoiceId={null} />
      )}
    </>
  );
}
