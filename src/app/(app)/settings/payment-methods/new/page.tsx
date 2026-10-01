import type { Metadata } from "next";
import { PaymentMethodForm } from "@/components/forms/payment-method-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwner } from "@/server/auth";

export const metadata: Metadata = { title: "New payment method" };

export default async function NewPaymentMethodPage() {
  await requireOwner();
  return (
    <>
      <PageHeader
        title="New payment method"
        breadcrumb={[{ href: "/settings/payment-methods", label: "Payment methods" }]}
      />
      <PaymentMethodForm method={null} />
    </>
  );
}
